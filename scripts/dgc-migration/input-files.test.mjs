import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture,digest} from './core.mjs';
import {verifyInputFiles,inputAttachmentId} from './input-files.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const c=fixture(),s=c.find(c=>c.data.sheets[0].properties.title==='56_INPUT_RECONCILIATION');s.data.sheets[0].properties.gridProperties={rowCount:5,columnCount:2};s.requestedRange="'56_INPUT_RECONCILIATION'!A1:B5";
const fileId='SYNTHETIC_INPUT_FILE_12345';s.data.sheets[0].data[0].rowData=[{values:['Input_Recon_ID','Attachment_URL'].map(cell)},...['IR1','IR2','IR3'].map(id=>({values:[id,'https://drive.google.com/file/d/'+fileId+'/view'].map(cell)})),{values:['DRAFT',''].map(cell)}];
const snapshot=normalizeCapture(c),t=snapshot.tables['56_INPUT_RECONCILIATION'],bytes=Buffer.from('%PDF-1.7\nSynthetic checksum fixture only.'),root=await mkdtemp(join(tmpdir(),'dgc-input-files-'));
const body={format:'dgc-source-input-files-v1',snapshotHash:snapshot.snapshotHash,acceptance:false,files:[{fileId,relativePath:fileId+'.pdf',mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sources:t.rows.slice(0,3).map(r=>({sheet:'56_INPUT_RECONCILIATION',sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash}))}]},seal=b=>({...b,manifestHash:digest(b)});
try{
 await writeFile(join(root,fileId+'.pdf'),bytes);const result=await verifyInputFiles(snapshot,seal(body),root);eq(result.files,1);eq(result.sourceRows,3);eq(result.rowsWithoutAttachment.length,1);eq(result.bytes,bytes.length);eq(result.postingAllowed,false);
 eq(inputAttachmentId(t.rows[0]),fileId);
 const tampered=seal(body);tampered.files[0].size++;await reject(()=>verifyInputFiles(snapshot,tampered,root),/manifest checksum/);body.files[0].size--;
 const missing=structuredClone(body);missing.files[0].sources.pop();await reject(()=>verifyInputFiles(snapshot,seal(missing),root),/row provenance/);
 const duplicate=structuredClone(body);duplicate.files.push(duplicate.files[0]);await reject(()=>verifyInputFiles(snapshot,seal(duplicate),root),/file coverage/);
 const changedRow=structuredClone(body);changedRow.files[0].sources[0].rowHash='0'.repeat(64);await reject(()=>verifyInputFiles(snapshot,seal(changedRow),root),/row provenance/);
 const path=structuredClone(body);path.files[0].relativePath='../escape.pdf';await reject(()=>verifyInputFiles(snapshot,seal(path),root),/Invalid input PDF metadata/);
 const accepted=structuredClone(body);accepted.acceptance=true;await reject(()=>verifyInputFiles(snapshot,seal(accepted),root),/Wrong input PDF/);
 await writeFile(join(root,fileId+'.pdf'),'%PDF-changed');await reject(()=>verifyInputFiles(snapshot,seal(body),root),/byte checksum/);
 console.log('PASS: '+checks+' InputRecon PDF evidence assertions: shared-file coverage, blank attachments, exact row hashes, file bytes and path/tamper guards.');
}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-input-files-'))throw Error('Refusing cleanup outside fixture directory');await rm(root,{recursive:true,force:true});}
