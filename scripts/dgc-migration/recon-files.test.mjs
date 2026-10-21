import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest,normalizeCapture} from './core.mjs';
import {revenueCaptures,revenueSnapshot,changeRevenueCapture} from './revenue-fixtures.mjs';
import {revenueTargetPlan} from './revenue-target.mjs';
import {reconFilePlan,verifyReconFilePlan,verifyReconFiles,reviewRevenueCustody,reconHeaderFileIds} from './recon-files.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},ok=a=>{assert.ok(a);n++;},reject=async(p,re)=>{await assert.rejects(p,re);n++;};
const A='AAAAAAAAAAAAAAAAAAAAAAAAA',B='BBBBBBBBBBBBBBBBBBBBBBBBB',data=Buffer.from('%PDF-1.4\nSynthetic custody evidence only\n%%EOF'),sha=createHash('sha256').update(data).digest('hex');
const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'dgc-recon-files-'));
function manifest(s,ids=reconFilePlan(s).files.map(f=>f.fileId)){
 const p=reconFilePlan(s),body={format:'dgc-source-recon-files-v1',snapshotHash:s.snapshotHash,filePlanHash:p.planHash,postingAllowed:false,acceptance:false,complete:ids.length===p.files.length&&!p.unresolvedHeaders.length,files:ids.map(id=>({fileId:id,relativePath:id+'.pdf',sourceHeaders:p.files.find(f=>f.fileId===id).sourceHeaders,mimeType:'application/pdf',size:data.length,sha256:sha}))};return {...body,manifestHash:digest(body)};
}
function rehash(m){const {manifestHash,...body}=m;return {...body,manifestHash:digest(body)};}
try{
 await writeFile(join(root,A+'.pdf'),data);await writeFile(join(root,B+'.pdf'),data);
 const s=revenueSnapshot(),before=canonical(s),p=reconFilePlan(s),m=manifest(s),verify=x=>verifyReconFiles(s,x,root,x.manifestHash);
 eq(p.files.length,1);eq(p.sourceHeaders,1);eq(p.headers[0].state,'EXACT');eq(p.files[0].sourceHeaders[0].sourceRow,2);eq(verifyReconFilePlan(p,s).planHash,p.planHash);eq(reconFilePlan(s).planHash,p.planHash);
 const r=await verify(m);eq(r.integrityVerified,true);eq(r.complete,true);eq(r.files,1);eq(r.bytes,data.length);eq(r.postingAllowed,false);eq(r.acceptance,false);eq(r.pdfSemanticsVerified,false);eq(r.missingFiles,[]);eq(canonical(s),before);
 await reject(verifyReconFiles(s,m,root),/digest/);await reject(verifyReconFiles(s,m,root,'0'.repeat(64)),/digest/);
 const partial=manifest(s,[]),pr=await verify(partial);eq(pr.integrityVerified,true);eq(pr.complete,false);eq(pr.files,0);eq(pr.missingFiles,[A]);
 const wrongComplete=structuredClone(partial);wrongComplete.complete=true;await reject(verify(rehash(wrongComplete)),/completeness/);
 const corrupt=structuredClone(m);corrupt.files[0].sha256='0'.repeat(64);await reject(verify(corrupt),/manifest/);const forged=rehash(corrupt);await reject(verifyReconFiles(s,forged,root,m.manifestHash),/digest/);await reject(verify(forged),/byte checksum/);
 for(const mutate of [x=>x.files[0].sourceHeaders[0].rowHash='0'.repeat(64),x=>x.files[0].sourceHeaders=[],x=>x.files.push(x.files[0]),x=>x.files[0].fileId=B]){const bad=structuredClone(m);mutate(bad);await reject(verify(rehash(bad)),/provenance|coverage/);}
 for(const [f,v] of [['relativePath','../outside.pdf'],['mimeType','image/png'],['size',-1]]){const bad=structuredClone(m);bad.files[0][f]=v;await reject(verify(rehash(bad)),/metadata/);}
 const other=structuredClone(m);other.snapshotHash='0'.repeat(64);await reject(verify(rehash(other)),/manifest|snapshot/);
 await writeFile(join(root,A+'.pdf'),Buffer.from('%PDF-1.4\nChanged custody evidence only!\n%%EOF'));await reject(verify(m),/checksum/);await writeFile(join(root,A+'.pdf'),data);
 const shared=revenueCaptures(),sheet=shared.find(e=>e.data.sheets[0].properties.title==='43_RECON_PDF_HEADER');sheet.data.sheets[0].data[0].rowData.push(structuredClone(sheet.data.sheets[0].data[0].rowData[1]));sheet.data.sheets[0].data[0].rowData[2].values[0].effectiveValue.stringValue='DOC_TWO';sheet.data.sheets[0].properties.gridProperties.rowCount=3;sheet.requestedRange="'43_RECON_PDF_HEADER'!A1:G3";
 const ss=normalizeCapture(shared),sp=reconFilePlan(ss),sm=manifest(ss);eq(sp.sourceHeaders,2);eq(sp.files.length,1);eq(sp.files[0].sourceHeaders.length,2);eq((await verifyReconFiles(ss,sm,root,sm.manifestHash)).complete,true);
 const ref={values:{Source_File_URL:'A displayed filename'},cells:{Source_File_URL:{hyperlink:'https://drive.google.com/open?id='+A}}};eq(reconHeaderFileIds(ref),[A]);ref.values.Source_File_URL='https://drive.google.com/file/d/'+B+'/view';eq(reconHeaderFileIds(ref),[A,B]);
 ref.values.Source_File_URL='https://drive.google.com.evil.invalid/file/d/'+B+'/view';eq(reconHeaderFileIds(ref),[A]);ref.cells.Source_File_URL.hyperlink='http://drive.google.com/file/d/'+A+'/view';eq(reconHeaderFileIds(ref),[]);
 const conflict=revenueCaptures(),cs=conflict.find(e=>e.data.sheets[0].properties.title==='43_RECON_PDF_HEADER').data.sheets[0];cs.data[0].rowData[1].values[5].hyperlink='https://drive.google.com/file/d/'+B+'/view';
 const xs=normalizeCapture(conflict),xp=reconFilePlan(xs),xm=manifest(xs);eq(xp.files.length,2);eq(xp.headers[0].state,'CONFLICTING');eq((await verifyReconFiles(xs,xm,root,xm.manifestHash)).complete,false);
 const xr=await reviewRevenueCustody(xs,revenueTargetPlan(xs),xm,root,xm.manifestHash);eq(xr.groups[0].custodyState,'SOURCE_REFERENCE_REQUIRES_REVIEW');eq(xr.nextReviewGroups,0);
 const clear=await reviewRevenueCustody(s,revenueTargetPlan(s),m,root,m.manifestHash);eq(clear.counts,{CAPTURED_BYTES_VERIFIED:1});eq(clear.nextReviewGroups,1);eq(clear.nextReviewRevenueRows,2);eq(clear.groups[0].readyToImport,false);eq(clear.pdfSemanticsVerified,false);
 const missing=await reviewRevenueCustody(s,revenueTargetPlan(s),partial,root,partial.manifestHash);eq(missing.counts,{FILE_NOT_CAPTURED:1});eq(missing.nextReviewGroups,0);
 const held=normalizeCapture(changeRevenueCapture(revenueCaptures(),'40_MONTHLY_REVENUE',2,'Invoice_Payable_USD','90.01')),hm=manifest(held),hr=await reviewRevenueCustody(held,revenueTargetPlan(held),hm,root,hm.manifestHash);eq(hr.groups[0].custodyState,'CAPTURED_BYTES_VERIFIED');eq(hr.groups[0].businessState,'HELD');eq(hr.nextReviewGroups,0);eq(hr.groups[0].readyToImport,false);
 const badPlan=structuredClone(p);badPlan.headers=[];const {planHash,...body}=badPlan;badPlan.planHash=digest(body);assert.throws(()=>verifyReconFilePlan(badPlan,s),/differs/);n++;
 eq((await readFile(join(root,A+'.pdf'))).equals(data),true);
 console.log(`PASS: ${n} recon custody assertions: shared source rows, pinned manifest, partial/missing/ambiguous files, byte/provenance/path/tamper guards and separate custody/business eligibility without posting.`);
}finally{const rel=relative(base,await realpath(root));if(!rel.startsWith('dgc-recon-files-')||rel.includes('..'))throw Error('Temporary cleanup escaped fixture root');await rm(root,{recursive:true,force:true});}
