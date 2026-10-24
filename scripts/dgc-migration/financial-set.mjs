import {canonical,digest,SOURCE_ID} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {rehearseReferenceUnified,rehearseReferenceUnifiedNative} from './reference-registration.mjs';
import {verifyReceiptTargetPlan} from './receipt-target.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
const models=['user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportSnapshot','dgcImportRow','dgcImportLink','auditLog'];
const counts=async db=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
const uuid=(company,kind,source)=>{const h=digest(['DGC_UNIFIED_FINANCIAL_SET',company,kind,source]);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const norm=v=>v instanceof Date?v.toISOString():v?.toFixed?v.toFixed():v;
const hash=(row,data)=>digest(Object.fromEntries(Object.keys(data).map(k=>[k,norm(row[k])])));
class FinancialRollback extends Error{constructor(result){super('DGC unified financial set rollback');this.result=result;}}

// Private writer is reachable only while intercepting a deliberate registry
// rollback in the same transaction. No parent shells, status sync or cash writer.
async function receipts(tx,options,invoiceRows){
 const {invoiceOptions:i,receiptPlan:plan}=options,companyId=i.companyId,selected=plan.entries.filter(e=>invoiceRows.includes(e.invoiceSource?.sourceRow)),parents=new Map();
 for(const row of invoiceRows){
  const expected=i.snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===row),links=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,snapshotHash:i.snapshot.snapshotHash,sheetId:i.snapshot.tables['48_INVOICE_HEADER'].sheetId,sourceRow:row,rowHash:expected.rowHash,targetModel:'invoice'}});
  if(links.length!==1)throw Error('Unified receipt parent provenance incomplete');
  const invoice=await tx.invoice.findFirst({where:{companyId,id:links[0].targetId},include:{receivable:true}}),j=invoice?.snapshot;
  if(!invoice||invoice.isCurrent||invoice.status!=='CANCELLED'||invoice.issuedAt||invoice.issuedById||j?.sourceKind!=='DGC_INVOICE_REHEARSAL_ONLY'||j.snapshotHash!==i.snapshot.snapshotHash||j.source.sourceRow!==row||j.source.rowHash!==expected.rowHash||j.capturedHeaderJson!==options.unifiedInvoicePlan.entries.find(e=>e.source.sourceRow===row)?.capturedHeaderJson||!invoice.receivable||invoice.receivable.status!=='CANCELLED')throw Error('Unified receipts require full blocked Invoice/AR, never shells');
  const own=selected.filter(e=>e.invoiceSource.sourceRow===row);
  if(own.some(e=>e.state!=='EXACT_SOURCE_RECEIPT_SHAPE'||!e.ledgerBalanceBound)||!invoice.paidAmount.eq(own.reduce((sum,e)=>sum.plus(e.data.paidUsd),invoice.paidAmount.minus(invoice.paidAmount)))||!invoice.receivable.paidAmount.eq(invoice.paidAmount))throw Error('Unified receipt set does not match captured parent paid total');
  parents.set(row,invoice);
 }
 for(const e of selected){const r=await tx.dgcImportRow.findUnique({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId,snapshotHash:i.snapshot.snapshotHash,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow}}});if(!r||r.sheetName!=='52_INVOICE_PAYMENT'||r.rowHash!==e.source.rowHash||r.legacyId!==e.source.legacyId||canonical(r.payload)!==e.data.historicalSource.capturedRowJson)throw Error('Unified receipt staging drift');}
 async function write(){let created=0,unchanged=0;
  for(const e of selected){
   const id=uuid(companyId,'receipt',e.source),data={...e.data,id,companyId,invoiceId:parents.get(e.invoiceSource.sourceRow).id,paymentDate:new Date(e.data.paymentDate),requestId:uuid(companyId,'request',e.source),requestDigest:digest({source:e.source,snapshotHash:i.snapshot.snapshotHash,planHash:plan.planHash})},targetHash=hash(data,data);
   const link=await tx.dgcImportLink.findFirst({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow,legacyId:e.source.legacyId}}),old=await tx.invoicePayment.findFirst({where:{companyId,id}});
   if(link){if(!old||link.snapshotHash!==i.snapshot.snapshotHash||link.rowHash!==e.source.rowHash||link.targetModel!=='invoicePayment'||link.targetId!==id||link.targetHash!==targetHash||hash(old,data)!==targetHash)throw Error('Unified receipt provenance or target drift');unchanged++;continue;}
   if(old)throw Error('Unlinked unified receipt');await tx.invoicePayment.create({data});await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,snapshotHash:i.snapshot.snapshotHash,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow,legacyId:e.source.legacyId,rowHash:e.source.rowHash,targetModel:'invoicePayment',targetId:id,targetHash}});created++;
  }return {created,unchanged};
 }
 const first=await write(),replay=await write(),stored=await tx.invoicePayment.findMany({where:{companyId,id:{in:selected.map(e=>uuid(companyId,'receipt',e.source))}}});
 if(stored.length!==selected.length||replay.created||replay.unchanged!==selected.length)throw Error('Unified receipt replay incomplete');
 for(const r of stored){const e=selected.find(e=>e.source.legacyId===r.paymentCode);for(const f of ['paidUsd','allocationAmount','paidVnd','cashAmount','fxRate'])if(r[f]?.toFixed()!==e.data[f])throw Error('Unified receipt precision differs');if(r.approvedById||r.cashAccountId||r.documentId||canonical(r.historicalSource)!==canonical(e.data.historicalSource))throw Error('Unified receipt actor/cash/evidence differs');}
 return {sourceRows:selected.map(e=>e.source.sourceRow),parentSourceRows:[...new Set(selected.map(e=>e.invoiceSource.sourceRow))],first,replay,fullInvoiceParents:true,parentShellsCreated:0,sourceAmountsPreserved:true,localApprovalCreated:false,historicalCashPosting:false};
}

