import {canonical,digest,SOURCE_ID} from './core.mjs';
import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {reviewReferenceCustody,verifyReferenceFiles} from './reference-files.mjs';
import {rehearseInvoiceRestore,rehearseInvoiceEvidenceSet,rehearseInvoiceUnifiedSet,rehearseInvoiceUnifiedNativeSet} from './invoice-rehearsal.mjs';
import {verifyReferenceUnifiedPlan,verifyReferenceUnifiedNativePlan} from './reference-unified.mjs';
import {verifyReferenceRoundingPlan,verifyReferenceOffsettingPlan} from './reference-rounding.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {requireStaging} from './staging.mjs';
import {resolve} from 'node:path';
const key=s=>s.sheet+'|'+s.sourceRow;
const models=['user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportLink','auditLog'];
const counts=async db=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
const norm=v=>typeof v==='bigint'?v.toString():v instanceof Date?v.toISOString():v;
const hash=(row,data)=>digest(Object.fromEntries(Object.keys(data).map(k=>[k,norm(row[k])])));
const uuid=(company,kind,source)=>{const h=digest(['DGC_REFERENCE_REHEARSAL',company,kind,source]);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};

export async function referenceRegistrationPlan(options){
 const {invoiceOptions:i,references,referencePin,referenceManifest,referenceRoot,referenceManifestPin}=options;
 verifyInvoiceRestorePlan(i.restorePlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions);
 const custody=await reviewReferenceCustody(i.snapshot,references,referencePin,referenceManifest,referenceRoot,referenceManifestPin);
 const byInvoice=new Map(i.restorePlan.entries.map(e=>[key(e.source),e]));
 const documents=custody.documents.map(d=>{
  const dependencies=d.proposedInvoiceSources.map(source=>{const invoice=byInvoice.get(key(source)),same=invoice&&canonical(invoice.source)===canonical(source);return {source,state:same?invoice.state:'SOURCE_BINDING_MISSING',restoreReasons:same?[...invoice.reasons]:['SOURCE_BINDING_MISSING']};});
  const reasons=[...d.reasons];if(!dependencies.length)reasons.push('NO_CAPTURED_INVOICE_REFERENCES');
  if(dependencies.some(i=>i.state!=='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL'))reasons.push('WHOLE_DOCUMENT_INVOICE_SET_NOT_REHEARSABLE');
  return {...d,dependencies,state:reasons.length?'REGISTRATION_HELD':'WHOLE_DOCUMENT_CANDIDATE_FOR_ROLLBACK_TRIAL',reasons,readyToRegister:false,operationalDocumentStatus:null,safeTrialDocumentStatus:'DRAFT'};
 });
 const blockers=new Map();for(const d of documents)for(const dep of d.dependencies)if(dep.state!=='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL'){const b=blockers.get(key(dep.source))??{...dep,affectedDocuments:[]};b.affectedDocuments.push(d.source);blockers.set(key(dep.source),b);}
 const body={format:'dgc-reference-registration-plan-v1',snapshotHash:i.snapshot.snapshotHash,restorePlanHash:i.restorePlan.planHash,custodyReviewHash:custody.reviewHash,referenceManifestHash:referenceManifestPin,documents,unrehearsableInvoices:[...blockers.values()].sort((a,b)=>b.affectedDocuments.length-a.affectedDocuments.length||a.source.sourceRow-b.source.sourceRow),counts:documents.reduce((a,d)=>(a[d.state]=(a[d.state]??0)+1,a),{}),postingAllowed:false,acceptance:false,registryCommitAllowed:false,historicalCashPosting:false};
 return {...body,planHash:digest(body)};
}
export async function verifyReferenceRegistrationPlan(plan,options){
 const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await referenceRegistrationPlan(options)))throw Error('Reference registration plan differs from pinned evidence');return plan;
}
class ReferenceRollback extends Error{constructor(result){super('DGC reference registration rollback');this.result=result;}}

