import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {tokenHash,csrfToken} from '../dist/modules/auth/access.js';
import {installCapturedFiles,transferCapturedBook} from '../../../packages/db/prisma/dgc-captured-book.mjs';
import {linkInvoiceDocuments} from '../dist/modules/projects/invoice-cancel.js';
const database=process.env.DGC_RESTART_TEST_DB??'dgc_migration_staging_october_restart_synthetic',url=new URL(process.env.DATABASE_URL);
if(!/^dgc_migration_staging_october_restart(?:_v\d+)?_synthetic$/.test(database))throw Error('Dedicated restart test database required');
if(process.env.NODE_ENV!=='test'||!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/'+database)throw Error('Dedicated localhost restart trial required');
if(await prisma.invoice.count())throw Error('Fresh financial clone required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},sha=b=>createHash('sha256').update(b).digest('hex');
const c=await prisma.company.findFirstOrThrow({where:{companyCode:'DGC'}}),role=await prisma.role.findFirstOrThrow({where:{companyId:c.id,code:'ADMIN'}}),actor=await prisma.user.create({data:{companyId:c.id,email:'october-'+randomUUID()+'@example.invalid',fullName:'Synthetic restart operator',passwordHash:'NO_REAL_PASSWORD'}});
await prisma.userRole.create({data:{userId:actor.id,roleId:role.id}});
const bundle=JSON.parse(await readFile('artifacts/dgc-migration/20261104/captured-book/latest-bundle.json','utf8'));
await mkdir(process.env.STORAGE_ROOT,{recursive:true});
await installCapturedFiles(bundle,bundle.bundleHash,c.id,'artifacts/dgc-migration/20261104/current-documents/blobs',process.env.STORAGE_ROOT);
await prisma.$transaction(tx=>transferCapturedBook(tx,bundle,{expectedBundleHash:bundle.bundleHash,expectedDatabase:database,companyId:c.id,operatorId:actor.id,reason:'Local restart integrity trial',registerDocuments:linkInvoiceDocuments}),{timeout:120000});
const config={secret:'synthetic-october-restart-only-32-characters',appOrigin:'http://localhost:5173',secureCookies:false,bootstrapEnabled:false,bootstrapToken:'',defaultCompanyCode:'DGC'},app=await buildApp({auth:config,logger:false});
async function session(user){const token=randomUUID().replaceAll('-','').repeat(2);await prisma.authSession.create({data:{companyId:user.companyId,userId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});return {origin:config.appOrigin,cookie:'erp_session='+token,'x-csrf-token':csrfToken(token,config.secret)};}
const headers=await session(actor),request=(method,path,payload,h=headers)=>app.inject({method,url:'/api/v1'+path,headers:h,payload});
async function expect(method,path,payload,status=200,h){const r=await request(method,path,payload,h);eq(r.statusCode,status);return r.statusCode>=200&&r.statusCode<300?r.json():r;}
const original=async()=>JSON.stringify({invoices:await prisma.invoice.findMany({orderBy:{id:'asc'}}),revenues:await prisma.revenue.findMany({orderBy:{id:'asc'}}),recons:await prisma.reconciliation.findMany({orderBy:{id:'asc'}}),items:await prisma.reconciliationItem.findMany({orderBy:{id:'asc'}}),scopes:await prisma.invoiceScope.findMany({orderBy:{id:'asc'}}),scopeItems:await prisma.invoiceScopeItem.findMany({orderBy:{id:'asc'}}),documents:await prisma.document.findMany({orderBy:{id:'asc'}})});
try{
 const before=await original(),oct=await prisma.revenue.findMany({where:{companyId:c.id,isCurrent:true,periodStart:new Date('2026-10-01')}}),invoices=await prisma.invoice.findMany({where:{companyId:c.id,isCurrent:true,period:'2026-10'}});
 eq(oct.length,8);eq(invoices.length,8);eq((await expect('GET','/october-restart')).archived,false);
 await expect('POST','/october-restart/preview',{period:'2026-09'},400);
 await expect('POST','/october-restart/preview',{period:'2026-10'},401,{});
 await expect('POST','/october-restart/preview',{period:'2026-10'},403,{...headers,'x-csrf-token':'bad'});
 const reader=await prisma.user.create({data:{companyId:c.id,email:'reader-'+randomUUID()+'@example.invalid',fullName:'Synthetic reader',passwordHash:'NO_PASSWORD'}}),readerRole=await prisma.role.create({data:{companyId:c.id,code:'RESTART_READER',name:'Synthetic reader',permissions:{create:(await prisma.permission.findMany({where:{code:{in:['INVOICE_VIEW','REVENUE_VIEW','RECON_VIEW']}}})).map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:reader.id,roleId:readerRole.id}});const readerHeaders=await session(reader);
 await expect('POST','/october-restart/preview',{period:'2026-10'},403,readerHeaders);
 const adminWritePermissions=await prisma.permission.findMany({where:{code:{in:['SYSTEM_CONFIG_EDIT','INVOICE_CANCEL','RECON_CANCEL']}}});for(const p of adminWritePermissions)await prisma.rolePermission.create({data:{roleId:readerRole.id,permissionId:p.id}});
 await expect('POST','/october-restart/preview',{period:'2026-10'},403,readerHeaders);
 process.env.NODE_ENV='production';try{await expect('POST','/october-restart/preview',{period:'2026-10'},503);}finally{process.env.NODE_ENV='test';}
 const preview=await expect('POST','/october-restart/preview',{period:'2026-10'});eq(preview.counts,{revenues:8,invoices:8,reconciliations:5,documents:18});eq(await original(),before);
 const payload={period:'2026-10',digest:preview.digest,reason:'Owner authorized local source integrity trial',confirmed:true};
 const secondAdmin=await prisma.user.create({data:{companyId:c.id,email:'admin2-'+randomUUID()+'@example.invalid',fullName:'Synthetic second admin',passwordHash:'NO_PASSWORD'}});await prisma.userRole.create({data:{userId:secondAdmin.id,roleId:role.id}});const secondHeaders=await session(secondAdmin);
 await expect('POST','/october-restart/apply',payload,409,secondHeaders);eq(await original(),before);
 const foreign=await prisma.company.create({data:{companyCode:'OCTOBER_TEST_FOREIGN',companyName:'Synthetic foreign tenant'}}),foreignUser=await prisma.user.create({data:{companyId:foreign.id,email:'foreign@example.invalid',fullName:'Synthetic foreign reader',passwordHash:'NO_PASSWORD'}}),foreignRole=await prisma.role.create({data:{companyId:foreign.id,code:'ADMIN',name:'Synthetic foreign admin',permissions:{create:(await prisma.permission.findMany({where:{code:{in:['SYSTEM_CONFIG_EDIT','INVOICE_CANCEL','RECON_CANCEL','INVOICE_VIEW']}}})).map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:foreignUser.id,roleId:foreignRole.id}});const foreignHeaders=await session(foreignUser);
 await expect('POST','/october-restart/preview',{period:'2026-10'},404,foreignHeaders);await expect('GET','/october-restart',undefined,404,foreignHeaders);
 await expect('POST','/october-restart/apply',{...payload,digest:'0'.repeat(64)},409);eq(await original(),before);
 const firstDoc=await prisma.document.findUniqueOrThrow({where:{id:invoices[0].documentId},include:{attachment:true}}),path=resolve(process.env.STORAGE_ROOT,firstDoc.attachment.storagePath);
 await rename(path,path+'.test-held');try{await expect('POST','/october-restart/preview',{period:'2026-10'},409);}finally{await rename(path+'.test-held',path);}eq(await original(),before);
 await prisma.invoice.update({where:{id:invoices[0].id},data:{status:'ISSUED',issuedAt:new Date()}});await expect('POST','/october-restart/preview',{period:'2026-10'},409);await prisma.invoice.update({where:{id:invoices[0].id},data:{status:'DRAFT',issuedAt:null}});
 const source=await prisma.invoice.findUniqueOrThrow({where:{id:invoices[0].id}}),ar=await prisma.accountReceivable.create({data:{companyId:c.id,invoiceId:source.id,originalAmount:source.payableAmount,paidAmount:0,outstandingAmount:source.payableAmount,status:'OPEN'}});await expect('POST','/october-restart/preview',{period:'2026-10'},409);await prisma.accountReceivable.delete({where:{id:ar.id}});
 const restoredPreview=await expect('POST','/october-restart/preview',{period:'2026-10'}),restoredBefore=await original();
 await prisma.$executeRawUnsafe(`CREATE FUNCTION restart_trial_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_RESTART_FAILURE'; END $$`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER restart_trial_fail BEFORE UPDATE ON revenues FOR EACH ROW EXECUTE FUNCTION restart_trial_fail()`);
 try{await expect('POST','/october-restart/apply',{...payload,digest:restoredPreview.digest},500);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER restart_trial_fail ON revenues');await prisma.$executeRawUnsafe('DROP FUNCTION restart_trial_fail()');}
 eq(await original(),restoredBefore);eq(await prisma.configuration.count({where:{configKey:'DGC_PERIOD_RESTART:2026-10'}}),0);eq(await prisma.auditLog.count({where:{action:'DGC_OCTOBER_RESTART'}}),0);
 const otherPeriodBefore=JSON.stringify({invoices:await prisma.invoice.findMany({where:{period:{not:'2026-10'}},orderBy:{id:'asc'}}),revenues:await prisma.revenue.findMany({where:{periodStart:{not:new Date('2026-10-01')}},orderBy:{id:'asc'}}),ar:await prisma.accountReceivable.findMany({orderBy:{id:'asc'}}),payments:await prisma.invoicePayment.findMany({orderBy:{id:'asc'}}),inputs:await prisma.inputReconciliation.findMany({orderBy:{id:'asc'}})});
 const filesBefore=new Map();for(const d of await prisma.document.findMany({include:{attachment:true}})){filesBefore.set(d.id,sha(await readFile(resolve(process.env.STORAGE_ROOT,d.attachment.storagePath))));}
 const applied=await expect('POST','/october-restart/apply',{...payload,digest:restoredPreview.digest});eq(applied.replayed,false);
 eq(await prisma.invoice.count({where:{companyId:c.id,period:'2026-10',isCurrent:true}}),0);eq(await prisma.revenue.count({where:{companyId:c.id,periodStart:new Date('2026-10-01'),isCurrent:true}}),0);eq(await prisma.reconciliation.count({where:{companyId:c.id,periodStart:new Date('2026-10-01'),isCurrent:true}}),0);
 eq(await prisma.invoice.count(),66);eq(await prisma.revenue.count(),417);eq(await prisma.document.count(),451);
 const history=await expect('GET','/october-restart',undefined,200,readerHeaders);eq(history.archived,true);eq(history.invoices.length,8);eq(history.revenues.length,8);eq(history.documents.length,18);
 for(const d of history.documents){const r=await request('GET',d.url.replace('/api/v1',''));eq(r.statusCode,200);eq(sha(r.rawPayload),filesBefore.get(d.id));}
 const stored=await prisma.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId:c.id,configKey:'DGC_PERIOD_RESTART:2026-10'}}}),archive=JSON.parse(stored.configValue);eq(archive.graph.invoices.every(i=>i.status==='DRAFT'),true);eq(archive.graph.revenues.every(r=>r.isCurrent),true);
 const afterOther=JSON.stringify({invoices:await prisma.invoice.findMany({where:{period:{not:'2026-10'}},orderBy:{id:'asc'}}),revenues:await prisma.revenue.findMany({where:{periodStart:{not:new Date('2026-10-01')}},orderBy:{id:'asc'}}),ar:await prisma.accountReceivable.findMany({orderBy:{id:'asc'}}),payments:await prisma.invoicePayment.findMany({orderBy:{id:'asc'}}),inputs:await prisma.inputReconciliation.findMany({orderBy:{id:'asc'}})});eq(afterOther,otherPeriodBefore);
 for(const d of await prisma.document.findMany({include:{attachment:true}}))eq(sha(await readFile(resolve(process.env.STORAGE_ROOT,d.attachment.storagePath))),filesBefore.get(d.id));
 const root=oct.find(r=>(r.calculationJson)?.rowType==='TOTAL'),query=new URLSearchParams({partnerId:root.partnerId,serviceId:root.serviceId,period:'2026-10'}),intake=await expect('GET','/output-recon/preflight?'+query);eq(intake.action,'ALLOW_INTAKE');eq(intake.invoiceScopes.length,0);eq(intake.reconciliations.length,0);
 const rootRecon=archive.graph.reconciliations.find(r=>r.id===root.reconciliationId),sourcePdf=archive.graph.documents.find(d=>d.documentType==='DGC_SOURCE_RECON'&&d.documentNumber===rootRecon.ocrRawJson.documentSource.legacyId),bytes=await readFile(resolve(process.env.STORAGE_ROOT,sourcePdf.attachment.storagePath));
 const uploaded=await expect('POST','/output-recon/uploads',{partnerId:root.partnerId,serviceId:root.serviceId,period:'2026-10',filename:'october-reentry-test.pdf',base64:bytes.toString('base64'),fingerprint:intake.fingerprint},201);eq(uploaded.item.status,'UPLOADED');
 // New work survives replay and the operation cannot be previewed a second time.
 const newInvoice=await prisma.invoice.create({data:{...source,id:randomUUID(),invoiceNumber:'SYNTHETIC-NEW-OCTOBER',businessKey:'SYNTHETIC-NEW-OCTOBER',isCurrent:true,status:'DRAFT'}});
 const replay=await expect('POST','/october-restart/apply',{...payload,digest:restoredPreview.digest});eq(replay.replayed,true);eq((await prisma.invoice.findUniqueOrThrow({where:{id:newInvoice.id}})).isCurrent,true);eq((await prisma.outputReconUpload.findUniqueOrThrow({where:{id:uploaded.item.id}})).status,'UPLOADED');await expect('POST','/october-restart/preview',{period:'2026-10'},409);
 eq(await prisma.cashEntry.count(),0);eq(await prisma.cashAccount.count(),0);eq(await prisma.auditLog.count({where:{action:'DGC_OCTOBER_RESTART'}}),1);
 const proof={checks,counts:preview.counts,historyReadable:true,originalFilesUnchanged:451,otherPeriodsUnchanged:true,rollbackVerified:true,replayPreservesNewWork:true,intakeAllowed:true,sourceReupload:true,realHostChanged:false};
 await writeFile('artifacts/dgc-migration/20261105/workflows/october-restart-trial.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await app.close();await prisma.$disconnect();}
