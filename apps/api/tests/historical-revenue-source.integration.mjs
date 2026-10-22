import assert from 'node:assert/strict';
import {prisma,Prisma} from '@erp/db';
import {masterPlan} from '../../../scripts/dgc-migration/core.mjs';
import {requireStaging} from '../../../scripts/dgc-migration/staging.mjs';
import {stageSnapshot,applyMasters} from '../../../scripts/dgc-migration/staging.mjs';
import {rehearseRevenue} from '../../../scripts/dgc-migration/revenue-rehearsal.mjs';
import {historicalRevenueFixture} from './historical-revenue-source.fixtures.mjs';
import {readHistoricalRevenueSource} from '../dist/modules/projects/historical-revenue-source.js';
requireStaging(process.env.DATABASE_URL??'');
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/dgc_migration_staging_source_')||!new URL(process.env.DATABASE_URL).pathname.endsWith('_synthetic'))throw Error('Dedicated disposable source-reader database required');
assert.equal(await prisma.company.count(),0,'Empty synthetic database required');
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async fn=>{await assert.rejects(fn,e=>e.statusCode===409);n++;};
const f=historicalRevenueFixture(),tables=['company','revenue','reconciliation','reconciliationItem','dgcImportLink','dgcImportRow','invoice','accountReceivable','invoicePayment','cashEntry','cashAccount','outputReconUpload','document','auditLog'];
class Rollback extends Error{}
try{
 try{await prisma.$transaction(async tx=>{
  await tx.company.create({data:{id:f.companyId,companyCode:'DGC',companyName:'Synthetic source reader'}});
  const plan=masterPlan(f.snapshot),ids={service:f.revenue.serviceId,partner:f.revenue.partnerId,contract:f.revenue.contractId};
  for(const model of ['service','partner','contract']){const source=plan.items.find(i=>i.model===model),data={...source.data,id:ids[model],companyId:f.companyId};if(model==='contract')data.partnerId=ids.partner;for(const [k,v] of Object.entries(data))if(v&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v))data[k]=new Date(v+'T00:00:00Z');await tx[model].create({data});}
  await tx.dgcImportSnapshot.create({data:{companyId:f.companyId,snapshotHash:f.snapshot.snapshotHash,sourceSpreadsheetId:f.snapshot.source.spreadsheetId,sourceMetadata:f.snapshot.source,rowCount:Object.values(f.snapshot.tables).reduce((n,t)=>n+t.rows.length,0)}});
  for(const [sheetName,t] of Object.entries(f.snapshot.tables))for(const row of t.rows)await tx.$executeRaw`INSERT INTO dgc_import_rows(company_id,snapshot_hash,sheet_id,sheet_name,source_row,legacy_id,row_hash,payload) VALUES(${f.companyId}::uuid,${f.snapshot.snapshotHash},${t.sheetId},${sheetName},${row.sourceRow},${row.legacyId},${row.rowHash},${JSON.stringify(row)}::jsonb)`;
  await tx.reconciliation.create({data:f.reconciliation});await tx.reconciliationItem.create({data:f.item});const {reconciliation,reconciliationItem,partner,service,contract,...data}=f.revenue;await tx.revenue.create({data});const {source,...link}=f.link;await tx.dgcImportLink.create({data:link});
  const read=()=>readHistoricalRevenueSource(tx,f.companyId,f.id,f.snapshot.snapshotHash),r=await read();eq(r.operationalUseAllowed,false);eq(r.postingAllowed,false);eq(r.approvalEvidence.sourceApprovedAt.rawValue,46245.657010740746);eq(r.approvalEvidence.localApprovedAt,null);eq(r.approvalEvidence.localApprovalCreated,false);eq(r.capturedAmounts.invoiceUsd,{revenue:'100',wht:'10',payable:'90'});eq(r.localState,{status:'BLOCKED',isCurrent:false});
  const before=await Promise.all(tables.map(m=>tx[m].count()));await read();eq(await Promise.all(tables.map(m=>tx[m].count())),before);
  await tx.revenue.update({where:{id:f.id},data:{netAmount:91}});await reject(read);await tx.revenue.update({where:{id:f.id},data:{netAmount:90}});
  await tx.reconciliationItem.update({where:{id:f.item.id},data:{netRevenue:91}});await reject(read);await tx.reconciliationItem.update({where:{id:f.item.id},data:{netRevenue:90}});
  await tx.reconciliation.update({where:{id:f.reconciliation.id},data:{status:'APPROVED'}});await reject(read);await tx.reconciliation.update({where:{id:f.reconciliation.id},data:{status:'BLOCKED'}});
  await reject(()=>readHistoricalRevenueSource(tx,f.companyId,f.id,'0'.repeat(64)));
  for(const m of ['invoice','accountReceivable','invoicePayment','cashEntry','cashAccount','outputReconUpload','document'])eq(await tx[m].count(),0);
  eq((await read()).migrationProvenance.targetHashVerified,true);throw new Rollback();
 },{isolationLevel:'Serializable',timeout:30000});throw Error('Synthetic evidence transaction unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const m of tables)eq(await prisma[m].count(),0);
 // Verify the actual migration materializer, not only handcrafted ORM fixtures.
 // Savepoints let its rollback/replay and the surrounding synthetic setup all
 // roll back without exporting or adding a committing financial writer.
 try{await prisma.$transaction(async tx=>{
  await tx.company.create({data:{id:f.companyId,companyCode:'DGC',companyName:'Synthetic source reader'}});let inspected=0;
  const db=new Proxy(tx,{get(target,prop){if(prop==='$transaction')return async fn=>{
   await tx.$executeRaw`SAVEPOINT dgc_source_reader_trial`;
   try{const result=await fn(tx);await tx.$executeRaw`RELEASE SAVEPOINT dgc_source_reader_trial`;return result;}catch(error){let checkFailure;try{if(error.message==='DGC rehearsal rollback'){const rows=await tx.revenue.findMany({where:{companyId:f.companyId}});for(const row of rows){const result=await readHistoricalRevenueSource(tx,f.companyId,row.id,f.snapshot.snapshotHash);eq(result.operationalUseAllowed,false);eq(result.approvalEvidence.sourceApprovedAt.rawValue,46245.657010740746);eq(result.migrationProvenance.targetHashVerified,true);inspected++;}}}catch(e){checkFailure=e;}finally{await tx.$executeRaw`ROLLBACK TO SAVEPOINT dgc_source_reader_trial`;await tx.$executeRaw`RELEASE SAVEPOINT dgc_source_reader_trial`;}throw checkFailure??error;}
  };const member=target[prop];return typeof member==='function'?member.bind(target):member;}});
  await stageSnapshot(db,f.snapshot,f.companyId);await applyMasters(db,f.snapshot,f.companyId,'all',masterPlan(f.snapshot).planHash);
  const trial=await rehearseRevenue(db,f.snapshot,f.companyId,f.plan,f.plan.groups.map(g=>g.groupKey),f.plan.planHash);eq(trial.rolledBack,true);eq(trial.replay.created,0);eq(inspected,2);eq(await tx.revenue.count(),0);eq(await tx.reconciliation.count(),0);throw new Rollback();
 },{isolationLevel:'Serializable',timeout:60000});throw Error('Materializer compatibility fixture unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 for(const m of tables)eq(await prisma[m].count(),0);
 console.log(`Historical source PostgreSQL reader: ${n} assertions passed; fixture and tampering trials rolled back`);
}finally{await prisma.$disconnect();}
