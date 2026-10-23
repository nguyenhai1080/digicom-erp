import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fixture} from './fixtures.mjs';
import {normalizeCapture,masterPlan,digest} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {masterTransfer} from './master-transfer.mjs';
requireStaging(process.env.DATABASE_URL??'');
const dbName=new URL(process.env.DATABASE_URL).pathname.slice(1);
if(dbName!=='dgc_migration_staging_master_transfer_synthetic')throw Error('Dedicated synthetic transfer DB only');
const docker=process.env.DGC_TEST_DOCKER,container='dgc-erp-acceptance-postgres';
if(!docker)throw Error('DGC_TEST_DOCKER required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
const run=sql=>{try{return {ok:true,output:execFileSync(docker,['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','dgc_test','-d',dbName],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']})};}catch(e){return {ok:false,output:String(e.stderr)};}};
const ok=sql=>{const r=run(sql);assert.equal(r.ok,true,r.output);};
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 eq(await db.company.count(),0);
 const c=await db.company.create({data:{companyCode:'DGC',companyName:'Synthetic DGC',defaultCurrency:'USD',timezone:'Asia/Ho_Chi_Minh'}});
 const actor=await db.user.create({data:{companyId:c.id,email:'transfer@example.test',fullName:'Synthetic operator',passwordHash:'unused-synthetic'}});
 const role=await db.role.create({data:{companyId:c.id,code:'ADMIN',name:'Synthetic admin'}});await db.userRole.create({data:{userId:actor.id,roleId:role.id}});
 // Exercise quoting and DO-delimiter-like source content against a real DB.
 const source=fixture(),service=source.find(e=>e.data.sheets[0].properties.title==='20_DM_SERVICE');
 service.data.sheets[0].data[0].rowData[2].values[2].effectiveValue.stringValue="O'Brien \\ $dgc_master_transfer$; DROP TABLE services; --";
 const snapshot=normalizeCapture(source),plan=masterPlan(snapshot),options={expectedPlanHash:plan.planHash,expectedDatabase:dbName,operatorEmail:actor.email};
 const preview=masterTransfer(snapshot,undefined,options),apply=masterTransfer(snapshot,undefined,{...options,commit:true,expectedTransferHash:preview.transferHash,reason:'Synthetic operator reviewed digest'});
 eq(preview.counts,{service:1,partner:1,contract:1,contractService:1});
 assert.throws(()=>masterTransfer(snapshot,undefined,{...options,expectedDatabase:'gst'}));checks++;
 assert.throws(()=>masterTransfer(snapshot,undefined,{...options,expectedPlanHash:'stale'}));checks++;
 assert.throws(()=>masterTransfer(snapshot,undefined,{...options,commit:true,expectedTransferHash:'stale',reason:'test'}));checks++;
 const counts=async()=>Promise.all([db.service.count(),db.partner.count(),db.contract.count(),db.contractService.count(),db.dgcImportSnapshot.count(),db.dgcImportRow.count(),db.dgcImportLink.count(),db.auditLog.count(),db.revenue.count(),db.invoice.count(),db.cashEntry.count()]);
 const before=await counts();ok(preview.sql);eq(await counts(),before);
 // Downstream audit failure must roll back masters and provenance together.
 await db.$executeRawUnsafe("CREATE FUNCTION dgc_transfer_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
 await db.$executeRawUnsafe('CREATE TRIGGER dgc_transfer_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_transfer_fail()');
 eq(run(apply.sql).ok,false);eq(await counts(),before);
 await db.$executeRawUnsafe('DROP TRIGGER dgc_transfer_fail ON audit_logs');await db.$executeRawUnsafe('DROP FUNCTION dgc_transfer_fail()');
 eq(run(apply.sql.replace("current_database()='"+dbName+"'","current_database()='wrong_target'")).ok,false);eq(await counts(),before);
 await db.userRole.deleteMany({where:{userId:actor.id}});eq(run(apply.sql).ok,false);eq(await counts(),before);await db.userRole.create({data:{userId:actor.id,roleId:role.id}});
 const existing=await db.service.create({data:{companyId:c.id,serviceCode:'UNLINKED',serviceName:'Existing',category:'OTHER'}});eq(run(apply.sql).ok,false);await db.service.delete({where:{id:existing.id}});eq(await counts(),before);
 ok(apply.sql);eq(await counts(),[1,1,1,1,1,4,4,5,0,0,0]);
 const after=await counts();ok(apply.sql);eq(await counts(),after);
 eq((await db.service.findFirstOrThrow()).serviceName,service.data.sheets[0].data[0].rowData[2].values[2].effectiveValue.stringValue);
 // SQL hashes use the same canonical projection as the existing local mapper.
 for(const item of plan.items){const link=await db.dgcImportLink.findFirstOrThrow({where:{targetModel:item.model}}),target=await db[item.model].findUniqueOrThrow({where:{id:link.targetId}}),data={...item.data};for(const d of item.dependencies)data[d.field]=target[d.field];eq(link.targetHash,digest(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?v.toFixed():v]))));}
 const imported=await db.service.findFirstOrThrow();await db.service.update({where:{id:imported.id},data:{serviceName:'Changed by operator'}});eq(run(apply.sql).ok,false);await db.service.update({where:{id:imported.id},data:{serviceName:imported.serviceName}});
 const raw=await db.dgcImportRow.findFirstOrThrow();await db.dgcImportRow.update({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId:c.id,snapshotHash:raw.snapshotHash,sheetId:raw.sheetId,sourceRow:raw.sourceRow}},data:{payload:{tampered:true}}});eq(run(apply.sql).ok,false);
 await db.dgcImportRow.update({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId:c.id,snapshotHash:raw.snapshotHash,sheetId:raw.sheetId,sourceRow:raw.sourceRow}},data:{payload:raw.payload}});
 const foreign=await db.company.create({data:{companyCode:'GST_SYNTHETIC',companyName:'Foreign synthetic'}});eq(run(apply.sql).ok,false);await db.company.delete({where:{id:foreign.id}});
 ok(apply.sql);eq(await counts(),after);
 console.log(JSON.stringify({passed:checks,realPostgres:true,rollback:true,replay:true,driftGuards:true,financialRows:0}));
}finally{await db.$disconnect();}
