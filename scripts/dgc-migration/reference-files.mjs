import {lstat,realpath,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest,verifySnapshot} from './core.mjs';
import {verifyInvoiceReferenceReview} from './invoice-references.mjs';
const idPattern=/^[A-Za-z0-9_-]{20,200}$/,hex=/^[a-f0-9]{64}$/;
function fileId(raw){
 const s=String(raw??'').trim();if(idPattern.test(s))return s;
 try{const u=new URL(s);if(u.protocol==='https:'&&u.hostname==='drive.google.com'){const id=u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/)?.[1]??u.searchParams.get('id');if(idPattern.test(id??''))return id;}}catch{}
 return null;
}
export function referenceFilePlan(snapshot){
 verifySnapshot(snapshot);const documents=[],files=new Map();
 for(const [sheet,idField,urlField,kind] of [['53_SOA_HEADER','Pdf_File_ID','Pdf_File_URL','SOA'],['55_APPROVAL_PACKAGE','File_ID','File_URL','APPROVAL_PACKAGE']]){
  const table=snapshot.tables[sheet];for(const row of table.rows){
   const source={sheet,sheetId:table.sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash};
   const selectors=[{field:idField,value:row.values[idField]},{field:urlField,value:row.values[urlField]},{field:urlField+'.hyperlink',value:row.cells[urlField]?.hyperlink}].filter(s=>String(s.value??'').trim());
   const parsed=selectors.map(s=>({...s,fileId:fileId(s.value)})),ids=[...new Set(parsed.map(s=>s.fileId).filter(Boolean))].sort();
   // A populated malformed explicit ID cannot be rescued by another URL.
   const state=!ids.length?'UNRESOLVED':ids.length>1?'CONFLICTING':parsed.some(s=>s.field===idField&&!s.fileId)?'INVALID_EXPLICIT_ID':'EXACT';
   const d={source,kind,sourceStatus:row.values.Status??row.values.Approval_Status??null,fileIds:ids,state};documents.push(d);
   for(const id of ids){const f=files.get(id)??{fileId:id,sources:[]};f.sources.push(source);files.set(id,f);}
  }
 }
 const body={format:'dgc-reference-file-plan-v1',snapshotHash:snapshot.snapshotHash,documents,files:[...files.values()].sort((a,b)=>a.fileId.localeCompare(b.fileId)),unresolvedDocuments:documents.filter(d=>d.state!=='EXACT'),postingAllowed:false,acceptance:false};
 return {...body,planHash:digest(body)};
}

