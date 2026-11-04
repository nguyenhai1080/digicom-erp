import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {canonical,digest,verifySnapshot} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),D=v=>new Prisma.Decimal(String(v)),pin='5ccca618827618476f3dd074e0b49c133a477e550814228a445fa406e564f569';
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash}),same=(a,b)=>canonical(a)===canonical(b);
async function bytes(root,name,proof){const base=await realpath(root),path=resolve(base,name),stat=await lstat(path),actual=await realpath(path),rel=relative(base,actual);if(stat.isSymbolicLink()||!stat.isFile()||!rel||rel.startsWith('..')||isAbsolute(rel)||stat.size!==proof.size||stat.size>64*1024*1024)throw Error('Visual USD file path/size differs');const b=await readFile(path);if(b.length!==proof.size||createHash('sha256').update(b).digest('hex')!==proof.sha256)throw Error('Visual USD file bytes differ');return b;}
export async function verifyVisualUsdFiles({observations,root,renderRoot,python=process.env.DGC_PDF_PYTHON??'python3'}){
 const {observationHash,...body}=observations??{};if(observationHash!==pin||digest(body)!==pin)throw Error('Visual USD observation pin differs');
 const pdf=await bytes(root,observations.fileId+'.pdf',{size:observations.pdfSize,sha256:observations.pdfSha256});if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Visual USD source is not PDF');await bytes(renderRoot,observations.visualRender.relativePath,observations.visualRender);
 const {stdout}=await promisify(execFile)(python,[fileURLToPath(new URL('./extract-recon-text.py',import.meta.url)),root,observations.fileId],{maxBuffer:8*1024*1024}),parsed=JSON.parse(stdout),f=parsed.files?.[0];if(parsed.tool!=='pypdf'||parsed.files.length!==1||f.fileId!==observations.fileId||f.sha256!==observations.pdfSha256||f.error||f.pages.length!==observations.pages)throw Error('Visual USD fresh PDF parse differs');
}
export async function reviewVisualUsdSource(options){
 const {snapshot,targetPlan,manifest,manifestPin,observations,root,renderRoot,decisions}=options;
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 verifySnapshot(snapshot);const {observationHash,...obs}=observations??{}, {manifestHash,...manifestBody}=manifest??{};
 if(observationHash!==pin||digest(obs)!==pin||obs.snapshotHash!==snapshot.snapshotHash||obs.method!=='CODEX_VISUAL_REVIEW'||obs.acceptance!==false||obs.operationalFxDerived!==false||obs.nativeIdentityAccepted!==false||obs.sourceValuesChanged!==false||manifestHash!==manifestPin||digest(manifestBody)!==manifestPin||manifest.snapshotHash!==snapshot.snapshotHash)throw Error('Visual USD observation/manifest pin differs');
 const g=targetPlan.groups.find(g=>g.entries.some(e=>same(e.source,obs.source))),e=g?.entries[0];
 if(targetPlan.snapshotHash!==snapshot.snapshotHash||!g||g.state!=='REHEARSABLE'||g.reasons.length||g.entries.length!==1||e.sourceStatus!=='Approved'||e.aggregationMapping.rowType!=='TOTAL'||!e.aggregationMapping.includeInMonthlyTotal||!same(g.documentSource,obs.sourceHeader)||!same(e.bindings.Source_Recon_Detail_ID,obs.sourceDetail)||g.sourceFileId!==obs.fileId||g.period!==obs.identity.period||obs.identity.period!==obs.identity.footerPeriod)throw Error('Visual USD exact source scope differs');
 const h=snapshot.tables['43_RECON_PDF_HEADER'].rows.find(r=>same(addr('43_RECON_PDF_HEADER',snapshot.tables['43_RECON_PDF_HEADER'],r),obs.sourceHeader)),d=snapshot.tables['44_RECON_PDF_DETAIL'].rows.find(r=>same(addr('44_RECON_PDF_DETAIL',snapshot.tables['44_RECON_PDF_DETAIL'],r),obs.sourceDetail));
 if(!h||!d||d.values.Recon_Doc_ID!==h.legacyId||String(h.values.Service_Header).replace(/[^a-z0-9]/gi,'').toUpperCase()!==obs.identity.service||!D(h.values.Exchange_Rate).eq(obs.identity.printedExchangeRate))throw Error('Visual USD header/detail/printed rate binding differs');
 for(const [field,value] of Object.entries({...obs.usd,...obs.native}))if(!D(d.values[field]).eq(value))throw Error('Visual USD printed/detail amount differs');
 for(const [field,printed] of [['Invoice_Revenue_USD','Remuneration_Provider_USD'],['Invoice_WHT_USD','WHT_USD'],['Invoice_Payable_USD','Partner_Revenue_USD']])if(!D(e.capturedRevenue.values[field]).eq(obs.usd[printed]))throw Error('Visual USD captured revenue differs');
 if(!D(obs.footerPayable).eq(obs.usd.Partner_Revenue_USD))throw Error('Visual USD footer differs');
 const file=manifest.files.find(f=>f.fileId===obs.fileId);if(!file||file.sha256!==obs.pdfSha256||file.size!==obs.pdfSize||file.relativePath!==obs.fileId+'.pdf')throw Error('Visual USD PDF manifest binding differs');
 await verifyVisualUsdFiles(options);
 const body={format:'dgc-visual-usd-source-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,observationHash:pin,groupKey:g.groupKey,source:e.source,sourceHeader:obs.sourceHeader,sourceDetail:obs.sourceDetail,fileId:file.fileId,pdfSha256:file.sha256,identity:obs.identity,usd:obs.usd,footerPayable:obs.footerPayable,scope:'EXPLICIT_PRINTED_FULL_USD_AND_CAPTURED_SOURCE_CONCORDANCE',originalBytesVerified:true,nativeIdentityAccepted:false,operationalFxDerived:false,sourceValuesChanged:false,acceptance:false};return {...body,reviewHash:digest(body)};
}
