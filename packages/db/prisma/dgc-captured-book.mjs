import {mkdir,copyFile,lstat,realpath} from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest,SOURCE_ID} from './dgc-master-core.mjs';
const allowed=new Set(['reconciliation','reconciliationItem','revenue','attachment','document','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','configuration']);
const financial=['revenue','invoice','accountReceivable','invoicePayment','inputReconciliation'];
const hex=/^[a-f0-9]{64}$/;
export function capturedId(companyId,key){const h=digest(['DGC_CAPTURED_BOOK_V1',companyId,key]);return h.slice(0,8)+'-'+h.slice(8,12)+'-8'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
export function verifyCapturedBook(bundle,pin){
 const {bundleHash,...body}=bundle??{};
 if(!hex.test(pin??'')||bundleHash!==pin||digest(body)!==pin||body.format!=='dgc-captured-book-transfer-v1'||body.sourceSpreadsheetId!==SOURCE_ID||!hex.test(body.sourceSnapshotHash??'')||canonical(body.policy)!==canonical({historicalValidityAudit:false,recalculateHistory:false,historicalCashPosting:false,bankCashSetupRequired:false,sourceValuesPreserved:true}))throw Error('Captured book pin or policy differs');
 if(!Array.isArray(body.operations)||!body.operations.length||body.operations.length>10000||!Array.isArray(body.sourceRows)||body.sourceRows.length>20000||!Array.isArray(body.documents))throw Error('Invalid transfer coverage');
 const keys=new Set();for(const op of body.operations){if(!allowed.has(op.model)||typeof op.key!=='string'||keys.has(op.key)||!op.data||Object.hasOwn(op.data,'id')||Object.hasOwn(op.data,'companyId'))throw Error('Invalid transfer operation');keys.add(op.key);}
 const files=new Set();for(const f of body.documents){if(!keys.has(f.key)||files.has(f.key)||!hex.test(f.sha256??'')||!Number.isSafeInteger(f.size)||f.size<5||f.size>64*1024*1024||!['invoices','dgc-history'].includes(f.folder))throw Error('Invalid captured file metadata');files.add(f.key);}
 return bundle;
}
export function capturedFilePath(companyId,file){return `${file.folder}/${companyId}/${capturedId(companyId,file.key)}.pdf`;}
async function safePath(root,path){
 const base=await realpath(root),target=resolve(base,path),rel=relative(base,target);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('File escaped DGC storage');
 let current=base;for(const part of rel.split(/[\\/]/)){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())throw Error('Linked storage file is not accepted');}return target;
}
async function checkedPath(root,path,file){const target=await safePath(root,path),s=await lstat(target);if(!s.isFile()||s.size!==file.size)throw Error('Transferred document size differs');const hash=createHash('sha256');for await(const chunk of createReadStream(target))hash.update(chunk);if(hash.digest('hex')!==file.sha256)throw Error('Transferred document bytes differ');return target;}
// Transfer integrity only. No extraction/OCR, arithmetic or PDF validity audit.
export async function capturedFilesReady(bundle,pin,companyId,storageRoot){
 verifyCapturedBook(bundle,pin);let bytes=0;
 for(const f of bundle.documents){await checkedPath(storageRoot,capturedFilePath(companyId,f),f);bytes+=f.size;}
 return {files:bundle.documents.length,bytes};
}
export async function installCapturedFiles(bundle,pin,companyId,blobRoot,storageRoot){
 verifyCapturedBook(bundle,pin);
 for(const f of bundle.documents){const source=await checkedPath(blobRoot,f.sha256+'.pdf',f),path=resolve(storageRoot,capturedFilePath(companyId,f));await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});try{await copyFile(source,path,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;await checkedPath(storageRoot,capturedFilePath(companyId,f),f);}}
 return capturedFilesReady(bundle,pin,companyId,storageRoot);
}
export async function transferCapturedBook(tx,bundle,{expectedBundleHash,expectedDatabase,companyId,operatorId,reason,registerDocuments}){
 verifyCapturedBook(bundle,expectedBundleHash);
 if(expectedDatabase!=='dgc_erp_db'&&!/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(expectedDatabase))throw Error('Dedicated DGC database required');
 const actual=await tx.$queryRaw`SELECT current_database() AS name`;if(actual[0]?.name!==expectedDatabase)throw Error('Database target differs');
 const company=await tx.company.findUniqueOrThrow({where:{id:companyId}});if(company.companyCode!=='DGC')throw Error('DGC tenant required');
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
 if(!await tx.user.findFirst({where:{id:operatorId,companyId,status:'ACTIVE'}}))throw Error('DGC operator required');
 const previous=await tx.auditLog.findMany({where:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'}});
 if(previous.length){if(previous.length!==1||previous[0].traceId!==expectedBundleHash)throw Error('A different book has already been imported');return {...previous[0].newValue,replayed:true};}
 for(const model of financial)if(await tx[model].count({where:{companyId}}))throw Error('Existing financial ledger cannot be overwritten');
 const appendix=bundle.sourceAppendix;
 if(appendix){
  const {appendixHash,...body}=appendix;if(appendix.format!=='dgc-captured-book-appendix-v1'||appendix.baseSnapshotHash!==bundle.sourceSnapshotHash||appendixHash!==digest(body))throw Error('Source appendix differs');
  const old=await tx.dgcImportSnapshot.findUnique({where:{companyId_snapshotHash:{companyId,snapshotHash:appendixHash}}});
  if(!old){
   await tx.dgcImportSnapshot.create({data:{companyId,snapshotHash:appendixHash,sourceSpreadsheetId:SOURCE_ID,rowCount:appendix.rows.length,sourceMetadata:{format:appendix.format,baseSnapshotHash:appendix.baseSnapshotHash,...appendix.sourceMetadata}}});
   for(const r of appendix.rows){if(r.payload.rowHash!==digest({values:r.payload.values,cells:r.payload.cells})||await tx.dgcImportRow.findFirst({where:{companyId,snapshotHash:bundle.sourceSnapshotHash,sheetId:r.sheetId,sourceRow:r.payload.sourceRow}}))throw Error('Source appendix would replace an old row');await tx.dgcImportRow.create({data:{companyId,snapshotHash:appendixHash,sheetId:r.sheetId,sheetName:r.sheetName,sourceRow:r.payload.sourceRow,legacyId:r.payload.legacyId,rowHash:r.payload.rowHash,payload:r.payload}});}
  }
 }
 const hashes=[bundle.sourceSnapshotHash,...(appendix?[appendix.appendixHash]:[])];
 const stored=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:{in:hashes}},select:{snapshotHash:true,sheetId:true,sourceRow:true,rowHash:true,legacyId:true,sheetName:true}}),raw=new Map(stored.map(r=>[r.sheetId+'|'+r.sourceRow,r]));
 if(raw.size!==bundle.sourceRows.length||stored.length!==raw.size||bundle.sourceRows.some(s=>{const r=raw.get(s.sheetId+'|'+s.sourceRow);return !r||r.rowHash!==s.rowHash||r.legacyId!==s.legacyId||r.sheetName!==s.sheet;}))throw Error('Source transfer coverage differs');
 const masterCache=new Map(),files=new Map(bundle.documents.map(f=>[f.key,f]));
 async function expand(value){
  if(Array.isArray(value))return Promise.all(value.map(expand));if(!value||typeof value!=='object')return value;
  const keys=Object.keys(value);if(keys.length===1){
   if(Object.hasOwn(value,'$record'))return capturedId(companyId,value.$record);
   if(Object.hasOwn(value,'$operator'))return operatorId;
   if(Object.hasOwn(value,'$date')){const d=new Date(value.$date);if(!Number.isFinite(d.getTime()))throw Error('Unrepresentable date');return d;}
   if(Object.hasOwn(value,'$bigint'))return BigInt(value.$bigint);
   if(Object.hasOwn(value,'$filename'))return capturedId(companyId,value.$filename)+'.pdf';
   if(Object.hasOwn(value,'$file')){const f=files.get(value.$file);if(!f)throw Error('Missing transfer file');return capturedFilePath(companyId,f);}
   if(Object.hasOwn(value,'$master')){
    const s=value.$master,k=s.sheetId+'|'+s.sourceRow;if(masterCache.has(k))return masterCache.get(k);
    const ls=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:s.sheetId,sourceRow:s.sourceRow,legacyId:s.legacyId,rowHash:s.rowHash}}),link=ls[0];
    if(ls.length!==1||!['service','partner','contract'].includes(link.targetModel)||!await tx[link.targetModel].findFirst({where:{id:link.targetId,companyId}}))throw Error('Master target relation differs');masterCache.set(k,link.targetId);return link.targetId;
   }
  }
  return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await expand(v)])));
 }
 const footprint={};
 for(const op of bundle.operations){
  const data={...await expand(op.data),id:capturedId(companyId,op.key),companyId};
  if(op.model==='invoiceScopeItem')data.capturedSource=true;
  if(op.model==='inputReconciliation'){
   const fields=['period','sourceRevenueId','serviceId','outputPartnerId','outputContractId','inputPartnerId','inputContractId','currency','baseUsd','shareRate','foreignAmount','fxRate','localAmount','taxRate','taxAmount','whtAmount','payableAmount'];
   data.sourceSnapshot.data=Object.fromEntries(fields.map(k=>[k,data[k]]));data.sourceDigest=digest(data.sourceSnapshot);data.status='GENERATED';
  }
  await tx[op.model].create({data});footprint[op.model]=(footprint[op.model]??0)+1;
  if(op.source){const s=op.source,r=raw.get(s.sheetId+'|'+s.sourceRow);if(!r||r.rowHash!==s.rowHash||r.snapshotHash!==(s.snapshotHash??bundle.sourceSnapshotHash))throw Error('Record source binding differs');await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,snapshotHash:s.snapshotHash??bundle.sourceSnapshotHash,sheetId:s.sheetId,sourceRow:s.sourceRow,legacyId:s.legacyId,rowHash:s.rowHash,targetModel:op.model,targetId:data.id,targetHash:digest(op.data)}});}
 }
 if(bundle.referenceLinks?.length&&!registerDocuments)throw Error('Complete source document registry is required');
 for(const link of bundle.referenceLinks??[]){const bound=await expand(link);await registerDocuments(tx,companyId,bound.invoiceIds,bound.documentId,bound.kind,{capturedBookHash:expectedBundleHash});}
 // Archive numbers are preserved independently; a historical duplicate legal
 // number must not collide with a current Invoice or create current AR.
 await tx.configuration.create({data:{companyId,configKey:'DGC_CAPTURED_BOOK_HISTORY',configValue:canonical({bundleHash:expectedBundleHash,snapshotHash:bundle.sourceSnapshotHash,archives:await expand(bundle.archives),warnings:bundle.warnings,missingOriginalRecons:bundle.missingOriginalRecons}),valueType:'JSON',isSecret:false,description:'Captured DGC history and source discrepancies; no cash or current AR'}});
 const summary={bundleHash:expectedBundleHash,sourceSnapshotHash:bundle.sourceSnapshotHash,sourceAppendixHash:appendix?.appendixHash??null,sourceCurrentSnapshotHash:bundle.sourceCurrentSnapshotHash??bundle.sourceSnapshotHash,counts:bundle.counts,footprint,sourceValuesPreserved:true,historicalCashPosting:false,bankCashSetupRequired:false,replayed:false};
 await tx.auditLog.create({data:{companyId,userId:operatorId,action:'DGC_CAPTURED_BOOK_TRANSFER',entityType:'DGC_CAPTURED_BOOK',traceId:expectedBundleHash,newValue:summary,reason}});
 return summary;
}
