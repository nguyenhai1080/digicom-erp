import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {roundingExceptionInputs,roundingPdf} from './rounding-exception.fixtures.mjs';
import {roundingExceptionPlan} from './rounding-exception.mjs';
import {rehearseRoundingExceptions} from './revenue-rehearsal.mjs';
import {stageSnapshot,applyMasters,requireStaging} from './staging.mjs';
import {masterPlan,canonical} from './core.mjs';
import {readHistoricalRevenueSource,historicalTrialTargetHash} from '../../apps/api/dist/modules/projects/historical-revenue-source.js';
requireStaging(process.env.DATABASE_URL??'');if(!/^\/dgc_migration_staging_rounding_[a-z0-9_]+_synthetic$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Disposable rounding fixture database required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();assert.equal(await db.company.count(),0,'Empty fixture database required');
const root=await mkdtemp(join(tmpdir(),'dgc-rounding-trial-')),options=roundingExceptionInputs();options.root=root;options.exceptionPlan=roundingExceptionPlan(options.snapshot,options.targetPlan,options.combined,options.combinedPin,options.rounding,options.roundingPin);options.groupKeys=options.exceptionPlan.groups.filter(g=>g.state==='CAPTURED_ROUNDING_SHAPE_TRIAL_CANDIDATE').map(g=>g.groupKey);
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
const models=['company','user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportRow','dgcImportLink','auditLog'],counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));class Rollback extends Error{}
try{
 for(const f of options.manifest.files)await writeFile(join(root,f.relativePath),roundingPdf);
 try{await db.$transaction(async tx=>{
  const c=await tx.company.create({data:{companyCode:'DGC',companyName:'Synthetic captured rounding trial'}});options.companyId=c.id;let fault='',proof=[];
  const facade=new Proxy(tx,{get(t,p){if(p==='$transaction')return async fn=>{await tx.$executeRaw`SAVEPOINT rounding_trial`;try{
   const revenues=new Proxy(tx.revenue,{get(d,k){if(k==='create')return async args=>{if(fault==='WRITE_FAIL')throw Error('synthetic rounding write failure');const row=await d.create(args);if(fault==='DRIFT')await d.update({where:{id:row.id},data:{companyShareAmount:row.companyShareAmount.plus(1)}});return row;};const x=d[k];return typeof x==='function'?x.bind(d):x;}});
   const shadow=new Proxy(tx,{get(t,k){if(k==='revenue')return revenues;const x=t[k];return typeof x==='function'?x.bind(t):x;}});
   return await fn(shadow);
  }catch(e){if(e.message==='DGC rehearsal rollback'){
   const rows=await tx.revenue.findMany({where:{companyId:c.id}});eq(rows.length,2);proof=[];
   for(const row of rows){const result=await readHistoricalRevenueSource(tx,c.id,row.id,options.snapshot.snapshotHash);eq(result.capturedAmounts.invoiceUsd,{revenue:'33.33',wht:'3.67',payable:'29.67'});eq(result.historicalArithmetic.identityDelta,'0.01');eq(result.historicalArithmetic.sourceArithmeticReplayed,true);eq(result.historicalArithmetic.operationalFxDerived,false);eq(result.historicalArithmetic.acceptance,false);eq(result.operationalUseAllowed,false);eq(result.approvalEvidence.localApprovalCreated,false);eq(result.approvalEvidence.sourceApprovedAt.rawValue,46245.657010740746);eq(row.netAmount.toFixed(),'29.67');proof.push(result);
    // A forged metadata correction cannot be made valid by rehashing target.
    const original=row.calculationJson,j=structuredClone(original);j.roundingException.identityDelta='0';await tx.revenue.update({where:{id:row.id},data:{calculationJson:j}});await tx.reconciliationItem.update({where:{id:row.reconciliationItemId},data:{calculationJson:j}});await tx.dgcImportLink.updateMany({where:{companyId:c.id,targetId:row.id},data:{targetHash:historicalTrialTargetHash({...row,calculationJson:j})}});
    await reject(()=>readHistoricalRevenueSource(tx,c.id,row.id,options.snapshot.snapshotHash),e=>e.statusCode===409);
    await tx.revenue.update({where:{id:row.id},data:{calculationJson:original}});await tx.reconciliationItem.update({where:{id:row.reconciliationItemId},data:{calculationJson:original}});await tx.dgcImportLink.updateMany({where:{companyId:c.id,targetId:row.id},data:{targetHash:historicalTrialTargetHash(row)}});
   }
  }await tx.$executeRaw`ROLLBACK TO SAVEPOINT rounding_trial`;await tx.$executeRaw`RELEASE SAVEPOINT rounding_trial`;throw e;}};const x=t[p];return typeof x==='function'?x.bind(t):x;}});
  await stageSnapshot(facade,options.snapshot,c.id);await applyMasters(facade,options.snapshot,c.id,'all',masterPlan(options.snapshot).planHash);const before=await counts(tx),run=()=>rehearseRoundingExceptions(facade,options);
  const r=await run();eq(r.first,{groupsCreated:1,created:2,unchanged:0});eq(r.replay,{groupsCreated:0,created:0,unchanged:2});eq(r.rolledBack,true);eq(r.originalGatesUnchanged,true);eq(r.commitAllowed,false);eq(r.footprintBefore,r.footprintAfter);eq(proof.length,2);eq(await counts(tx),before);
  for(const [f,re] of [['WRITE_FAIL',/synthetic rounding write failure/],['DRIFT',/target drift/]]){fault=f;await reject(run,re);eq(await counts(tx),before);}fault='';
  await writeFile(join(root,options.manifest.files[0].relativePath),'bad');await reject(run,/checksum/);eq(await counts(tx),before);await writeFile(join(root,options.manifest.files[0].relativePath),roundingPdf);
  eq((await run()).replay.unchanged,2);eq(await counts(tx),before);throw new Rollback();
 },{isolationLevel:'Serializable',timeout:60000});throw Error('Rounding fixture unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const [,v] of Object.entries(await counts(db)))eq(v,0);
 console.log(`Captured rounding PostgreSQL/runtime adapter: ${n} assertions passed; independent amounts, replay, tamper and complete rollback`);
}finally{await db.$disconnect();if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-rounding-trial-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
