import {lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {canonical,digest,SOURCE_ID} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {verifyReconFiles} from './recon-files.mjs';
import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {rehearseRevenue,rehearseInvoiceRoundingSources} from './revenue-rehearsal.mjs';
import {verifyInvoiceRoundingPlan} from './invoice-rounding.mjs';
import {verifyInvoiceOffsettingPlan,verifyInvoiceSourceRoundingPlan} from './invoice-offsetting.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
const models=['user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportLink','auditLog'];
const counts=async db=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
const normalized=v=>v instanceof Date?v.toISOString():typeof v==='bigint'?v.toString():v?.toFixed?v.toFixed():v;
const hash=(row,data)=>digest(Object.fromEntries(Object.keys(data).map(k=>[k,normalized(row[k])])));
const uuid=(company,kind,s)=>{const h=digest(['DGC_INVOICE_REHEARSAL',company,kind,s]);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
class InvoiceRollback extends Error{constructor(result){super('DGC Invoice trial rollback');this.result=result;}}

async function verifiedFiles(snapshot,manifest,root,pin){
 const {manifestHash,...body}=manifest;if(manifestHash!==pin||digest(body)!==pin)throw Error('Invoice file manifest pin differs');
 if((await lstat(root)).isSymbolicLink())throw Error('Invoice evidence root cannot be a symlink');
 const base=await realpath(root);for(const f of manifest.files){const stat=await lstat(resolve(base,f.relativePath));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error('Invalid original Invoice file');}
 return verifyInvoiceFiles(snapshot,manifest,base);
}
async function materialize(tx,companyId,selected,plan,root,actorId){
 let created=0,unchanged=0;
 async function record(model,data,adopt){const old=await tx[model].findFirst({where:{companyId,id:data.id}});if(old){if(!adopt||hash(old,data)!==hash(data,data))throw Error('Unlinked or changed Invoice rehearsal target '+model);return old;}if(adopt)throw Error('Missing linked Invoice rehearsal target '+model);return tx[model].create({data});}
 async function linked(source,model){const links=await tx.dgcImportLink.findMany({where:{companyId,snapshotHash:plan.snapshotHash,sourceSpreadsheetId:SOURCE_ID,sheetId:source.sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId,rowHash:source.rowHash,targetModel:model}});if(links.length!==1)throw Error('Missing or ambiguous source target '+model);return links[0].targetId;}
 async function provenance(source,model,data,required){
  const old=await tx.dgcImportLink.findFirst({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:source.sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId}}),targetHash=hash(data,data);
  if(old){if(old.snapshotHash!==plan.snapshotHash||old.rowHash!==source.rowHash||old.targetModel!==model||old.targetId!==data.id||old.targetHash!==targetHash)throw Error('Invoice rehearsal provenance drift');}
  else{if(required)throw Error('Missing Invoice rehearsal provenance');await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:source.sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId,rowHash:source.rowHash,snapshotHash:plan.snapshotHash,targetModel:model,targetId:data.id,targetHash}});}
 }
 for(const e of selected){
  const id=uuid(companyId,'invoice',e.source),attachmentId=uuid(companyId,'attachment',e.source),documentId=uuid(companyId,'document',e.source),s=e.invoice;
  const oldLink=await tx.dgcImportLink.findFirst({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:e.source.sheetId,sourceRow:e.source.sourceRow,legacyId:e.source.legacyId}}),adopt=Boolean(oldLink);
  if(oldLink&&(oldLink.snapshotHash!==plan.snapshotHash||oldLink.rowHash!==e.source.rowHash||oldLink.targetModel!=='invoice'||oldLink.targetId!==id))throw Error('Changed Invoice rehearsal source');
  if(!adopt&&await tx.invoice.findFirst({where:{companyId,invoiceNumber:s.invoiceNumber}}))throw Error('Invoice number exists without rehearsal provenance');
  const partnerId=await linked(e.scopes[0].partnerSource,'partner');
  await record('attachment',{id:attachmentId,companyId,originalFilename:'source-invoice.pdf',storedFilename:e.pdf.relativePath,storageProvider:'DGC_REHEARSAL_EVIDENCE',storagePath:resolve(root,e.pdf.relativePath),mimeType:'application/pdf',fileSize:BigInt(e.pdf.size),checksumSha256:e.pdf.sha256,uploadedById:null},adopt);
  await record('document',{id:documentId,companyId,documentCode:'DGC-TRIAL-'+id,documentType:'DGC_REHEARSAL_EVIDENCE',entityType:'DGC_INVOICE_REHEARSAL',entityId:id,documentNumber:s.invoiceNumber,versionNo:s.sourceRevisionNo,documentDate:new Date(s.invoiceDate+'T00:00:00Z'),attachmentId,status:'DRAFT',createdById:actorId},adopt);
  const rows=await Promise.all(e.scopes.flatMap(scope=>scope.items.map(async item=>{const revenueId=await linked(item.source,'revenue'),revenue=await tx.revenue.findFirst({where:{companyId,id:revenueId}});if(!revenue||revenue.isCurrent||revenue.status!=='BLOCKED'||revenue.partnerId!==partnerId||revenue.contractId!==await linked(scope.contractSource,'contract'))throw Error('Invoice trial requires blocked rehearsal revenue');return {source:item.source,revenue};})));
  const snapshot={sourceKind:'DGC_INVOICE_REHEARSAL_ONLY',snapshotHash:plan.snapshotHash,restorePlanHash:plan.planHash,source:e.source,sourceStatus:e.sourceStatus,capturedHeaderJson:e.capturedHeaderJson,capturedDetailsJson:e.capturedDetailsJson,capturedReceivablesJson:e.capturedReceivablesJson,capturedPaymentsJson:e.capturedPaymentsJson,sourceRevenueIds:rows.map(r=>r.revenue.id),pdfEvidence:{sha256:e.pdf.sha256,size:e.pdf.size,fileId:e.pdf.fileId},noApprovalOrPosting:true,historicalCashPosting:false,paymentRestorePolicy:e.paymentRestorePolicy};
  if(e.invoiceRounding)snapshot.roundingException=e.invoiceRounding;
  const data={id,companyId,invoiceNumber:s.invoiceNumber,businessKey:'DGC-TRIAL|'+plan.snapshotHash+'|'+e.source.sourceRow,revisionNo:s.sourceRevisionNo,isCurrent:false,status:s.safeTrialStatus,partnerId,period:s.period,invoiceMode:s.invoiceMode,serviceId:s.invoiceMode==='PER_SERVICE'?rows[0].revenue.serviceId:null,invoiceDate:new Date(s.invoiceDate+'T00:00:00Z'),dueDate:new Date(s.dueDate+'T00:00:00Z'),currency:s.currency,revenueAmount:s.revenueAmount,whtAmount:s.whtAmount,payableAmount:s.payableAmount,paidAmount:s.paidAmount,issuedAt:null,issuedById:null,snapshot,documentId,createdById:actorId};
  await record('invoice',data,adopt);await provenance(e.source,'invoice',data,adopt);
  for(const scope of e.scopes){const scopeId=uuid(companyId,'scope',scope.proposalScopeKey),contractId=await linked(scope.contractSource,'contract');
   await record('invoiceScope',{id:scopeId,companyId,invoiceId:id,scopeCode:'DGC-TRIAL-'+scopeId,logicalGroupId:uuid(companyId,'scope-group',scope.proposalScopeKey),revisionNo:1,isCurrent:false,partnerId,contractId,periodType:'MONTHLY',periodStart:new Date(scope.period+'-01T00:00:00Z'),periodEnd:new Date(Date.UTC(Number(scope.period.slice(0,4)),Number(scope.period.slice(5,7)),0)),invoiceMode:scope.proposedInvoiceMode,scopeKey:'DGC-TRIAL|'+scope.proposalScopeKey,currency:scope.currency,totalAmount:scope.totalAmount,status:'BLOCKED'},adopt);
   for(const item of scope.items)await record('invoiceScopeItem',{id:uuid(companyId,'scope-item',[scope.proposalScopeKey,item.source]),companyId,scopeId,revenueId:await linked(item.source,'revenue'),lineNo:item.proposedLineNo,amount:item.scopeItemAmount,isCurrent:false},adopt);
  }
  const a=e.receivable,ar={id:uuid(companyId,'ar',a.source),companyId,invoiceId:id,originalAmount:a.originalAmount,paidAmount:a.paidAmount,outstandingAmount:a.outstandingAmount,status:a.safeTrialStatus};await record('accountReceivable',ar,adopt);await provenance(a.source,'accountReceivable',ar,adopt);
  if(adopt)unchanged++;else{created++;await tx.auditLog.create({data:{companyId,userId:actorId,action:'DGC_REHEARSE_INVOICE_ONLY',entityType:'Invoice',entityId:id,newValue:{snapshotHash:plan.snapshotHash,restorePlanHash:plan.planHash,source:e.source,status:s.safeTrialStatus,isCurrent:false},reason:'Rollback-only Invoice/AR shape trial; disabled technical creator, no source approval, payment or cash posting'}});}
 }
 return {created,unchanged};
}