async function boundedBytes(root,name,maximum){
 if((await lstat(root)).isSymbolicLink())throw Error('Evidence root cannot be a symbolic link');
 const base=await realpath(root),target=resolve(base,name),info=await lstat(target),actual=await realpath(target),rel=relative(base,actual);
 if(info.isSymbolicLink()||!info.isFile()||!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel)||info.size>maximum)throw Error('Invalid evidence path or size');
 const handle=await open(target,'r');try{
  const stat=await handle.stat();if(stat.size!==info.size||stat.ino!==info.ino||stat.dev!==info.dev||!stat.isFile())throw Error('Evidence changed before read');
  const b=Buffer.alloc(info.size+1);let n=0;while(n<b.length){const r=await handle.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}
  if(n!==info.size||(await handle.stat()).size!==info.size)throw Error('Evidence changed during read');return b.subarray(0,n);
 }finally{await handle.close();}
}
// Byte custody only, never authenticity, signature, financial acceptance or a
// conversion of source Draft documents to ACTIVE target documents.
export async function verifyReferenceFiles(snapshot,manifest,root,manifestPin){
 const plan=referenceFilePlan(snapshot),{manifestHash,...body}=manifest??{};
 if(!hex.test(manifestPin??'')||manifestHash!==manifestPin||manifestHash!==digest(body)||manifest?.format!=='dgc-source-reference-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.filePlanHash!==plan.planHash||manifest.acceptance!==false||manifest.postingAllowed!==false||manifest.pdfSemanticsVerified!==false||!Array.isArray(manifest.files))throw Error('Pinned reference PDF manifest differs');
 const expected=new Map(plan.files.map(f=>[f.fileId,f])),seen=new Set();let bytes=0;
 for(const f of manifest.files){
  if(!idPattern.test(f.fileId??'')||seen.has(f.fileId)||!expected.has(f.fileId)||canonical(f.sources)!==canonical(expected.get(f.fileId).sources))throw Error('Reference PDF source coverage differs');seen.add(f.fileId);
  if(f.relativePath!==f.fileId+'.pdf'||f.mimeType!=='application/pdf'||!Number.isSafeInteger(f.size)||f.size<=0||f.size>64*1024*1024||!hex.test(f.sha256??''))throw Error('Invalid reference PDF metadata');
  const data=await boundedBytes(root,f.relativePath,64*1024*1024);
  if(data.length!==f.size||data.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Reference PDF bytes differ');bytes+=data.length;
 }
 const missingFiles=plan.files.filter(f=>!seen.has(f.fileId)).map(f=>f.fileId),complete=!missingFiles.length&&!plan.unresolvedDocuments.length;
 if(manifest.complete!==complete)throw Error('Reference PDF completeness differs');
 const documents=plan.documents.map(d=>({...d,custodyState:d.state!=='EXACT'?'SOURCE_FILE_REFERENCE_HELD':seen.has(d.fileIds[0])?'CAPTURED_BYTES_VERIFIED':'FILE_NOT_CAPTURED',readyToRegister:false}));
 return {integrityVerified:true,complete,snapshotHash:snapshot.snapshotHash,filePlanHash:plan.planHash,manifestHash,files:seen.size,expectedFiles:expected.size,bytes,missingFiles,documents,pdfSemanticsVerified:false,signedStatusVerified:false,registryWritesAllowed:false,postingAllowed:false,acceptance:false};
}

export async function reviewReferenceCustody(snapshot,references,reviewPin,manifest,root,manifestPin){
 if(!hex.test(reviewPin??'')||references?.reviewHash!==reviewPin)throw Error('Pinned Invoice reference review differs');
 verifyInvoiceReferenceReview(references,snapshot);
 const custody=await verifyReferenceFiles(snapshot,manifest,root,manifestPin),key=s=>s.sheet+'|'+s.sourceRow;
 const bySource=new Map(custody.documents.map(d=>[key(d.source),d]));
 const documents=references.documents.map(d=>{
  const f=bySource.get(key(d.source)),same=f&&canonical(f.source)===canonical(d.source),bytesVerified=!!same&&f.custodyState==='CAPTURED_BYTES_VERIFIED';
  const reasons=[];
  if(!same)reasons.push('DOCUMENT_HEADER_BINDING_HELD');
  if(!bytesVerified)reasons.push('DOCUMENT_PDF_CUSTODY_HELD');
  if(d.state==='DOCUMENT_REFERENCES_HELD')reasons.push('DOCUMENT_INVOICE_REFERENCES_HELD');
  const targets=[...new Map(d.references.filter(r=>r.proposedTarget).map(r=>[key(r.proposedTarget),r.proposedTarget])).values()];
  return {source:d.source,kind:d.kind,sourceStatus:d.sourceStatus,fileId:same&&f.state==='EXACT'?f.fileIds[0]:null,bytesVerified,proposedInvoiceSources:targets,referenceCount:d.references.length,state:reasons.length?'DOCUMENT_REHEARSAL_HELD':targets.length?'REFERENCES_AND_BYTES_CAPTURED_FOR_REHEARSAL':'NO_CAPTURED_INVOICE_REFERENCES',reasons,readyToRegister:false,localApprovalCreated:false,sourceStatusPromoted:false};
 });
 const byDocument=new Map(documents.map(d=>[key(d.source),d]));
 const invoices=references.invoices.map(i=>{
  const linked=i.donorReferences.map(r=>({source:r.source,documentSource:r.documentSource,documentState:byDocument.get(key(r.documentSource))?.state??'DOCUMENT_REHEARSAL_HELD'}));
  return {source:i.source,documents:linked,state:!linked.length?'NO_CAPTURED_REFERENCE_NOT_CANCELLATION_CLEARANCE':linked.every(d=>d.documentState==='REFERENCES_AND_BYTES_CAPTURED_FOR_REHEARSAL')?'REFERENCED_DOCUMENT_BYTES_CAPTURED':'REFERENCED_DOCUMENT_REHEARSAL_HELD',cancellationAllowed:false,readyToImport:false};
 });
 const body={format:'dgc-reference-custody-review-v1',snapshotHash:snapshot.snapshotHash,referenceReviewHash:reviewPin,manifestHash:manifestPin,filePlanHash:custody.filePlanHash,files:custody.files,bytes:custody.bytes,complete:custody.complete,documents,invoices,counts:documents.reduce((a,d)=>(a[d.state]=(a[d.state]??0)+1,a),{}),postingAllowed:false,acceptance:false,registryWritesAllowed:false,pdfSemanticsVerified:false,signedStatusVerified:false};
 return {...body,reviewHash:digest(body)};
}
