import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {verifySnapshot,digest} from './core.mjs';

// Verify the private copy of original PDFs against the captured invoice rows.
// This proves local evidence integrity, not document authenticity/acceptance.
export async function verifyInvoiceFiles(snapshot,manifest,root){
 verifySnapshot(snapshot);
 if(manifest?.format!=='dgc-source-invoice-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.acceptance!==false)throw Error('Wrong invoice file manifest or snapshot');
 const {manifestHash,...body}=manifest;if(manifestHash!==digest(body))throw Error('Invoice file manifest checksum mismatch');
 const rows=snapshot.tables['48_INVOICE_HEADER'].rows,files=manifest.files;
 if(!Array.isArray(files)||files.length!==rows.length)throw Error('Invoice file coverage mismatch');
 const base=await realpath(root),seen=new Set();let bytes=0;
 for(const f of files){
  const row=rows.find(r=>r.sourceRow===f.sourceRow);
  if(!row||seen.has(f.sourceRow)||f.rowHash!==row.rowHash||f.legacyId!==row.legacyId||f.fileId!==String(row.values.Pdf_File_ID??'').trim()||!/^[A-Za-z0-9_-]+$/.test(f.fileId))throw Error('Invoice file source provenance mismatch');
  seen.add(f.sourceRow);
  if(f.relativePath!==f.fileId+'.pdf'||f.mimeType!=='application/pdf'||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid invoice PDF metadata');
  const path=await realpath(resolve(base,f.relativePath)),rel=relative(base,path);
  if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Invoice file must stay inside private evidence directory');
  const data=await readFile(path);
  if(data.length!==f.size||data.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Invoice PDF byte checksum mismatch');
  bytes+=data.length;
 }
 return {verified:true,snapshotHash:snapshot.snapshotHash,manifestHash,files:files.length,bytes,postingAllowed:false,acceptance:false};
}
