import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {digest,canonical,text} from './core.mjs';
import {verifyReconFiles,reconHeaderFileIds} from './recon-files.mjs';
import {capturedMonth} from './recon-semantics.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const D=v=>new Prisma.Decimal(String(v));
const money='(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\.[0-9]{2}';
export function ocrUsdCandidates(raw){return [...new Set([...raw.matchAll(new RegExp('(?<![0-9,.+\\-])('+money+')\\s+USD\\b','gi'))].map(m=>D(m[1].replaceAll(',','')).toFixed()))];}
export function compareObservedPayable(actual,observed){
 if(!['number','string'].includes(typeof actual)||!/^\d+(?:\.\d+)?$/.test(String(actual)))return {state:'UNAVAILABLE',actual:null,observed};
 const a=D(actual),b=D(observed);return {state:a.eq(b)?'MATCH':'MISMATCH',actual:a.toFixed(),observed:b.toFixed(),difference:a.minus(b).toFixed()};
}
async function evidence(root,f){
 if(!f||!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/.test(f.sha256)||typeof f.relativePath!=='string'||!/^[A-Za-z0-9_.-]+$/.test(f.relativePath))throw Error('Invalid OCR evidence metadata');
 const path=resolve(root,f.relativePath);if((await lstat(path)).isSymbolicLink())throw Error('OCR evidence cannot be a symlink');
 const actual=await realpath(path),rel=relative(root,actual);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('OCR evidence escaped root');
 const data=await readFile(actual);if(data.length!==f.size||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('OCR evidence checksum differs');return data;
}
// Visual observations are pinned review evidence, never approval or corrections.
// Five historical scans expose only Payable USD; absent USD columns stay absent.
export async function reviewReconOcr(snapshot,sourceManifest,sourceRoot,sourcePin,manifest,root,pin){
 const custody=await verifyReconFiles(snapshot,sourceManifest,sourceRoot,sourcePin),{manifestHash,...body}=manifest??{};
 if(!/^[a-f0-9]{64}$/.test(pin??'')||pin!==manifestHash||digest(body)!==pin||manifest.format!=='dgc-recon-ocr-evidence-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.sourceManifestHash!==sourcePin||manifest.acceptance!==false||manifest.postingAllowed!==false||!Array.isArray(manifest.files))throw Error('Invalid pinned OCR evidence manifest');
 const base=await realpath(root),files=[],seen=new Set(),headers=snapshot.tables['43_RECON_PDF_HEADER'];
 for(const f of manifest.files){
  const original=sourceManifest.files.find(x=>x.fileId===f.fileId);
  if(!original||f.pdfSha256!==original.sha256||seen.has(f.fileId)||canonical(f.sourceHeaders)!==canonical(original.sourceHeaders))throw Error('OCR original provenance differs');seen.add(f.fileId);
  const o=f.observed;
  if(o?.method!=='CODEX_VISUAL_REVIEW'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.period??'')||!/^\d+\.\d{2}$/.test(o.payableUsd??'')||typeof o.serviceText!=='string'||!['HEADER_AND_FOOTER','FOOTER_ONLY'].includes(o.identityCoverage))throw Error('Invalid visual observation');
  await evidence(base,f.visualRender);await evidence(base,f.ocrRender);
  if(!Array.isArray(f.passes)||f.passes.length!==2||canonical(f.passes.map(p=>p.psm).sort())!==canonical([3,6]))throw Error('OCR needs both recorded passes');
  const passes=[];
  for(const p of f.passes){const raw=(await evidence(base,p.text)).toString('utf8');await evidence(base,p.tsv);const candidates=ocrUsdCandidates(raw);passes.push({psm:p.psm,candidates,state:candidates.length===1&&D(candidates[0]).eq(o.payableUsd)?'OCR_AGREES_WITH_VISUAL_OBSERVATION':'OCR_REQUIRES_VISUAL_REVIEW',textSha256:p.text.sha256,tsvSha256:p.tsv.sha256});}
  const hs=headers.rows.filter(h=>reconHeaderFileIds(h).includes(f.fileId));
  const entries=[];
  for(const h of hs)for(const r of snapshot.tables['40_MONTHLY_REVENUE'].rows.filter(r=>text(r.values.Source_Recon_Doc_ID)===text(h.legacyId))){
   const v=r.values,period=capturedMonth(r,'Revenue_Month'),periodMatches=period===o.period&&capturedMonth(h,'Period_Month')===o.period;
   const payable=compareObservedPayable(v.Invoice_Payable_USD,o.payableUsd),scope=v.Currency==='USD'&&text(v.Revenue_Row_Type).toUpperCase()==='TOTAL';
   const serviceIdentityMatches=text(h.values.Service_Header).toUpperCase().replace(/\s+/g,' ')===o.serviceText.toUpperCase().replace(/\s+/g,' '),uniqueHeader=hs.length===1&&reconHeaderFileIds(h).length===1&&headers.rows.filter(x=>x.legacyId===h.legacyId).length===1;
   entries.push({source:{sheet:'40_MONTHLY_REVENUE',sheetId:snapshot.tables['40_MONTHLY_REVENUE'].sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash},periodMatches,serviceIdentityMatches,uniqueHeader,identityCoverage:o.identityCoverage,scopeMatches:scope,payable,state:!scope||!periodMatches?'SOURCE_IDENTITY_REQUIRES_REVIEW':payable.state!=='MATCH'?'OBSERVED_PAYABLE_REQUIRES_REVIEW':!serviceIdentityMatches||!uniqueHeader||o.identityCoverage!=='HEADER_AND_FOOTER'?'OBSERVED_PAYABLE_MATCH_IDENTITY_REVIEW_PENDING':'OBSERVED_PAYABLE_MATCH_REMAINING_GATES_PENDING',invoiceRevenueUsdVerified:false,invoiceWhtUsdVerified:false,readyToImport:false});
  }
  files.push({fileId:f.fileId,pdfSha256:f.pdfSha256,sourceHeaders:f.sourceHeaders,observed:o,visualRender:f.visualRender,ocrRender:f.ocrRender,passes,entries,readyToImport:false});
 }
 for(const f of manifest.toolEvidence??[])await evidence(base,f);
 const report={format:'dgc-recon-ocr-review-v1',snapshotHash:snapshot.snapshotHash,sourceManifestHash:sourcePin,ocrManifestHash:pin,custody,engine:manifest.engine,files,counts:files.flatMap(f=>f.entries).reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),scope:'PINNED_VISUAL_PAYABLE_OBSERVATIONS_WITH_LOCAL_OCR_NO_FX_OR_REPAIR',postingAllowed:false,acceptance:false,pdfSemanticsVerified:false};
 return {...report,reviewHash:digest(report)};
}
