import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {requireStaging} from './staging.mjs';
import {compileMasterTransfer} from './master-transfer.mjs';
requireStaging(process.env.DATABASE_URL??'');
const database=new URL(process.env.DATABASE_URL).pathname.slice(1);if(database!=='dgc_migration_staging_host_restore_synthetic')throw Error('Dedicated local host-backup restore DB required');
const root='artifacts/dgc-deploy/20261023/',file=await readFile(root+'dgc-post-master-host.dump'),{bundle,transferHash}=JSON.parse(await readFile(root+'dgc-masters-runtime-preview.sql.bundle.json','utf8'));
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
class Rollback extends Error{}
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 eq(file.subarray(0,5).toString(),'PGDMP');eq(await db.company.count(),1);
 const c=await db.company.findUniqueOrThrow({where:{companyCode:'DGC'}});eq(c.defaultCurrency,'USD');eq(c.timezone,'Asia/Ho_Chi_Minh');
 const models=['service','partner','contract','contractService','dgcImportSnapshot','dgcImportRow','dgcImportLink','revenue','invoice','accountReceivable','accountPayable','invoicePayment','cashAccount','cashEntry'];
 const counts=()=>Promise.all(models.map(m=>db[m].count())),before=await counts();eq(before,[10,4,9,14,1,37,37,0,0,0,0,0,0,0]);
 eq(await db.auditLog.count({where:{action:{in:['DGC_MASTER_TRANSFER','DGC_MASTER_TRANSFER_ITEM']},traceId:transferHash}}),38);
 eq((await db.partner.findFirstOrThrow({where:{partnerKey:'Movitel'}})).status,'ACTIVE');
 const tax=await db.contract.findMany({where:{contractCode:{in:['CTR0003','CTR0004','CTR0005','CTR0006','CTR0007','CTR0008']}}});eq(tax.length,6);for(const r of tax)eq(r.taxRate.toFixed(),'0.1');
 for(const [contractCode,serviceKey] of [['CTR0007','MEUCLIP'],['CTR0008','MEUPAR']])eq(await db.contractService.count({where:{contract:{contractCode},service:{serviceKey}}}),1);
 const users=await db.user.findMany({where:{companyId:c.id,status:'ACTIVE',roles:{some:{role:{companyId:c.id,code:'ADMIN',status:'ACTIVE'}}}},select:{email:true}});eq(users.length,1);
 const plan=compileMasterTransfer(bundle,{expectedDatabase:database,operatorEmail:users[0].email,expectedTransferHash:transferHash});
 try{await db.$transaction(async tx=>{for(const sql of plan.statements)await tx.$executeRawUnsafe(sql);throw new Rollback();},{isolationLevel:'Serializable',timeout:120000});throw Error('Restore verification unexpectedly committed');}catch(e){if(!(e instanceof Rollback))throw e;}
 eq(await counts(),before);
 const report={format:'dgc-host-master-backup-restore-v1',backupSha256:createHash('sha256').update(file).digest('hex'),backupBytes:file.length,restoredLocally:true,remoteChanged:false,assertions:checks,transferHash,counts:Object.fromEntries(models.map((m,i)=>[m,before[i]])),masterAudits:38,previewReplayVerified:true,verificationRolledBack:true,financialRows:0};
 await writeFile(root+'dgc-host-backup-restore-proof.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.$disconnect();}
