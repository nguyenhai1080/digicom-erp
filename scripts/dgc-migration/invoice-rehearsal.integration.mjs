import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {invoiceRestorePlan} from './invoice-restore.mjs';
import {rehearseInvoiceRestore} from './invoice-rehearsal.mjs';
import {stageSnapshot,applyMasters,requireStaging} from './staging.mjs';
import {masterPlan,digest,canonical} from './core.mjs';
requireStaging(process.env.DATABASE_URL??'');if(!/^\/dgc_migration_staging_invoice_[a-z0-9_]+_synthetic$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Disposable Invoice fixture database required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
assert.equal(await db.company.count(),0,'Empty fixture database required');
const root=await mkdtemp(join(tmpdir(),'dgc-invoice-trial-')),inputs=invoiceRestoreInputs(),[snapshot,targetPlan,combined,reviewPin,manifest]=inputs,bytes=Buffer.from('%PDF-test');manifest.files[0].sha256=createHash('sha256').update(bytes).digest('hex');const {manifestHash,...m}=manifest;manifest.manifestHash=digest(m);const plan=invoiceRestorePlan(snapshot,targetPlan,combined,reviewPin,manifest,manifest.manifestHash);
const models=['company','user','userRole','authSession','revenue','reconciliation','reconciliationItem','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportRow','dgcImportLink','auditLog'];
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;},counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));class Rollback extends Error{}
try{
 await writeFile(join(root,manifest.files[0].relativePath),bytes);
 try{await db.$transaction(async tx=>{
  const c=await tx.company.create({data:{companyCode:'DGC',companyName:'Synthetic Invoice rollback trial'}});let fault='';
  const facade=new Proxy(tx,{get(target,prop){if(prop==='$transaction')return async fn=>{await tx.$executeRaw`SAVEPOINT invoice_trial_test`;try{
   const delegate=(model)=>new Proxy(tx[model],{get(d,p){if(p==='create'&&model==='invoiceScopeItem'&&fault==='MISSING_ITEM')return async args=>{const row=await d.create(args);await tx.invoiceScopeItem.delete({where:{id:row.id}});return row;};if(p==='create'&&model==='accountReceivable'&&fault==='AR')return async()=>{throw Error('synthetic AR failure');};if(p==='create'&&model==='invoice'&&fault==='DRIFT')return async args=>{const row=await d.create(args);await tx.invoice.update({where:{id:row.id},data:{whtAmount:row.whtAmount.plus(1)}});return row;};const x=d[p];return typeof x==='function'?x.bind(d):x;}});
   const shadow=new Proxy(tx,{get(t,p){if(p==='accountReceivable'||p==='invoice'||p==='invoiceScopeItem')return delegate(p);const x=t[p];return typeof x==='function'?x.bind(t):x;}});
   const result=await fn(shadow);await tx.$executeRaw`RELEASE SAVEPOINT invoice_trial_test`;return result;
  }catch(e){await tx.$executeRaw`ROLLBACK TO SAVEPOINT invoice_trial_test`;await tx.$executeRaw`RELEASE SAVEPOINT invoice_trial_test`;throw e;}};const x=target[prop];return typeof x==='function'?x.bind(target):x;}});
  await stageSnapshot(facade,snapshot,c.id);await applyMasters(facade,snapshot,c.id,'all',masterPlan(snapshot).planHash);const before=await counts(tx);
  const options={snapshot,targetPlan,combined,reviewPin,manifest,manifestPin:manifest.manifestHash,restorePlan:plan,sourceRows:[2],root,companyId:c.id},run=()=>rehearseInvoiceRestore(facade,options);
  const result=await run();eq(result.rolledBack,true);eq(result.first,{created:1,unchanged:0});eq(result.replay,{created:0,unchanged:1});eq(result.before,result.after);eq(result.proof.length,1);eq(result.proof[0].status,'CANCELLED');eq(result.proof[0].isCurrent,false);eq(result.proof[0].paid,'90');eq(result.proof[0].receivable,{original:'90',paid:'90',outstanding:'0',status:'CANCELLED'});eq(result.proof[0].scopeItems,1);eq(result.proof[0].capturedHeaderHashVerified,true);eq(result.paymentRowsRestored,false);eq(result.historicalCashPosting,false);eq(result.inside.user-result.before.user,1);eq(result.inside.authSession,result.before.authSession);eq(result.inside.userRole,result.before.userRole);eq(await counts(tx),before);
  for(const model of ['invoicePayment','cashAccount','cashEntry','cashHistory','cashTransfer','invoiceDocumentLink'])eq(result.inside[model],result.before[model]);
  fault='AR';await reject(run,/synthetic AR failure/);eq(await counts(tx),before);fault='DRIFT';await reject(run,/changed Invoice rehearsal target invoice/);eq(await counts(tx),before);fault='MISSING_ITEM';await reject(run,/Missing linked Invoice rehearsal target invoiceScopeItem/);eq(await counts(tx),before);fault='';
  await writeFile(join(root,manifest.files[0].relativePath),'bad');await reject(run,/checksum/);eq(await counts(tx),before);await writeFile(join(root,manifest.files[0].relativePath),bytes);
  const again=await run();eq(again.first.created,1);eq(again.replay.created,0);eq(await counts(tx),before);throw new Rollback();
 },{isolationLevel:'Serializable',timeout:60000});throw Error('Invoice fixture unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const [model,count] of Object.entries(await counts(db)))eq(count,0);
 console.log(`Invoice/AR PostgreSQL trial: ${n} assertions passed; replay, injected failure/drift, PDF tamper and complete rollback`);
}finally{await db.$disconnect();if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-invoice-trial-'))throw Error('Refusing fixture cleanup outside temp directory');await rm(root,{recursive:true,force:true});}
