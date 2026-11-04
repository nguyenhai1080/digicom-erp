import {createHash} from 'node:crypto';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
const pin='ac4d3276cf8afe545aa88136d38aaf83576ff87b788b71508e23e4385e7e3455';
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:any)=>JSON.stringify(sorted(v)),digest=(v:any)=>createHash('sha256').update(canonical(v)).digest('hex'),row=(r:any)=>({sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash,values:r.values,cells:r.cells});
export function historicalLedgerVarianceAuthority(json:unknown,snapshotHash:string,source:any,rows:Record<string,any[]>,pdf:{fileId:string;sha256:string|null}){
 try{
  if(typeof json!=='string'||Buffer.byteLength(json)>4*1024*1024)throw Error();const d=JSON.parse(json),{decisionHash,...body}=d;
  if(canonical(d)!==json||decisionHash!==pin||digest(body)!==pin||d.snapshotHash!==snapshotHash||d.approvedBy!=='OWNER'||d.financialCommitAllowed!==false||source.sheet!=='48_INVOICE_HEADER'||source.sheetId!==196979465||source.sourceRow!==14||source.legacyId!=='INV0020'||source.rowHash!==d.source.rowHash||pdf.fileId!==d.originalPdf.fileId||pdf.sha256!==d.originalPdf.sha256||canonical(Object.keys(rows).sort())!==canonical(Object.keys(d.sourceRows).sort()))throw Error();
  for(const [sheet,actual] of Object.entries(rows))if(canonical(actual.map(row))!==canonical(d.sourceRows[sheet].map(row)))throw Error();
  const normalize=(v:any)=>Object.fromEntries(['revenue','wht','payable'].map(k=>[k,new Prisma.Decimal(v[k]).toFixed()]));
  return {decisionHash:pin,authority:'CAPTURED_HEADER_WITH_PRESERVED_PRESENTATION_VARIANCE',ledger:{...normalize(d.capturedLedger),paid:new Prisma.Decimal(d.capturedLedger.paid).toFixed(),outstanding:new Prisma.Decimal(d.capturedLedger.outstanding).toFixed()},presented:normalize(d.printed),amountAdjustment:false,additionalReceivable:false,acceptance:false};
 }catch{throw new CommandError(409,'Thẩm quyền header và chi tiết của Invoice 01/02/2024 không khớp hồ sơ đã chốt.');}
}
