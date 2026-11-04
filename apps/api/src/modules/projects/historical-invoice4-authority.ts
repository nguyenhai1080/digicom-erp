import {createHash} from 'node:crypto';
import {CommandError} from './commands.js';
const pin='bd35720cbbf02a6af2aa515c4b3154385b94df3730ce2400d6f5c9289c2655cd';
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:any)=>JSON.stringify(sorted(v)),digest=(v:any)=>createHash('sha256').update(canonical(v)).digest('hex');
const row=(r:any)=>({sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash,values:r.values,cells:r.cells});
export function historicalInvoice4Authority(json:unknown,snapshotHash:string,source:any,rows:Record<string,any[]>,pdf:{fileId:string;sha256:string|null}){
 try{
  if(typeof json!=='string'||Buffer.byteLength(json)>4*1024*1024)throw Error();const d=JSON.parse(json),{decisionHash,...body}=d,p=d.proposal;
  if(canonical(d)!==json||decisionHash!==pin||digest(body)!==pin||d.snapshotHash!==snapshotHash||d.approvedBy!=='OWNER'||d.financialCommitAllowed!==false||source.sheet!=='48_INVOICE_HEADER'||source.sheetId!==p.sourceInvoice.sheetId||source.sourceRow!==p.sourceInvoice.sourceRow||source.legacyId!==p.sourceInvoice.legacyId||source.rowHash!==p.sourceInvoice.rowHash||pdf.fileId!==p.originalPdf.fileId||pdf.sha256!==p.originalPdf.sha256)throw Error();
  if(canonical(Object.keys(rows).sort())!==canonical(Object.keys(p.sourceRows).sort()))throw Error();
  for(const [sheet,actual] of Object.entries(rows))if(canonical(actual.map(row))!==canonical(p.sourceRows[sheet].map(row)))throw Error();
  return {decisionHash:pin,authority:'CAPTURED_LEDGER_AND_BOTH_PDFS_WITH_WARNINGS',signedDiscrepanciesPreserved:true,sourceValuesChanged:false,amountAdjustment:false,additionalReceivable:false,localApprovalCreated:false,acceptance:false};
 }catch{throw new CommandError(409,'Quyết định nguồn của Invoice 01/04/2023 không khớp hồ sơ đã chốt.');}
}
