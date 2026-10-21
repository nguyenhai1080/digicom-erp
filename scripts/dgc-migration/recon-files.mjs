import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {verifySnapshot,canonical,digest,text} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
const addr=(t,r)=>({sheet:'43_RECON_PDF_HEADER',sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
export function reconHeaderFileIds(r){
 const ids=[];
 for(const raw of [r.values.Source_File_URL,r.cells.Source_File_URL?.hyperlink]){
  const s=text(raw);if(/^[A-Za-z0-9_-]{20,}$/.test(s)){ids.push(s);continue;}
  try{const u=new URL(s);if(u.protocol==='https:'&&u.hostname==='drive.google.com'){const id=u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1]??u.searchParams.get('id');if(id&&/^[A-Za-z0-9_-]{20,}$/.test(id))ids.push(id);}}catch{ /* display labels are not file IDs */ }
 }
 return [...new Set(ids)].sort();
}
export function reconFilePlan(snapshot){
 verifySnapshot(snapshot);const table=snapshot.tables['43_RECON_PDF_HEADER'],files=new Map(),headers=[];
 for(const r of table.rows){const source=addr(table,r),fileIds=reconHeaderFileIds(r),state=fileIds.length===1?'EXACT':fileIds.length?'CONFLICTING':'UNRESOLVED';headers.push({source,fileIds,state});
  for(const fileId of fileIds){const f=files.get(fileId)??{fileId,sourceHeaders:[]};f.sourceHeaders.push(source);files.set(fileId,f);}
 }
 const body={format:'dgc-recon-file-plan-v1',snapshotHash:snapshot.snapshotHash,sourceHeaders:headers.length,headers,files:[...files.values()].sort((a,b)=>a.fileId.localeCompare(b.fileId)),unresolvedHeaders:headers.filter(h=>h.state!=='EXACT'),postingAllowed:false,acceptance:false};
 return {...body,planHash:digest(body)};
}
export function verifyReconFilePlan(plan,snapshot){const {planHash,...body}=plan??{};if(plan?.format!=='dgc-recon-file-plan-v1'||planHash!==digest(body)||canonical(plan)!==canonical(reconFilePlan(snapshot)))throw Error('Recon file plan differs from verified snapshot');return plan;}

// File custody proves the captured bytes and row binding only. It does not
// establish authenticity, signed status, PDF semantics or financial acceptance.
export async function verifyReconFiles(snapshot,manifest,root,expectedManifestHash){
 const plan=reconFilePlan(snapshot),{manifestHash,...body}=manifest??{};
 if(!/^[a-f0-9]{64}$/.test(expectedManifestHash??'')||manifestHash!==expectedManifestHash)throw Error('Expected recon file manifest digest mismatch');
 if(manifest?.format!=='dgc-source-recon-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.filePlanHash!==plan.planHash||manifest.acceptance!==false||manifest.postingAllowed!==false||manifestHash!==digest(body)||!Array.isArray(manifest.files))throw Error('Invalid recon file manifest or snapshot');
 const expected=new Map(plan.files.map(f=>[f.fileId,f])),seen=new Set(),base=await realpath(root);let bytes=0;
 for(const f of manifest.files){
  if(seen.has(f.fileId)||!expected.has(f.fileId)||canonical(f.sourceHeaders)!==canonical(expected.get(f.fileId).sourceHeaders))throw Error('Recon PDF source coverage or provenance mismatch');seen.add(f.fileId);
  if(f.relativePath!==f.fileId+'.pdf'||f.mimeType!=='application/pdf'||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid recon PDF metadata');
  const target=resolve(base,f.relativePath);if((await lstat(target)).isSymbolicLink())throw Error('Recon PDF cannot be a symbolic link');
  const actual=await realpath(target),rel=relative(base,actual);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Recon PDF escaped private evidence directory');
  const data=await readFile(actual);if(data.length!==f.size||data.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Recon PDF byte checksum mismatch');bytes+=data.length;
 }
 const missingFiles=plan.files.filter(f=>!seen.has(f.fileId)).map(f=>f.fileId),complete=!missingFiles.length&&!plan.unresolvedHeaders.length;
 if(manifest.complete!==complete)throw Error('Recon PDF manifest completeness does not match source coverage');
 return {integrityVerified:true,complete,snapshotHash:snapshot.snapshotHash,filePlanHash:plan.planHash,manifestHash,files:seen.size,expectedFiles:expected.size,sourceHeaders:plan.sourceHeaders,unresolvedHeaders:plan.unresolvedHeaders,missingFiles,bytes,pdfSemanticsVerified:false,postingAllowed:false,acceptance:false};
}

export async function reviewRevenueCustody(snapshot,targetPlan,manifest,root,expectedManifestHash,decisions){
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);const files=await verifyReconFiles(snapshot,manifest,root,expectedManifestHash),plan=reconFilePlan(snapshot),headers=new Map(plan.headers.map(h=>[h.source.sourceRow,h])),present=new Set(manifest.files.map(f=>f.fileId));
 const groups=targetPlan.groups.map(g=>{const h=g.documentSource?headers.get(g.documentSource.sourceRow):null;
  const sameSource=h&&canonical(h.source)===canonical(g.documentSource),fileId=sameSource&&h.state==='EXACT'?h.fileIds[0]:null;
  const custodyState=!fileId?'SOURCE_REFERENCE_REQUIRES_REVIEW':fileId!==g.sourceFileId?'TARGET_FILE_REFERENCE_DIFFERS':present.has(fileId)?'CAPTURED_BYTES_VERIFIED':'FILE_NOT_CAPTURED';
  return {groupKey:g.groupKey,sourceDocument:g.documentSource,sourceFileId:fileId,businessState:g.state,businessReasons:g.reasons,custodyState,revenueRows:g.entries.length,nextReviewPossible:g.state==='REHEARSABLE'&&custodyState==='CAPTURED_BYTES_VERIFIED',readyToImport:false,postingAllowed:false};});
 const body={format:'dgc-revenue-custody-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,filePlanHash:plan.planHash,manifestHash:manifest.manifestHash,files,groups,counts:groups.reduce((a,g)=>(a[g.custodyState]=(a[g.custodyState]??0)+1,a),{}),nextReviewGroups:groups.filter(g=>g.nextReviewPossible).length,nextReviewRevenueRows:groups.filter(g=>g.nextReviewPossible).reduce((n,g)=>n+g.revenueRows,0),postingAllowed:false,acceptance:false,pdfSemanticsVerified:false};
 return {...body,reviewHash:digest(body)};
}
