import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {masterPlan,digest,canonical} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {masterTransfer} from './master-transfer.mjs';
requireStaging(process.env.DATABASE_URL??'');
const dbName=new URL(process.env.DATABASE_URL).pathname.slice(1);
if(dbName!=='dgc_migration_staging_master_transfer_real_synthetic')throw Error('Dedicated disposable real-source transfer DB only');
const docker=process.env.DGC_TEST_DOCKER;if(!docker)throw Error('DGC_TEST_DOCKER required');
const snapshot=JSON.parse(await readFile('artifacts/dgc-migration/20261019/prepared/snapshot.json','utf8')),decisions=JSON.parse(await readFile('artifacts/dgc-migration/20261019/owner-decisions.json','utf8'));
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
const run=sql=>execFileSync(docker,['exec','-i','dgc-erp-acceptance-postgres','psql','-X','-v','ON_ERROR_STOP=1','-U','dgc_test','-d',dbName],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 eq(await db.company.count(),0);
 const c=await db.company.create({data:{companyCode:'DGC',companyName:'Local transfer rehearsal',defaultCurrency:'USD',timezone:'Asia/Ho_Chi_Minh'}});
 const actor=await db.user.create({data:{companyId:c.id,email:'transfer-real@example.test',fullName:'Synthetic operator',passwordHash:'unused-synthetic'}}),role=await db.role.create({data:{companyId:c.id,code:'ADMIN',name:'Synthetic admin'}});await db.userRole.create({data:{userId:actor.id,roleId:role.id}});
 const plan=masterPlan(snapshot,decisions),options={expectedPlanHash:plan.planHash,expectedDatabase:dbName,operatorEmail:actor.email};
 const preview=masterTransfer(snapshot,decisions,options),apply=masterTransfer(snapshot,decisions,{...options,commit:true,expectedTransferHash:preview.transferHash,reason:'Local-only master transfer acceptance'});
 eq(preview.counts,{service:10,partner:4,contract:9,contractService:14});
 const counts=async()=>Promise.all([db.service.count(),db.partner.count(),db.contract.count(),db.contractService.count(),db.dgcImportSnapshot.count(),db.dgcImportRow.count(),db.dgcImportLink.count(),db.auditLog.count(),db.revenue.count(),db.invoice.count(),db.cashAccount.count(),db.cashEntry.count()]);
 const before=await counts();run(preview.sql);eq(await counts(),before);
 run(apply.sql);eq(await counts(),[10,4,9,14,1,37,37,38,0,0,0,0]);const after=await counts();run(apply.sql);eq(await counts(),after);
 const dateFields=new Set(['startDate','endDate','signingDate','effectiveDate','expiryDate','effectiveFrom','effectiveTo']);
 for(const item of plan.items){
  const link=await db.dgcImportLink.findFirstOrThrow({where:{companyId:c.id,targetModel:item.model,legacyId:item.legacyId}}),target=await db[item.model].findUniqueOrThrow({where:{id:link.targetId}}),expected={...item.data};
  for(const d of item.dependencies){const dep=await db.dgcImportLink.findFirstOrThrow({where:{companyId:c.id,legacyId:d.legacyId,sheetId:snapshot.tables[d.sheet].sheetId}});expected[d.field]=dep.targetId;}
  const actual=Object.fromEntries(Object.keys(expected).map(k=>[k,dateFields.has(k)&&target[k]?target[k].toISOString().slice(0,10):typeof target[k]==='object'&&target[k]?.toFixed?target[k].toFixed():target[k]]));
  eq(canonical(actual),canonical(expected));eq(link.targetHash,digest(Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,typeof v==='number'?v.toFixed():v]))));eq(link.rowHash,item.rowHash);
 }
 eq((await db.dgcImportSnapshot.findFirstOrThrow()).snapshotHash,preview.transferHash);eq(await db.dgcImportSnapshot.count({where:{snapshotHash:snapshot.snapshotHash}}),0);
 const audits=await db.auditLog.findMany({where:{action:'DGC_MASTER_TRANSFER_ITEM'}});eq(audits.flatMap(a=>a.newValue.decisions).length,decisions.decisions.length);
 const report={format:'dgc-master-transfer-local-acceptance-v1',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,transferHash:preview.transferHash,counts:preview.counts,assertions:checks,previewRolledBack:true,replayUnchanged:true,sourceRows:37,financialRows:0,remoteExecuted:false};
 await mkdir('artifacts/dgc-deploy/20261023',{recursive:true});await writeFile('artifacts/dgc-deploy/20261023/master-transfer-local-acceptance.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.$disconnect();}
