import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture,canonical,digest} from './core.mjs';
import {referenceFilePlan,verifyReferenceFiles,reviewReferenceCustody} from './reference-files.mjs';
import {invoiceReferenceReview} from './invoice-references.mjs';
const A='A'.repeat(25),B='B'.repeat(25),pdf=Buffer.from('%PDF-1.4\nsynthetic custody fixture\n%%EOF');
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
function snapshot(change){
 const c=fixture();function table(name,headers,rows){const e=c.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];s.properties.gridProperties={rowCount:rows.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+headers.length)}${rows.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...rows.map(v=>({values:v.map(cell)}))];}
 table('48_INVOICE_HEADER',['Invoice_ID','Invoice_Number','Partner_ID'],[['I1','NUMBER1','P'],['I2','NUMBER2','P']]);
 table('53_SOA_HEADER',['SOA_ID','Pdf_File_ID','Pdf_File_URL','Status','Partner_ID'],[['SHARED',A,`https://drive.google.com/file/d/${A}/view`,'Draft','P']]);
 table('54_SOA_DETAIL',['SOA_Detail_ID','SOA_ID','Invoice_ID','Invoice_Number'],[['LINE','SHARED','I1','NUMBER1']]);
 table('55_APPROVAL_PACKAGE',['Approval_ID','File_ID','File_URL','Approval_Status','Partner_ID','Related_Invoice_IDs'],[['SHARED',A,`https://drive.google.com/open?id=${A}`,'Approved','P','I1'],['PKG2',B,'','Approved','P','I2']]);
 if(change)change(c);return normalizeCapture(c);
}
const snap=snapshot(),plan=referenceFilePlan(snap),before=canonical(snap);
eq(plan.files.length,2);eq(plan.documents.length,3);eq(plan.files[0].sources.length,2);eq(plan.unresolvedDocuments.length,0);eq(plan.documents.map(d=>d.sourceStatus),['Draft','Approved','Approved']);eq(canonical(snap),before);
function manifest(s=snap){const p=referenceFilePlan(s),body={format:'dgc-source-reference-files-v1',snapshotHash:s.snapshotHash,filePlanHash:p.planHash,complete:p.unresolvedDocuments.length===0,pdfSemanticsVerified:false,postingAllowed:false,acceptance:false,files:p.files.map(f=>({...f,relativePath:f.fileId+'.pdf',mimeType:'application/pdf',size:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')}))};return {...body,manifestHash:digest(body)};}
function rehash(m){const {manifestHash,...b}=m;return {...b,manifestHash:digest(b)};}
const root=await mkdtemp(join(tmpdir(),'dgc-reference-files-'));
try{
 for(const id of [A,B])await writeFile(join(root,id+'.pdf'),pdf);
 const m=manifest(),r=await verifyReferenceFiles(snap,m,root,m.manifestHash);eq(r.complete,true);eq(r.files,2);eq(r.bytes,pdf.length*2);eq(r.documents.every(d=>d.custodyState==='CAPTURED_BYTES_VERIFIED'),true);
 for(const flag of ['acceptance','postingAllowed','pdfSemanticsVerified','signedStatusVerified','registryWritesAllowed'])eq(r[flag],false);
 eq(r.documents.every(d=>d.readyToRegister===false),true);
 const partial=structuredClone(m);partial.files.pop();partial.complete=false;const p=rehash(partial),pr=await verifyReferenceFiles(snap,p,root,p.manifestHash);eq(pr.complete,false);eq(pr.missingFiles,[B]);eq(pr.documents.filter(d=>d.custodyState==='FILE_NOT_CAPTURED').length,1);
 const references=invoiceReferenceReview(snap),c=await reviewReferenceCustody(snap,references,references.reviewHash,m,root,m.manifestHash);
 eq(c.counts,{REFERENCES_AND_BYTES_CAPTURED_FOR_REHEARSAL:3});eq(c.invoices.map(i=>i.state),['REFERENCED_DOCUMENT_BYTES_CAPTURED','REFERENCED_DOCUMENT_BYTES_CAPTURED']);eq(c.documents[0].sourceStatus,'Draft');eq(c.documents.every(d=>!d.readyToRegister&&!d.localApprovalCreated&&!d.sourceStatusPromoted),true);eq(c.invoices.every(i=>!i.cancellationAllowed&&!i.readyToImport),true);eq(c.registryWritesAllowed,false);
 const held=await reviewReferenceCustody(snap,references,references.reviewHash,p,root,p.manifestHash);eq(held.invoices[1].state,'REFERENCED_DOCUMENT_REHEARSAL_HELD');eq(held.documents[2].bytesVerified,false);
 await reject(()=>reviewReferenceCustody(snap,references,'0'.repeat(64),m,root,m.manifestHash),/Pinned/);
 const forged=structuredClone(references);forged.invoices[0].donorReferences=[];const {reviewHash,...rb}=forged;forged.reviewHash=digest(rb);await reject(()=>reviewReferenceCustody(snap,forged,forged.reviewHash,m,root,m.manifestHash),/pinned source/);
 const mismatch=snapshot(c=>{c.find(e=>e.data.sheets[0].properties.title==='55_APPROVAL_PACKAGE').data.sheets[0].data[0].rowData[1].values[4]=cell('OTHER');});
 const mr=invoiceReferenceReview(mismatch),mm=manifest(mismatch),mc=await reviewReferenceCustody(mismatch,mr,mr.reviewHash,mm,root,mm.manifestHash);eq(mc.invoices[0].state,'REFERENCED_DOCUMENT_REHEARSAL_HELD');eq(mc.documents[1].reasons,['DOCUMENT_INVOICE_REFERENCES_HELD']);
 for(const mutate of [
  m=>m.files.push(m.files[0]),m=>m.files[0].sources.pop(),m=>m.files[0].sources[0].rowHash='0'.repeat(64),
  m=>m.files[0].relativePath='../escape.pdf',m=>m.files[0].size=64*1024*1024+1,m=>m.files[0].sha256='0'.repeat(64),
  m=>m.complete=false,m=>m.acceptance=true,m=>m.filePlanHash='0'.repeat(64),m=>m.snapshotHash='0'.repeat(64),m=>m.files[0].mimeType='text/plain'
 ]){let bad=structuredClone(m);mutate(bad);bad=rehash(bad);await reject(()=>verifyReferenceFiles(snap,bad,root,bad.manifestHash),/differ|Invalid/);}
 await reject(()=>verifyReferenceFiles(snap,m,root,'0'.repeat(64)),/Pinned/);
 await writeFile(join(root,A+'.pdf'),Buffer.from('%PDF-tampered'));await reject(()=>verifyReferenceFiles(snap,m,root,m.manifestHash),/bytes differ/);await writeFile(join(root,A+'.pdf'),pdf);
 const absent=await mkdtemp(join(tmpdir(),'dgc-reference-empty-'));try{await reject(()=>verifyReferenceFiles(snap,m,absent,m.manifestHash),/ENOENT/);}finally{await rm(absent,{recursive:true});}
 const junction=join(root,'linked-root');await symlink(root,junction,process.platform==='win32'?'junction':'dir');await reject(()=>verifyReferenceFiles(snap,m,junction,m.manifestHash),/symbolic link/);
 // Windows unprivileged file symlinks are unavailable; root junction is tested.
 if(process.platform!=='win32'){await rm(join(root,A+'.pdf'));await symlink(join(root,B+'.pdf'),join(root,A+'.pdf'));await reject(()=>verifyReferenceFiles(snap,m,root,m.manifestHash),/Invalid evidence/);}
}finally{await rm(root,{recursive:true,force:true});}
for(const [value,state] of [[`https://drive.google.com/file/d/${B}/view`,'CONFLICTING'],['','EXACT'],['https://evil.example/'+B,'EXACT']]){
 const s=snapshot(c=>{const e=c.find(e=>e.data.sheets[0].properties.title==='53_SOA_HEADER');e.data.sheets[0].data[0].rowData[1].values[2]=cell(value);});eq(referenceFilePlan(s).documents[0].state,state);
}
for(const [id,url,state] of [['broken',`https://drive.google.com/file/d/${A}/view`,'INVALID_EXPLICIT_ID'],['','','UNRESOLVED']]){
 const s=snapshot(c=>{const v=c.find(e=>e.data.sheets[0].properties.title==='53_SOA_HEADER').data.sheets[0].data[0].rowData[1].values;v[1]=cell(id);v[2]=cell(url);});eq(referenceFilePlan(s).documents[0].state,state);
}
const link=snapshot(c=>{const v=c.find(e=>e.data.sheets[0].properties.title==='53_SOA_HEADER').data.sheets[0].data[0].rowData[1].values;v[1]=cell('');v[2]={...cell('Open PDF'),hyperlink:`https://drive.google.com/file/d/${A}/view`};});eq(referenceFilePlan(link).documents[0].state,'EXACT');
console.log(`SOA/package PDF custody: ${n} assertions passed`);
