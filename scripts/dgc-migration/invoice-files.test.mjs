import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture,digest} from './core.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
const capture=fixture(),sheet=capture.find(c=>c.data.sheets[0].properties.title==='48_INVOICE_HEADER').data.sheets[0];
sheet.properties.gridProperties.columnCount=2;
capture.find(c=>c.data.sheets[0].properties.title==='48_INVOICE_HEADER').requestedRange="'48_INVOICE_HEADER'!A1:B5";
sheet.data[0].rowData=[{values:['Invoice_ID','Pdf_File_ID'].map(cell)},{values:['INV','SYNTH_FILE_ID'].map(cell)}];
const snapshot=normalizeCapture(capture),row=snapshot.tables['48_INVOICE_HEADER'].rows[0],root=await mkdtemp(join(tmpdir(),'dgc-invoice-evidence-'));
const data=Buffer.from('%PDF-1.7\nSynthetic bytes for checksum fixture only.');
const sign=body=>({...body,manifestHash:digest(body)});
const body={format:'dgc-source-invoice-files-v1',snapshotHash:snapshot.snapshotHash,acceptance:false,files:[{sourceRow:row.sourceRow,rowHash:row.rowHash,legacyId:row.legacyId,fileId:'SYNTH_FILE_ID',relativePath:'SYNTH_FILE_ID.pdf',mimeType:'application/pdf',size:data.length,sha256:createHash('sha256').update(data).digest('hex')}]};
try{
 await writeFile(join(root,'SYNTH_FILE_ID.pdf'),data);
 assert.equal((await verifyInvoiceFiles(snapshot,sign(body),root)).files,1);
 const bad=structuredClone(sign(body));bad.files[0].sha256='0'.repeat(64);await assert.rejects(()=>verifyInvoiceFiles(snapshot,bad,root),/manifest checksum/);
 const wrongSource=structuredClone(body);wrongSource.files[0].rowHash='wrong';await assert.rejects(()=>verifyInvoiceFiles(snapshot,sign(wrongSource),root),/source provenance/);
 const missing=structuredClone(body);missing.files=[];await assert.rejects(()=>verifyInvoiceFiles(snapshot,sign(missing),root),/coverage mismatch/);
 const outside=structuredClone(body);outside.files[0].relativePath='../escape.pdf';await assert.rejects(()=>verifyInvoiceFiles(snapshot,sign(outside),root),/Invalid invoice PDF metadata/);
 const accepted=structuredClone(body);accepted.acceptance=true;await assert.rejects(()=>verifyInvoiceFiles(snapshot,sign(accepted),root),/Wrong invoice file manifest/);
 await writeFile(join(root,'SYNTH_FILE_ID.pdf'),Buffer.from(data.toString().replace('Synthetic','Changed!!')));
 await assert.rejects(()=>verifyInvoiceFiles(snapshot,sign(body),root),/PDF byte checksum/);
 console.log('PASS: invoice PDF coverage, raw-byte SHA-256, manifest/source provenance, path restrictions and changed-file detection.');
}finally{
 if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-invoice-evidence-'))throw Error('Refusing cleanup outside fixture directory');
 await rm(root,{recursive:true,force:true});
}