// No commit path. Reuse the revenue rehearsal's staging/master checks and
// intercept its deliberate rollback while all newly created records are visible.
export async function rehearseInvoiceRestore(db,{snapshot,targetPlan,combined,reviewPin,manifest,manifestPin,decisions,restorePlan,sourceRows,root,companyId}){
 requireStaging(process.env.DATABASE_URL??'');verifyInvoiceRestorePlan(restorePlan,snapshot,targetPlan,combined,reviewPin,manifest,manifestPin,decisions);
 if(!Array.isArray(sourceRows)||!sourceRows.length||new Set(sourceRows).size!==sourceRows.length)throw Error('Select unique complete Invoice source rows');
 const selected=sourceRows.map(row=>restorePlan.entries.find(e=>e.source.sourceRow===row));if(selected.some(e=>!e||e.state!=='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL'))throw Error('Invoice selection is held, draft, archived or missing');
 return runInvoiceTrial(db,{snapshot,targetPlan,combined,reviewPin,manifest,manifestPin,decisions,restorePlan,sourceRows,root,companyId},selected);
}

export async function rehearseInvoiceRounding(db,options){
 return invoiceEvidenceSet(db,options,false);
}
export async function rehearseInvoiceOffsetting(db,options){
 return exactHeaderTrial(db,options,false);
}
export async function rehearseInvoiceSourceRounding(db,options){
 return exactHeaderTrial(db,options,true);
}
async function exactHeaderTrial(db,options,sourceOnly){
 requireStaging(process.env.DATABASE_URL??'');
 return withSourcePlanningCache(async()=>{const {invoiceOptions:i,sourceRows}=options,p=sourceOnly?options.sourceRoundingPlan:options.offsettingPlan;(sourceOnly?verifyInvoiceSourceRoundingPlan:verifyInvoiceOffsettingPlan)(p,options);
  if(!Array.isArray(sourceRows)||!sourceRows.length||new Set(sourceRows).size!==sourceRows.length)throw Error('Select unique whole offsetting Invoices');
  const selected=sourceRows.map(n=>p.entries.find(e=>e.source.sourceRow===n));if(selected.some(e=>!e||e.state!==(sourceOnly?'INVOICE_SOURCE_ROUNDING_SHAPE_CANDIDATE':'INVOICE_OFFSETTING_SHAPE_CANDIDATE')))throw Error('Other Invoice/source/scope gates remain held');
  const r=await runInvoiceTrial(db,{...i,restorePlan:p,sourceRows},selected,options);return {...r,shapeProfile:sourceOnly?'EXACT_PRESENTED_LINES_WITH_SOURCE_ROUNDING':'OFFSETTING_CHARACTERIZED_LINE_DELTAS',originalGatesUnchanged:true,commitAllowed:false};
 });
}
// Whole-document trials may combine strict, nonzero-header and offsetting-line
// shapes. Every supplied profile is rederived; the regular importer stays closed.
export async function rehearseInvoiceEvidenceSet(db,options){return invoiceEvidenceSet(db,options,true);}
async function invoiceEvidenceSet(db,options,allowStrict){
 requireStaging(process.env.DATABASE_URL??'');const {invoiceOptions:i,invoiceExceptionPlan:p,sourceRows}=options;verifyInvoiceRoundingPlan(p,options);
 const offsetting=allowStrict&&options.offsettingPlan;if(offsetting)verifyInvoiceOffsettingPlan(offsetting,options);
 if(!Array.isArray(sourceRows)||!sourceRows.length||new Set(sourceRows).size!==sourceRows.length)throw Error('Select unique whole rounding Invoices');
 const selected=sourceRows.map(n=>{const e=p.entries.find(e=>e.source.sourceRow===n);if(e?.state==='INVOICE_ROUNDING_SHAPE_CANDIDATE')return e;const strict=i.restorePlan.entries.find(e=>e.source.sourceRow===n);if(allowStrict&&strict?.state==='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL')return strict;const o=offsetting&&offsetting.entries.find(e=>e.source.sourceRow===n);return o?.state==='INVOICE_OFFSETTING_SHAPE_CANDIDATE'?o:null;});if(selected.some(e=>!e))throw Error('Other Invoice/source/scope gates remain held');
 const result=await runInvoiceTrial(db,{...i,restorePlan:offsetting||p,sourceRows},selected,options);return {...result,shapeProfile:offsetting?'STRICT_ROUNDING_AND_OFFSETTING_INVOICE_SHAPES':allowStrict?'STRICT_AND_CAPTURED_INVOICE_SHAPES':'CAPTURED_INVOICE_ROUNDING_ONLY',originalGatesUnchanged:true,commitAllowed:false};
}