// Shape trial only: DRAFT evidence documents on CANCELLED/non-current trial
// invoices. It does not relax the ACTIVE/current guards of linkInvoiceDocuments
// or offer a production writer. Every transaction is deliberately rolled back.
async function materialize(tx,companyId,selected,plan,options){
 const i=options.invoiceOptions;let created=0,unchanged=0,linksCreated=0;
 async function record(model,data,adopt){const old=await tx[model].findFirst({where:{companyId,id:data.id}});if(old){if(!adopt||hash(old,data)!==hash(data,data))throw Error('Reference trial target drift '+model);return old;}if(adopt)throw Error('Missing linked reference trial target '+model);return tx[model].create({data});}
 for(const d of selected){
  const source=d.source,id=uuid(companyId,'document',source),attachmentId=uuid(companyId,'attachment',source),entityId=uuid(companyId,'entity',source);
  const old=await tx.dgcImportLink.findFirst({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:source.sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId}}),adopt=!!old;
  const file=options.referenceManifest.files.find(f=>f.fileId===d.fileId);
  if(!file||!file.sources.some(s=>canonical(s)===canonical(source)))throw Error('Missing source document PDF binding');
  const data={id,companyId,documentCode:'DGC-REF-TRIAL-'+id,documentType:d.kind,entityType:'DGC_REFERENCE_REHEARSAL',entityId,documentNumber:null,versionNo:1,documentDate:null,attachmentId,status:'DRAFT',createdById:null};
  if(old&&(old.snapshotHash!==plan.snapshotHash||old.rowHash!==source.rowHash||old.targetModel!=='document'||old.targetId!==id||old.targetHash!==hash(data,data)))throw Error('Reference trial provenance drift');
  const invoiceIds=[];
  for(const dependency of d.dependencies){const s=dependency.source,links=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:s.sheetId,sourceRow:s.sourceRow,legacyId:s.legacyId,snapshotHash:plan.snapshotHash,rowHash:s.rowHash,targetModel:'invoice'}});
   if(links.length!==1)throw Error('Complete Invoice provenance required for reference trial');
   const invoice=await tx.invoice.findFirst({where:{companyId,id:links[0].targetId}});
   if(!invoice||invoice.status!=='CANCELLED'||invoice.isCurrent||invoice.snapshot?.sourceKind!=='DGC_INVOICE_REHEARSAL_ONLY'||invoice.snapshot.snapshotHash!==plan.snapshotHash||canonical(invoice.snapshot.source)!==canonical(s))throw Error('Reference registration requires blocked trial Invoice');
   invoiceIds.push(invoice.id);
  }
  if(!invoiceIds.length||new Set(invoiceIds).size!==invoiceIds.length)throw Error('Complete unique Invoice set required');
  await record('attachment',{id:attachmentId,companyId,originalFilename:'source-reference.pdf',storedFilename:file.relativePath,storageProvider:'DGC_REHEARSAL_EVIDENCE',storagePath:resolve(options.referenceRoot,file.relativePath),mimeType:'application/pdf',fileSize:BigInt(file.size),checksumSha256:file.sha256,uploadedById:null},adopt);
  await record('document',data,adopt);
  const existing=await tx.invoiceDocumentLink.findMany({where:{companyId,documentId:id}});
  if(adopt?(existing.length!==invoiceIds.length||existing.some(l=>l.kind!==d.kind||!invoiceIds.includes(l.invoiceId))):existing.length)throw Error('Reference registry set differs; no partial replay repair');
  if(!adopt){for(const invoiceId of invoiceIds){await tx.invoiceDocumentLink.create({data:{companyId,invoiceId,documentId:id,kind:d.kind}});linksCreated++;}
   await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:source.sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId,rowHash:source.rowHash,snapshotHash:plan.snapshotHash,targetModel:'document',targetId:id,targetHash:hash(data,data)}});
   const raw=i.snapshot.tables[source.sheet].rows.find(r=>r.sourceRow===source.sourceRow);
   await tx.auditLog.create({data:{companyId,action:'DGC_REHEARSE_REFERENCE_ONLY',entityType:'Document',entityId:id,newValue:{snapshotHash:plan.snapshotHash,registrationPlanHash:plan.planHash,source,capturedHeaderJson:canonical(raw),sourceStatus:d.sourceStatus,sourceInvoiceSet:d.dependencies.map(x=>x.source),targetInvoiceIds:invoiceIds,localApprovalCreated:false,sourceStatusPromoted:false},reason:'Rollback-only complete source reference set; DRAFT evidence without approval, issue or cash posting'}});created++;
  }else unchanged++;
 }
 return {created,unchanged,linksCreated};
}

