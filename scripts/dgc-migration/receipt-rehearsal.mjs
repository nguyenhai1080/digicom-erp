import {canonical,digest,SOURCE_ID} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {masterResolver} from './revenue-rehearsal.mjs';
import {verifyReceiptTargetPlan} from './receipt-target.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {resolve as pathResolve} from 'node:path';
const models=['user','userRole','authSession','approvalRequest','invoice','invoiceScope','invoiceScopeItem','accountReceivable','revenue','reconciliation','invoicePayment','cashAccount','cashEntry','cashTransfer','cashHistory','accountPayable','inputReconciliation','attachment','document','invoiceDocumentLink','dgcImportSnapshot','dgcImportRow','dgcImportLink','auditLog'];
const counts=async db=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
const uuid=(company,kind,source)=>{const h=digest(['DGC_RECEIPT_SHAPE',company,kind,source]);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const value=v=>v instanceof Date?v.toISOString():v?.toFixed?v.toFixed():v;
const targetHash=(row,data)=>digest(Object.fromEntries(Object.keys(data).map(k=>[k,value(row[k])])));
class Rollback extends Error{constructor(proof){super('DGC receipt shape rollback');this.proof=proof;}}

// Receipt-only storage trial. Parent shells are deliberately CANCELLED/noncurrent,
// have no AR/scopes and do not establish full Invoice restoration or approval.
// Parent PDFs are verified originals, retained only as private trial evidence.
export async function rehearseSourceReceipts(db,{snapshot,decisions,plan,companyId,manifest,manifestPin,invoiceRoot,verify}){
 requireStaging(process.env.DATABASE_URL??'');verifyReceiptTargetPlan(plan,snapshot,decisions);
 if(plan.entries.some(e=>e.state!=='EXACT_SOURCE_RECEIPT_SHAPE'||!e.ledgerBalanceBound)||!plan.entries.length)throw Error('Whole receipt set has source or balance holds');
 if(manifest?.manifestHash!==manifestPin)throw Error('Pinned parent Invoice PDF manifest required');await verifyInvoiceFiles(snapshot,manifest,invoiceRoot);
 const before=await counts(db);if(before.invoice||before.invoicePayment||before.revenue||before.accountReceivable||before.cashAccount||before.cashEntry)throw Error('Receipt shape trial requires an isolated empty financial ledger');
 let proof;
 try{await db.$transaction(async tx=>{
  const actual=await tx.$queryRaw`SELECT current_database() AS name`;if(actual[0].name!==new URL(process.env.DATABASE_URL).pathname.slice(1))throw Error('Receipt client DB differs');
  const company=await tx.company.findUniqueOrThrow({where:{id:companyId}});if(company.companyCode!=='DGC'||await tx.company.count()!==1)throw Error('Exactly one DGC required');
  await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
  const staged=await tx.dgcImportSnapshot.findUnique({where:{companyId_snapshotHash:{companyId,snapshotHash:snapshot.snapshotHash}}});
  const rawRows=Object.entries(snapshot.tables).flatMap(([sheet,t])=>t.rows.map(r=>({sheet,t,r}))),stored=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:snapshot.snapshotHash}});
  if(!staged||staged.sourceSpreadsheetId!==SOURCE_ID||staged.rowCount!==rawRows.length||canonical(staged.sourceMetadata)!==canonical(snapshot.source)||stored.length!==rawRows.length||rawRows.some(({sheet,t,r})=>{const x=stored.find(x=>x.sheetId===t.sheetId&&x.sourceRow===r.sourceRow);return !x||x.sheetName!==sheet||x.rowHash!==r.rowHash||canonical(x.payload)!==canonical(r);}))throw Error('Exact full raw staging evidence required');
  const actorId=uuid(companyId,'technical-creator',plan.planHash);await tx.user.create({data:{id:actorId,companyId,email:'receipt-trial-'+actorId+'@example.invalid',fullName:'Inactive receipt shape creator',passwordHash:'NO_LOGIN_RECEIPT_SHAPE',status:'INACTIVE'}});
  const resolve=await masterResolver(tx,snapshot,companyId,decisions),parentIds=new Map();
  for(const p of plan.parents){
   const raw=JSON.parse(p.capturedHeaderJson),v=raw.values,table=snapshot.tables['21_DM_PARTNER'],rows=table.rows.filter(r=>r.legacyId===p.partnerKey);if(rows.length!==1)throw Error('Parent partner binding held');
   const partnerId=await resolve({sheetId:table.sheetId,...rows[0]},'partner'),id=uuid(companyId,'invoice-shell',p.source),documentId=uuid(companyId,'document-shell',p.source),attachmentId=uuid(companyId,'attachment-shell',p.source),pdf=manifest.files.find(f=>f.sourceRow===p.source.sourceRow&&f.rowHash===p.source.rowHash);
   if(!pdf)throw Error('Parent original Invoice PDF missing');
   await tx.attachment.create({data:{id:attachmentId,companyId,originalFilename:pdf.filename,storedFilename:pdf.relativePath,storageProvider:'DGC_REHEARSAL_EVIDENCE',storagePath:pathResolve(invoiceRoot,pdf.relativePath),mimeType:'application/pdf',fileSize:BigInt(pdf.size),checksumSha256:pdf.sha256,uploadedById:null}});
   await tx.document.create({data:{id:documentId,companyId,documentCode:'DGC-RECEIPT-SHAPE-'+id,documentType:'DGC_RECEIPT_SHAPE_PARENT',entityType:'DGC_RECEIPT_SHAPE',entityId:id,documentNumber:p.invoiceNumber,documentDate:new Date(p.invoiceDate),attachmentId,status:'DRAFT',createdById:actorId}});
   await tx.invoice.create({data:{id,companyId,partnerId,invoiceNumber:p.invoiceNumber,businessKey:'DGC-RECEIPT-SHAPE|'+p.source.sourceRow,revisionNo:1,invoiceMode:'CONSOLIDATED',period:p.invoiceDate.slice(0,7),invoiceDate:new Date(p.invoiceDate),dueDate:new Date(p.dueDate),currency:'USD',revenueAmount:String(v.Total_Revenue_USD),whtAmount:String(v.Total_WHT_USD),payableAmount:String(v.Total_Payable_USD),paidAmount:String(v.Paid_Amount_USD),isCurrent:false,status:'CANCELLED',issuedAt:null,issuedById:null,snapshot:{sourceKind:'DGC_RECEIPT_SHAPE_PARENT_ONLY',snapshotHash:snapshot.snapshotHash,source:p.source,capturedHeaderJson:p.capturedHeaderJson,noOperationalAcceptance:true},documentId,createdById:actorId}});
   parentIds.set(p.source.sourceRow,id);
  }
  async function write(){let created=0,unchanged=0;
   for(const e of plan.entries){
    const id=uuid(companyId,'receipt',e.source),data={...e.data,id,companyId,invoiceId:parentIds.get(e.invoiceSource.sourceRow),requestId:uuid(companyId,'request',e.source),requestDigest:digest({source:e.source,snapshotHash:snapshot.snapshotHash,planHash:plan.planHash}),paymentDate:new Date(e.data.paymentDate)},hash=targetHash(data,data);
    const link=await tx.dgcImportLink.findFirst({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow,legacyId:e.source.legacyId}}),old=await tx.invoicePayment.findFirst({where:{companyId,id}});
    if(link){if(!old||link.snapshotHash!==snapshot.snapshotHash||link.rowHash!==e.source.rowHash||link.targetModel!=='invoicePayment'||link.targetId!==id||link.targetHash!==hash||targetHash(old,data)!==hash)throw Error('Receipt source/target provenance drift');unchanged++;continue;}
    if(old)throw Error('Unlinked receipt target');await tx.invoicePayment.create({data});
    await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow,legacyId:e.source.legacyId,rowHash:e.source.rowHash,snapshotHash:snapshot.snapshotHash,targetModel:'invoicePayment',targetId:id,targetHash:hash}});created++;
   }return {created,unchanged};
  }
  const first=await write(),replay=await write();
  const receipts=await tx.invoicePayment.findMany({where:{companyId,id:{in:plan.entries.map(e=>uuid(companyId,'receipt',e.source))}}});
  if(receipts.length!==plan.entries.length||replay.created||replay.unchanged!==receipts.length)throw Error('Receipt replay differs');
  for(const p of receipts){const e=plan.entries.find(e=>e.source.legacyId===p.paymentCode);for(const f of ['paidUsd','allocationAmount','paidVnd','cashAmount','fxRate'])if(p[f].toFixed()!==e.data[f])throw Error('Receipt amount precision changed');if(p.approvedById||p.cashAccountId||p.documentId||canonical(p.historicalSource)!==canonical(e.data.historicalSource)||p.paymentDate.toISOString().slice(0,10)!==e.data.paymentDate)throw Error('Receipt actor/date/evidence changed');}
  if(verify)await verify(tx,{receipts,parentIds,actorId});
  await verifyInvoiceFiles(snapshot,manifest,invoiceRoot);
  const inside=await counts(tx);
  for(const m of ['userRole','authSession','approvalRequest','invoiceScope','invoiceScopeItem','accountReceivable','revenue','reconciliation','cashAccount','cashEntry','cashTransfer','cashHistory','accountPayable','inputReconciliation','invoiceDocumentLink','dgcImportSnapshot','dgcImportRow','auditLog'])if(inside[m]!==before[m])throw Error('Unexpected receipt shape side effect: '+m);
  for(const m of ['invoice','document','attachment'])if(inside[m]!==before[m]+parentIds.size)throw Error('Parent shape footprint differs');
  throw new Rollback({mode:'ROLLBACK_ONLY',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,sourceReceipts:receipts.length,parentShells:parentIds.size,first,replay,before,inside,exactAmountsVerified:true,sourceActorDatePreserved:true,localApprovalCreated:false,historicalCashPosting:false,financialPosting:false,operationalAcceptance:false});
 },{isolationLevel:'Serializable',timeout:120000});throw Error('Receipt trial unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;proof=e.proof;}
 const after=await counts(db);if(canonical(after)!==canonical(before))throw Error('Receipt rollback footprint differs');return {...proof,after,rolledBack:true};
}