export async function rehearseUnifiedFinancialSet(db,options,verify){
 return financialSet(db,options,verify,false);
}
export async function rehearseUnifiedNativeFinancialSet(db,options,verify){
 return financialSet(db,options,verify,true);
}
async function financialSet(db,options,verify,nativeExtended){
 requireStaging(process.env.DATABASE_URL??'');return withSourcePlanningCache(async()=>{
  const {invoiceOptions:i}=options;verifyReceiptTargetPlan(options.receiptPlan,i.snapshot,i.decisions);
  const before=await counts(db);for(const m of ['invoice','revenue','accountReceivable','invoicePayment','cashAccount','cashEntry'])if(before[m])throw Error('Unified trial requires an isolated empty financial ledger');
  let result,failure;
  const proxy=new Proxy(db,{get(t,k){if(k==='$transaction')return async(fn,settings)=>t.$transaction(async tx=>{try{await fn(tx);throw Error('Unified reference trial unexpectedly returned');}catch(e){
   if(e.message!=='DGC reference registration rollback'||e.result?.registrationPlanHash!==options.unifiedReferencePlan.planHash)throw e;
   const receiptProof=await receipts(tx,options,e.result.invoiceSourceRows);
   if(verify)await verify(tx,{reference:e.result,receipts:receiptProof});
   const inside=await counts(tx);for(const m of ['userRole','authSession','approvalRequest','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','dgcImportSnapshot','dgcImportRow'])if(inside[m]!==before[m])throw Error('Unexpected unified financial side effect '+m);
   throw new FinancialRollback({mode:'ROLLBACK_ONLY',snapshotHash:i.snapshot.snapshotHash,invoicePlanHash:options.unifiedInvoicePlan.planHash,referencePlanHash:options.unifiedReferencePlan.planHash,receiptPlanHash:options.receiptPlan.planHash,reference:e.result,receipts:receiptProof,before,inside,operationalAcceptance:false,commitAllowed:false,historicalCashPosting:false});
  }},settings);const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  try{await (nativeExtended?rehearseReferenceUnifiedNative:rehearseReferenceUnified)(proxy,options);throw Error('Unified financial trial unexpectedly committed');}catch(e){if(e instanceof FinancialRollback)result=e.result;else failure=e;}
  const after=await counts(db);if(canonical(before)!==canonical(after))throw Error('Unified financial rollback footprint differs');if(failure)throw failure;return {...result,after,rolledBack:true};
 });
}