async function runInvoiceTrial(db,{snapshot,targetPlan,combined,reviewPin,manifest,manifestPin,decisions,restorePlan,sourceRows,root,companyId},selected,roundingOptions){
 await verifiedFiles(snapshot,manifest,root,manifestPin);const before=await counts(db),groups=[...new Set(selected.flatMap(e=>e.revenueGroupKeys))];let result,failure;
 const proxy=new Proxy(db,{get(target,prop){if(prop==='$transaction')return async(fn,options)=>target.$transaction(async tx=>{
  try{await fn(tx);throw Error('Revenue rehearsal unexpectedly returned');}catch(e){
   if(e.message!=='DGC rehearsal rollback'||e.result?.snapshotHash!==snapshot.snapshotHash||e.result?.planHash!==targetPlan.planHash)throw e;
   const actorId=uuid(companyId,'technical-actor',restorePlan.planHash);if(await tx.user.findFirst({where:{OR:[{id:actorId},{email:'dgc-trial-'+actorId+'@example.invalid'}]}}))throw Error('Technical trial actor already exists');
   await tx.user.create({data:{id:actorId,companyId,email:'dgc-trial-'+actorId+'@example.invalid',fullName:'Disabled migration trial creator',passwordHash:'NO_LOGIN_REHEARSAL_ONLY',status:'INACTIVE'}});
   const first=await materialize(tx,companyId,selected,restorePlan,root,actorId),replay=await materialize(tx,companyId,selected,restorePlan,root,actorId);if(replay.created||replay.unchanged!==selected.length)throw Error('Invoice rehearsal replay differs');
   await verifiedFiles(snapshot,manifest,root,manifestPin);
   if(roundingOptions)await verifyReconFiles(snapshot,roundingOptions.reconManifest,roundingOptions.reconRoot,roundingOptions.reconManifestPin);
   const inside=await counts(tx);
   for(const model of ['approvalRequest','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','invoiceDocumentLink','userRole','authSession'])if(inside[model]!==before[model])throw Error('Unexpected Invoice rehearsal downstream effect');
   const invoices=await tx.invoice.findMany({where:{companyId,id:{in:selected.map(e=>uuid(companyId,'invoice',e.source))}},include:{receivable:true,scopes:{include:{items:true}}}});
   const proof=invoices.map(i=>{const e=selected.find(e=>e.source.sourceRow===i.snapshot.source.sourceRow),raw=JSON.parse(i.snapshot.capturedHeaderJson);if(digest({values:raw.values,cells:raw.cells})!==e.source.rowHash||i.isCurrent||i.status!=='CANCELLED'||i.issuedAt||i.issuedById||i.scopes.some(s=>s.isCurrent||s.status!=='BLOCKED'||s.items.some(x=>x.isCurrent)))throw Error('Trial lifecycle or captured Invoice evidence changed');return {source:e.source,status:i.status,isCurrent:i.isCurrent,payable:i.payableAmount.toFixed(),paid:i.paidAmount.toFixed(),receivable:{original:i.receivable.originalAmount.toFixed(),paid:i.receivable.paidAmount.toFixed(),outstanding:i.receivable.outstandingAmount.toFixed(),status:i.receivable.status},scopes:i.scopes.length,scopeItems:i.scopes.reduce((n,s)=>n+s.items.length,0),capturedHeaderHashVerified:true};});
   throw new InvoiceRollback({mode:'ROLLBACK_ONLY',restorePlanHash:restorePlan.planHash,invoiceManifestHash:manifestPin,sourceRows,revenueRehearsal:{first:e.result.first,replay:e.result.replay},first,replay,before,inside,proof,postingAllowed:false,acceptance:false,historicalCashPosting:false,paymentRowsRestored:false,technicalActorPolicy:'EPHEMERAL_INACTIVE_NO_ROLES_OR_SESSION',filesVerified:true,fileVerificationScope:roundingOptions?'ORIGINAL_INVOICE_AND_RECON_PDFS':'ORIGINAL_INVOICE_PDFS_ONLY',reconFilesReverified:Boolean(roundingOptions)});
  }
 },options);const member=target[prop];return typeof member==='function'?member.bind(target):member;}});
 try{if(roundingOptions)await rehearseInvoiceRoundingSources(proxy,{snapshot,companyId,targetPlan,combined,combinedPin:reviewPin,rounding:roundingOptions.rounding,roundingPin:roundingOptions.roundingPin,exceptionPlan:roundingOptions.exceptionPlan,groupKeys:groups,decisions,manifest:roundingOptions.reconManifest,manifestPin:roundingOptions.reconManifestPin,root:roundingOptions.reconRoot});else await rehearseRevenue(proxy,snapshot,companyId,targetPlan,groups,targetPlan.planHash,decisions);throw Error('Invoice rehearsal unexpectedly completed');}catch(e){if(e instanceof InvoiceRollback)result=e.result;else failure=e;}
 const after=await counts(db);if(canonical(after)!==canonical(before))throw Error('Invoice rehearsal rollback footprint differs');if(failure)throw failure;return {...result,after,rolledBack:true};
}
