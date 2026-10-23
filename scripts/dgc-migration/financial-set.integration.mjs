import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {masterPlan} from './core.mjs';
import {financialSetInputs} from './financial-set.fixtures.mjs';
import {trialPdf} from './reference-registration.fixtures.mjs';
import {invoiceUnifiedPlan} from './invoice-unified.mjs';
import {referenceUnifiedPlan} from './reference-unified.mjs';
import {referenceRegistrationPlan} from './reference-registration.mjs';
import {receiptTargetPlan} from './receipt-target.mjs';
import {rehearseUnifiedFinancialSet} from './financial-set.mjs';
import {stageSnapshot,applyMasters,requireStaging} from './staging.mjs';
import {readHistoricalInvoiceAmounts} from '../../apps/api/dist/modules/projects/historical-invoice-amounts.js';
import {readHistoricalRevenueSource} from '../../apps/api/dist/modules/projects/historical-revenue-source.js';
import {assertInvoiceUnused} from '../../apps/api/dist/modules/projects/invoice-cancel.js';
requireStaging(process.env.DATABASE_URL??'');if(new URL(process.env.DATABASE_URL).pathname!=='/dgc_migration_staging_financial_unified_synthetic')throw Error('Dedicated empty synthetic financial database required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();assert.equal(await db.company.count(),0);
const root=await mkdtemp(join(tmpdir(),'dgc-unified-finance-')),o=financialSetInputs(),i=o.invoiceOptions,models=['company','user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportSnapshot','dgcImportRow','dgcImportLink','auditLog'];
let n=0,invoiceReads=0,revenueReads=0,guardChecks=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;},counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));class Rollback extends Error{}
try{
 o.referenceRoot=root;o.reconRoot=root;i.root=root;for(const f of [...o.referenceManifest.files,...i.manifest.files,...o.reconManifest.files])await writeFile(join(root,f.relativePath),trialPdf);
 o.registrationPlan=await referenceRegistrationPlan(o);o.unifiedInvoicePlan=invoiceUnifiedPlan(o);o.unifiedReferencePlan=await referenceUnifiedPlan(o);o.receiptPlan=receiptTargetPlan(i.snapshot);o.documentSources=o.unifiedReferencePlan.documents.map(d=>d.source);o.additionalInvoiceSourceRows=o.unifiedInvoicePlan.entries.map(e=>e.source.sourceRow);
 try{await db.$transaction(async tx=>{
  i.companyId=(await tx.company.create({data:{companyCode:'DGC',companyName:'Synthetic unified financial set'}})).id;let fault='',receiptWrites=0,registryWrites=0;
  const facade=new Proxy(tx,{get(t,k){if(k==='$transaction')return async fn=>{await tx.$executeRaw`SAVEPOINT unified_financial_trial`;receiptWrites=0;registryWrites=0;try{
   const shadow=new Proxy(tx,{get(t,k){if(['invoicePayment','invoiceDocumentLink'].includes(k))return new Proxy(t[k],{get(d,p){if(p==='create')return async args=>{if(k==='invoicePayment'&&fault==='RECEIPT_MID'&&receiptWrites++===1)throw Error('synthetic receipt failure');if(k==='invoiceDocumentLink'&&fault==='REGISTRY_MID'&&registryWrites++===1)throw Error('synthetic registry failure');return d.create(args);};const v=d[p];return typeof v==='function'?v.bind(d):v;}});const v=t[k];return typeof v==='function'?v.bind(t):v;}});
   return await fn(shadow);
  }catch(e){await tx.$executeRaw`ROLLBACK TO SAVEPOINT unified_financial_trial`;throw e;}finally{await tx.$executeRaw`RELEASE SAVEPOINT unified_financial_trial`;}};const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  await stageSnapshot(facade,i.snapshot,i.companyId);await applyMasters(facade,i.snapshot,i.companyId,'all',masterPlan(i.snapshot).planHash);const before=await counts(tx);
  const run=()=>rehearseUnifiedFinancialSet(facade,o,async t=>{
   const invoices=await t.invoice.findMany({where:{companyId:i.companyId},include:{receivable:true}});eq(invoices.length,5);invoiceReads=0;revenueReads=0;guardChecks=0;
   for(const invoice of invoices){const e=o.unifiedInvoicePlan.entries.find(e=>e.source.sourceRow===invoice.snapshot.source.sourceRow);eq(invoice.status,'CANCELLED');eq(invoice.isCurrent,false);eq(invoice.payableAmount.toFixed(),e.invoice.payableAmount);eq(invoice.receivable.paidAmount.toFixed(),e.receivable.paidAmount);if(e.sourceProfile!=='STRICT'){const r=await readHistoricalInvoiceAmounts(t,i.companyId,invoice.id,i.snapshot.snapshotHash);eq(r.operationalUseAllowed,false);eq(r.historicalCashPosting,false);invoiceReads++;}await reject(()=>assertInvoiceUnused(t,i.companyId,invoice.id),e=>e.statusCode===409);guardChecks++;}
   const revenues=await t.revenue.findMany({where:{companyId:i.companyId}});for(const r of revenues){const read=await readHistoricalRevenueSource(t,i.companyId,r.id,i.snapshot.snapshotHash);eq(read.operationalUseAllowed,false);revenueReads++;}
   const payments=await t.invoicePayment.findMany({where:{companyId:i.companyId}});eq(payments.length,2);eq(payments.find(p=>p.paymentCode==='V3_PAY').paidVnd.toFixed(),'2250000.12345678');eq(payments.find(p=>p.paymentCode==='V3_PAY').fxRate.toFixed(),'25000.123456789123');for(const p of payments){eq(p.approvedById,null);eq(p.cashAccountId,null);eq(p.documentId,null);}
   eq(await t.invoiceDocumentLink.count({where:{companyId:i.companyId}}),10);eq(await t.cashEntry.count(),0);eq(await t.cashAccount.count(),0);eq(await t.approvalRequest.count(),0);eq(await t.authSession.count(),0);
  });
  const r=await run();eq(r.rolledBack,true);eq(r.before,r.after);eq(r.reference.invoiceTrial.first,{created:5,unchanged:0});eq(r.reference.first,{created:2,unchanged:0,linksCreated:10});eq(r.receipts.first,{created:2,unchanged:0});eq(r.receipts.replay,{created:0,unchanged:2});eq(r.receipts.parentShellsCreated,0);eq(invoiceReads,4);eq(guardChecks,5);eq(revenueReads,16);eq(await counts(tx),before);
  for(const [f,re] of [['RECEIPT_MID',/synthetic receipt failure/],['REGISTRY_MID',/synthetic registry failure/]]){fault=f;await reject(run,re);eq(await counts(tx),before);}fault='';
  const bad={...o,additionalInvoiceSourceRows:[999]};await reject(()=>rehearseUnifiedFinancialSet(facade,bad),/remains held/);eq(await counts(tx),before);
  eq((await run()).receipts.replay.created,0);eq(await counts(tx),before);throw new Rollback();
 },{isolationLevel:'Serializable',timeout:120000});throw Error('Unified fixture unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const v of Object.values(await counts(db)))eq(v,0);console.log(`Unified financial PostgreSQL: ${n} assertions passed; five profiles, registry, exact receipts, mid-write failure and full rollback`);
}finally{await db.$disconnect();if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-unified-finance-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
