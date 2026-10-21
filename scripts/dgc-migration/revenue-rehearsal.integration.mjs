import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {revenueCaptures,revenueSnapshot,changeRevenueCapture} from './revenue-fixtures.mjs';
import {masterPlan,normalizeCapture} from './core.mjs';
import {requireStaging,stageSnapshot,applyMasters} from './staging.mjs';
import {revenueTargetPlan} from './revenue-target.mjs';
import {rehearseRevenue} from './revenue-rehearsal.mjs';
requireStaging(process.env.DATABASE_URL??'');if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_synthetic'))throw Error('Use a disposable *_synthetic database only');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();let n=0;
const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(f,re)=>{await assert.rejects(f,re);n++;};
try{
 const existing=await db.company.count();if(existing>1)throw Error('Synthetic fixture database has other tenants');
 const c=existing?await db.company.findUniqueOrThrow({where:{companyCode:'DGC'}}):await db.company.create({data:{companyCode:'DGC',companyName:'Synthetic DGC revenue rehearsal'}});
 eq(c.companyName,'Synthetic DGC revenue rehearsal');const s=revenueSnapshot(),p=revenueTargetPlan(s),keys=p.groups.map(g=>g.groupKey);
 for(const m of ['reconciliation','revenue','invoice','inputReconciliation','cashAccount'])eq(await db[m].count(),0);
 await stageSnapshot(db,s,c.id);await applyMasters(db,s,c.id,'all',masterPlan(s).planHash);
 const baseline={links:await db.dgcImportLink.count(),audits:await db.auditLog.count()};
 const trial=()=>rehearseRevenue(db,s,c.id,p,keys,p.planHash);
 const zero=async()=>{for(const m of ['revenue','reconciliation','reconciliationItem','invoice','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashEntry','cashAccount','attachment','document'])eq(await db[m].count(),0);eq(await db.dgcImportLink.count(),baseline.links);eq(await db.auditLog.count(),baseline.audits);};
 const r=await trial();eq(r.rolledBack,true);eq(r.postingAllowed,false);eq(r.acceptance,false);eq(r.filesVerified,false);eq(r.sourceCaptureVerified,true);eq(r.first,{groupsCreated:1,created:2,unchanged:0});eq(r.replay,{groupsCreated:0,created:0,unchanged:2});eq(r.before,r.after);
 eq(r.inside.revenue,2);eq(r.inside.reconciliation,1);eq(r.inside.reconciliationItem,2);eq(r.financialProof.headers[0],{status:'BLOCKED',isCurrent:false,approvedById:null,approvedAt:null,gross:'90',company:'90',net:'90'});
 for(const row of r.financialProof.revenues){eq(row.sourceStatus,'Approved');eq(row.status,'BLOCKED');eq(row.isCurrent,false);eq(row.management,{gross:'90',company:'90',net:'90'});eq(row.invoiceUsd,{revenue:'100',wht:'10',payable:'90'});}
 eq(r.financialProof.revenues.filter(r=>r.includeInMonthlyTotal).length,1);await zero();
 const again=await trial();eq(again.first.created,2);eq(again.replay.unchanged,2);await zero();
 await reject(rehearseRevenue(db,s,c.id,p,keys,'0'.repeat(64)),/Stale/);await reject(rehearseRevenue(db,s,c.id,p,[keys[0],keys[0]],p.planHash),/unique/);await reject(rehearseRevenue(db,s,c.id,p,['missing'],p.planHash),/held or missing/);
 const bad=normalizeCapture(changeRevenueCapture(revenueCaptures(),'40_MONTHLY_REVENUE',2,'Invoice_Payable_USD','90.01')),held=revenueTargetPlan(bad);
 await reject(rehearseRevenue(db,bad,c.id,held,held.groups.map(g=>g.groupKey),held.planHash),/held or missing/);
 const master=await db.service.findFirstOrThrow();await db.service.update({where:{id:master.id},data:{serviceName:'Synthetic drift'}});try{await reject(trial(),/master target or mapping changed/);}finally{await db.service.update({where:{id:master.id},data:{serviceName:master.serviceName}});}await zero();
 const raw=await db.dgcImportRow.findFirstOrThrow({where:{companyId:c.id,snapshotHash:s.snapshotHash,sheetName:'40_MONTHLY_REVENUE'}});await db.dgcImportRow.update({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId:c.id,snapshotHash:s.snapshotHash,sheetId:raw.sheetId,sourceRow:raw.sourceRow}},data:{payload:{}}});
 try{await reject(trial(),/snapshot integrity/);}finally{await db.dgcImportRow.update({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId:c.id,snapshotHash:s.snapshotHash,sheetId:raw.sheetId,sourceRow:raw.sourceRow}},data:{payload:raw.payload}});}await zero();
 const partner=await db.partner.findFirstOrThrow(),contract=await db.contract.findFirstOrThrow(),collision=await db.reconciliation.create({data:{companyId:c.id,reconCode:'DGC-TRIAL-'+keys[0].slice(0,24),logicalGroupId:randomUUID(),partnerId:partner.id,contractId:contract.id,periodStart:new Date('2026-01-01'),periodEnd:new Date('2026-01-31'),currency:'USD',sourceType:'SYSTEM_IMPORT',status:'BLOCKED'}});
 try{await reject(trial(),/no complete rehearsal provenance/);}finally{await db.reconciliation.delete({where:{id:collision.id}});}await zero();
 async function trigger(sql,expected){await db.$executeRawUnsafe(sql);await db.$executeRawUnsafe('CREATE TRIGGER dgc_trial_test AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_trial_test_fn()');try{await reject(trial(),expected);await zero();}finally{await db.$executeRawUnsafe('DROP TRIGGER dgc_trial_test ON audit_logs');await db.$executeRawUnsafe('DROP FUNCTION dgc_trial_test_fn()');}}
 await trigger("CREATE FUNCTION dgc_trial_test_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DGC_REHEARSE_REVENUE' THEN RAISE EXCEPTION 'synthetic downstream failure'; END IF; RETURN NEW; END $$",/synthetic downstream failure/);
 await trigger("CREATE FUNCTION dgc_trial_test_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DGC_REHEARSE_REVENUE' THEN UPDATE revenues SET company_share_amount=company_share_amount+1 WHERE company_id=NEW.company_id; END IF; RETURN NEW; END $$",/target drift/);
 await trigger("CREATE FUNCTION dgc_trial_test_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DGC_REHEARSE_REVENUE' THEN UPDATE services SET service_name='Synthetic transaction drift' WHERE company_id=NEW.company_id; END IF; RETURN NEW; END $$",/master target or mapping changed/);
 await trigger("CREATE FUNCTION dgc_trial_test_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DGC_REHEARSE_REVENUE' THEN UPDATE dgc_import_rows SET payload='{}'::jsonb WHERE company_id=NEW.company_id AND sheet_name='40_MONTHLY_REVENUE'; END IF; RETURN NEW; END $$",/snapshot integrity/);
 const foreign=await db.company.create({data:{companyCode:'OTHER_SYNTHETIC',companyName:'Synthetic other tenant'}});try{await reject(trial(),/exactly one DGC tenant/);}finally{await db.company.delete({where:{id:foreign.id}});}await zero();
 const originalUrl=process.env.DATABASE_URL;process.env.DATABASE_URL=originalUrl.replace(new URL(originalUrl).pathname,'/dgc_migration_staging_other_synthetic');try{await reject(trial(),/Client database does not match/);}finally{process.env.DATABASE_URL=originalUrl;}
 eq((await trial()).rolledBack,true);await zero();
 // A new snapshot can reuse unchanged master provenance. Fractional source
 // dates must survive Prisma/JSONB without changing the source row hashes.
 const timed=revenueCaptures();
 for(const name of ['40_MONTHLY_REVENUE','41_RECONCILIATION','43_RECON_PDF_HEADER']){const e=timed.find(e=>e.data.sheets[0].properties.title===name),t=e.data.sheets[0],h=t.data[0].rowData[0].values;h.push({effectiveValue:{stringValue:'Created_At'},formattedValue:'Created_At'});for(const row of t.data[0].rowData.slice(1))row.values.push({effectiveValue:{numberValue:46100.12345678901},formattedValue:'17/03/2026 02:57'});t.properties.gridProperties.columnCount=h.length;e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+h.length)}${t.properties.gridProperties.rowCount}`;}
 const ts=normalizeCapture(timed),tp=revenueTargetPlan(ts);await stageSnapshot(db,ts,c.id);eq((await applyMasters(db,ts,c.id,'all',masterPlan(ts).planHash)).created,0);baseline.audits=await db.auditLog.count();
 const tr=await rehearseRevenue(db,ts,c.id,tp,tp.groups.map(g=>g.groupKey),tp.planHash);eq(tr.sourceCaptureVerified,true);eq(tr.replay.unchanged,2);eq(tr.before,tr.after);await zero();
 console.log(`PASS: ${n} PostgreSQL revenue rehearsal assertions: complete TOTAL/CHILD group, separate amounts, blocked/noncurrent targets, deterministic replay, forced rollback, source/master/target drift, downstream failure, collision, URL and tenant isolation; all trial finance/audit/provenance rolled back.`);
}finally{await db.$disconnect();}