export async function rehearseReferenceRegistration(db,options){
 requireStaging(process.env.DATABASE_URL??'');
 await verifyReferenceRegistrationPlan(options.registrationPlan,options);
 return runReferenceTrial(db,options,options.registrationPlan,false);
}
export async function rehearseReferenceRounding(db,options){
 requireStaging(process.env.DATABASE_URL??'');
 return withSourcePlanningCache(async()=>{await verifyReferenceRoundingPlan(options.referenceRoundingPlan,options);return runReferenceTrial(db,options,options.referenceRoundingPlan,true);});
}
export async function rehearseReferenceOffsetting(db,options){
 requireStaging(process.env.DATABASE_URL??'');
 return withSourcePlanningCache(async()=>{await verifyReferenceOffsettingPlan(options.referenceOffsettingPlan,options);return runReferenceTrial(db,options,options.referenceOffsettingPlan,'OFFSET');});
}
export async function rehearseReferenceUnified(db,options){
 requireStaging(process.env.DATABASE_URL??'');return withSourcePlanningCache(async()=>{await verifyReferenceUnifiedPlan(options.unifiedReferencePlan,options);return runReferenceTrial(db,options,options.unifiedReferencePlan,'UNIFIED');});
}
export async function rehearseReferenceUnifiedNative(db,options){
 requireStaging(process.env.DATABASE_URL??'');return withSourcePlanningCache(async()=>{await verifyReferenceUnifiedNativePlan(options.unifiedReferencePlan,options);return runReferenceTrial(db,options,options.unifiedReferencePlan,'UNIFIED',true);});
}
async function runReferenceTrial(db,options,plan,rounding,nativeExtended=false){
 const {documentSources,invoiceOptions:i}=options;
 // The rounding profile has already rederived all required plans and whole
 // dependency closure. Bind every input here; inside the transaction recheck
 // file bytes and this binding instead of repeating the entire source audit.
 // Staging/master/target checks still run in the Invoice/revenue transaction.
 const validatedInputsHash=rounding?digest(options):null;
 if(!Array.isArray(documentSources)||!documentSources.length||documentSources.some(s=>!s||typeof s.sheet!=='string'||!Number.isInteger(s.sourceRow))||new Set(documentSources.map(key)).size!==documentSources.length)throw Error('Select unique whole source documents');
 const selected=documentSources.map(s=>plan.documents.find(d=>canonical(d.source)===canonical(s)));
 if(selected.some(d=>!d||d.state!==(rounding==='UNIFIED'?'WHOLE_DOCUMENT_UNIFIED_SHAPE_CANDIDATE':rounding==='OFFSET'?'WHOLE_DOCUMENT_OFFSETTING_SHAPE_CANDIDATE':rounding?'WHOLE_DOCUMENT_ROUNDING_SHAPE_CANDIDATE':'WHOLE_DOCUMENT_CANDIDATE_FOR_ROLLBACK_TRIAL')))throw Error('Document has held or incomplete Invoice dependencies');
 if(rounding!=='UNIFIED'&&options.additionalInvoiceSourceRows?.length)throw Error('Additional Invoice selection requires the unified profile');
 const extra=rounding==='UNIFIED'?(options.additionalInvoiceSourceRows??[]):[];if(!Array.isArray(extra)||new Set(extra).size!==extra.length||extra.some(n=>!Number.isInteger(n)||options.unifiedInvoicePlan.entries.find(e=>e.source.sourceRow===n)?.state!=='UNIFIED_INVOICE_SHAPE_CANDIDATE'))throw Error('Additional unified Invoice selection remains held');
 const sourceRows=[...new Set([...selected.flatMap(d=>d.dependencies.map(i=>i.source.sourceRow)),...extra])],before=await counts(db);let result,failure;
 const proxy=new Proxy(db,{get(target,prop){if(prop==='$transaction')return async(fn,settings)=>target.$transaction(async tx=>{
  try{await fn(tx);throw Error('Invoice rehearsal unexpectedly returned');}catch(e){
   if(e.message!=='DGC Invoice trial rollback'||e.result?.restorePlanHash!==(rounding==='UNIFIED'?options.unifiedInvoicePlan.planHash:rounding==='OFFSET'?options.offsettingPlan.planHash:rounding?options.invoiceExceptionPlan.planHash:i.restorePlan.planHash))throw e;
   const first=await materialize(tx,i.companyId,selected,plan,options),replay=await materialize(tx,i.companyId,selected,plan,options);
   if(replay.created||replay.linksCreated||replay.unchanged!==selected.length)throw Error('Reference registry replay differs');
   if(rounding){await verifyReferenceFiles(i.snapshot,options.referenceManifest,options.referenceRoot,options.referenceManifestPin);if(digest(options)!==validatedInputsHash)throw Error('Reference trial input drift');}else await verifyReferenceRegistrationPlan(plan,options);const inside=await counts(tx);
   for(const m of models.filter(m=>!['attachment','document','invoiceDocumentLink','dgcImportLink','auditLog','approvalRequest'].includes(m)))if(inside[m]!==e.result.inside[m])throw Error('Unexpected reference registration side effect '+m);
   if(inside.approvalRequest!==before.approvalRequest)throw Error('Reference trial created a local approval');
   const proof=[];for(const d of selected){const id=uuid(i.companyId,'document',d.source),doc=await tx.document.findFirst({where:{companyId:i.companyId,id},include:{invoiceLinks:true}});if(!doc||doc.status!=='DRAFT'||doc.createdById||doc.invoiceLinks.length!==d.dependencies.length)throw Error('Reference trial lifecycle or complete set differs');proof.push({source:d.source,sourceStatus:d.sourceStatus,targetStatus:doc.status,invoiceLinks:doc.invoiceLinks.length,localApprovalCreated:false,sourceStatusPromoted:false});}
   throw new ReferenceRollback({mode:'ROLLBACK_ONLY',registrationPlanHash:plan.planHash,invoiceSourceRows:sourceRows,invoiceTrial:e.result,first,replay,before,inside,proof,filesVerified:true,fileVerificationScope:rounding?'ORIGINAL_INVOICE_RECON_AND_REFERENCE_PDFS':'ORIGINAL_INVOICE_AND_REFERENCE_PDFS_ONLY',reconFilesReverified:Boolean(rounding),originalGatesUnchanged:true,postingAllowed:false,acceptance:false,registryCommitAllowed:false,historicalCashPosting:false});
  }
 },settings);const x=target[prop];return typeof x==='function'?x.bind(target):x;}});
 try{if(rounding==='UNIFIED'){if(nativeExtended)await rehearseInvoiceUnifiedNativeSet(proxy,{...options,sourceRows});else await rehearseInvoiceUnifiedSet(proxy,{...options,sourceRows});}else if(rounding)await rehearseInvoiceEvidenceSet(proxy,{...options,offsettingPlan:rounding==='OFFSET'?options.offsettingPlan:undefined,sourceRows});else await rehearseInvoiceRestore(proxy,{...i,sourceRows});throw Error('Reference trial unexpectedly committed');}catch(e){if(e instanceof ReferenceRollback)result=e.result;else failure=e;}
 const after=await counts(db);if(canonical(before)!==canonical(after))throw Error('Reference trial rollback footprint differs');if(failure)throw failure;return {...result,after,rolledBack:true};
}
