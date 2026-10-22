import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {trialPdf} from './reference-registration.fixtures.mjs';
import {referenceRoundingInputs} from './reference-rounding.fixtures.mjs';
import {referenceRoundingPlan} from './reference-rounding.mjs';
import {readHistoricalInvoiceAmounts} from '../../apps/api/dist/modules/projects/historical-invoice-amounts.js';
import {readHistoricalRevenueSource} from '../../apps/api/dist/modules/projects/historical-revenue-source.js';
import {referenceRegistrationPlan,rehearseReferenceRounding} from './reference-registration.mjs';
import {stageSnapshot,applyMasters,requireStaging} from './staging.mjs';
import {masterPlan,canonical} from './core.mjs';
import {assertInvoiceUnused} from '../../apps/api/dist/modules/projects/invoice-cancel.js';
requireStaging(process.env.DATABASE_URL??'');if(!/^\/dgc_migration_staging_reference_[a-z0-9_]+_synthetic$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Disposable reference fixture database required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
assert.equal(await db.company.count(),0,'Empty fixture database required');
const root=await mkdtemp(join(tmpdir(),'dgc-reference-trial-')),options=referenceRoundingInputs(),i=options.invoiceOptions;
options.referenceRoot=root;options.reconRoot=root;i.root=root;const snapshot=i.snapshot;
const models=['company','user','userRole','authSession','approvalRequest','revenue','reconciliation','reconciliationItem','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportRow','dgcImportLink','auditLog'];
let n=0,guardChecks=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;},counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));class Rollback extends Error{}
try{
 for(const f of [...options.referenceManifest.files,...i.manifest.files,...options.reconManifest.files])await writeFile(join(root,f.relativePath),trialPdf);
 options.registrationPlan=await referenceRegistrationPlan(options);options.referenceRoundingPlan=await referenceRoundingPlan(options);options.documentSources=options.referenceRoundingPlan.documents.map(d=>d.source);
 try{await db.$transaction(async tx=>{
  const c=await tx.company.create({data:{companyCode:'DGC',companyName:'Synthetic reference registration trial'}});i.companyId=c.id;let fault='',made=0;
  const facade=new Proxy(tx,{get(target,prop){if(prop==='$transaction')return async fn=>{await tx.$executeRaw`SAVEPOINT reference_trial_test`;made=0;try{
   const registry=new Proxy(tx.invoiceDocumentLink,{get(d,p){if(p==='create')return async args=>{
    if(fault==='MID_SET'&&made===1)throw Error('synthetic registry failure');
    const r=await d.create(args);made++;
    if(fault==='INPUT_DRIFT')options.referenceRoundingPlan.documents[0].sourceStatus='forged-source-status';
    if(fault==='KIND_DRIFT')await tx.invoiceDocumentLink.update({where:{companyId_invoiceId_documentId:{companyId:r.companyId,invoiceId:r.invoiceId,documentId:r.documentId}},data:{kind:r.kind==='SOA'?'APPROVAL_PACKAGE':'SOA'}});
    if(fault==='MISSING_LINK')await tx.invoiceDocumentLink.delete({where:{companyId_invoiceId_documentId:{companyId:r.companyId,invoiceId:r.invoiceId,documentId:r.documentId}}});
    return r;
   };const x=d[p];return typeof x==='function'?x.bind(d):x;}});
   const documents=new Proxy(tx.document,{get(d,p){if(p==='create')return async args=>{const r=await d.create(args);if(r.entityType==='DGC_REFERENCE_REHEARSAL'&&fault==='DOC_ACTIVE')await tx.document.update({where:{id:r.id},data:{status:'ACTIVE'}});return r;};const x=d[p];return typeof x==='function'?x.bind(d):x;}});
   const shadow=new Proxy(tx,{get(t,p){if(p==='invoiceDocumentLink')return registry;if(p==='document')return documents;const x=t[p];return typeof x==='function'?x.bind(t):x;}});
   const result=await fn(shadow);await tx.$executeRaw`RELEASE SAVEPOINT reference_trial_test`;return result;
  }catch(e){
   if(e.message==='DGC reference registration rollback'){
    const invoices=await tx.invoice.findMany({where:{companyId:c.id}});eq(invoices.length,2);let roundingInvoices=0;
    for(const invoice of invoices)if(invoice.snapshot.roundingException){const r=await readHistoricalInvoiceAmounts(tx,c.id,invoice.id,snapshot.snapshotHash);eq(r.components,{revenue:'33.33',wht:'3.67',payable:'29.67'});eq(r.operationalUseAllowed,false);roundingInvoices++;}
    eq(roundingInvoices,1);
    const sources=await tx.revenue.findMany({where:{companyId:c.id}});eq(sources.length,4);for(const row of sources){const r=await readHistoricalRevenueSource(tx,c.id,row.id,snapshot.snapshotHash);eq(r.operationalUseAllowed,false);eq(r.localState.status,'BLOCKED');}
    const links=await tx.invoiceDocumentLink.findMany({where:{companyId:c.id}});eq(links.length,4);
    // Exercise the actual runtime cancellation dependency guard, even though
    // the trial Invoice itself deliberately remains non-operational.
    for(const keep of ['SOA','APPROVAL_PACKAGE']){
     await tx.$executeRaw`SAVEPOINT reference_guard_only`;
     await tx.invoiceDocumentLink.deleteMany({where:{companyId:c.id,kind:{not:keep}}});
     for(const id of new Set(links.map(l=>l.invoiceId))){await reject(()=>assertInvoiceUnused(tx,c.id,id),/SOA|phê duyệt/);guardChecks++;}
     await tx.$executeRaw`ROLLBACK TO SAVEPOINT reference_guard_only`;await tx.$executeRaw`RELEASE SAVEPOINT reference_guard_only`;
    }
    eq((await tx.document.findMany({where:{companyId:c.id,entityType:'DGC_REFERENCE_REHEARSAL'}})).every(d=>d.status==='DRAFT'&&d.createdById===null),true);
    const audits=await tx.auditLog.findMany({where:{companyId:c.id,action:'DGC_REHEARSE_REFERENCE_ONLY'}});eq(audits.length,2);
    eq(audits.every(a=>{const s=a.newValue.source;return a.newValue.capturedHeaderJson===canonical(snapshot.tables[s.sheet].rows.find(r=>r.sourceRow===s.sourceRow));}),true);
   }
   await tx.$executeRaw`ROLLBACK TO SAVEPOINT reference_trial_test`;await tx.$executeRaw`RELEASE SAVEPOINT reference_trial_test`;throw e;
  }};const x=target[prop];return typeof x==='function'?x.bind(target):x;}});
  await stageSnapshot(facade,snapshot,c.id);await applyMasters(facade,snapshot,c.id,'all',masterPlan(snapshot).planHash);const before=await counts(tx),run=()=>rehearseReferenceRounding(facade,options);
  const result=await run();eq(result.rolledBack,true);eq(result.first,{created:2,unchanged:0,linksCreated:4});eq(result.replay,{created:0,unchanged:2,linksCreated:0});eq(result.before,result.after);eq(result.proof.map(d=>[d.sourceStatus,d.targetStatus,d.invoiceLinks]),[['Draft','DRAFT',2],['Approved','DRAFT',2]]);eq(result.registryCommitAllowed,false);eq(result.historicalCashPosting,false);eq(result.proof.every(d=>!d.sourceStatusPromoted&&!d.localApprovalCreated),true);
  for(const model of ['invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','userRole','authSession','approvalRequest'])eq(result.inside[model],result.before[model]);
  eq(result.inside.invoiceDocumentLink-result.before.invoiceDocumentLink,4);eq(await counts(tx),before);
  eq(result.reconFilesReverified,true);eq(result.fileVerificationScope,'ORIGINAL_INVOICE_RECON_AND_REFERENCE_PDFS');eq(result.originalGatesUnchanged,true);
  const sourceStatus=options.referenceRoundingPlan.documents[0].sourceStatus;
  for(const [f,error] of [['MID_SET',/synthetic registry failure/],['KIND_DRIFT',/registry set differs/],['MISSING_LINK',/registry set differs/],['DOC_ACTIVE',/target drift document/],['INPUT_DRIFT',/Reference trial input drift/]]){fault=f;await reject(run,error);options.referenceRoundingPlan.documents[0].sourceStatus=sourceStatus;eq(await counts(tx),before);}fault='';
  const path=join(root,options.referenceManifest.files[0].relativePath);await writeFile(path,'bad');await reject(run,/bytes differ/);eq(await counts(tx),before);await writeFile(path,trialPdf);
  const again=await run();eq(again.first.created,2);eq(again.replay.created,0);eq(await counts(tx),before);eq(guardChecks,8);
  eq(canonical(options.documentSources),canonical(options.registrationPlan.documents.map(d=>d.source)));throw new Rollback();
 },{isolationLevel:'Serializable',timeout:60000});throw Error('Reference fixture unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const [,count] of Object.entries(await counts(db)))eq(count,0);
 console.log(`Historical reference rounding PostgreSQL trial: ${n} assertions passed; runtime guard, replay, injected failure/drift and complete rollback`);
}finally{await db.$disconnect();if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-reference-trial-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
