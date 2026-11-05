import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {sha} from '../dist/modules/projects/financial-documents.js';
import {renderSoa,defaultSoaPlacements} from '../dist/modules/projects/soa-pdf.js';
import {seedSoaCutoff} from './soa-cutoff.fixtures.mjs';
import {assertInvoiceUnused} from '../dist/modules/projects/invoice-cancel.js';
import {dgcRolePresets} from '../dist/modules/auth/dgc-role-presets.js';
assert.ok(new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_soa_'));
assert.equal(await prisma.user.count(),0,'Fresh synthetic DB required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const storage=await mkdtemp(resolve(tmpdir(),'dgc-soa-synthetic-'));process.env.STORAGE_ROOT=storage;
const config={secret:randomBytes(32).toString('hex'),appOrigin:'https://soa.example.test',secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
const companies=await Promise.all(['DGC','GST'].map(companyCode=>prisma.company.create({data:{companyCode,companyName:'Synthetic SOA '+companyCode}})));
const codes=['AR_VIEW','INVOICE_VIEW','INVOICE_PAYMENT_VIEW','INVOICE_CREATE'],ps=await Promise.all(codes.map(code=>prisma.permission.create({data:{code,name:code,module:'FIXTURE'}})));
async function actor(company,name,permissions=codes){
 const user=await prisma.user.create({data:{companyId:company.id,email:name+'@example.test',fullName:name,passwordHash:'unused'}}),role=await prisma.role.create({data:{companyId:company.id,code:name,name,permissions:{create:ps.filter(p=>permissions.includes(p.code)).map(p=>({permissionId:p.id}))}}});
 await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return {user,raw};
}
const manager=await actor(companies[0],'MANAGER'),reader=await actor(companies[0],'READER',codes.slice(0,3)),otherManager=await actor(companies[0],'OTHER_MANAGER'),gst=await actor(companies[1],'GST'),missingAr=await actor(companies[0],'MISSING_AR',codes.filter(c=>c!=='AR_VIEW'));
const own=await seedSoaCutoff(prisma,companies[0].id,manager.user.id),foreign=await seedSoaCutoff(prisma,companies[1].id,gst.user.id);
await prisma.invoice.update({where:{id:own.crossing.id},data:{snapshot:{lines:[{description:'Synthetic service for January 2026'}]}}});
const profile={issuerName:'Synthetic DGC Company',address:'Synthetic head office',phone:'+00 000',fax:'',email:'issuer@example.test',website:'example.test',taxCode:'FIXTURE',bank:{beneficiary:'Synthetic beneficiary',account:'TEST_ONLY_ACCOUNT',bankName:'Synthetic bank',bankAddress:'Synthetic bank address',swift:'TESTONLY'},signatureName:'Fixture signer',signatureTitle:'Fixture only'};
await prisma.configuration.create({data:{companyId:companies[0].id,configKey:'DGC_INVOICE_PROFILE_V1',configValue:JSON.stringify({version:1,profile}),isSecret:false}});
const pictures={},assetIds={};let n=0;
for(const [name,kind] of Object.entries({logo:'COMPANY_LOGO',stamp:'COMPANY_STAMP',signature:'SIGNATURE',title:'SIGNER_TITLE_NAME'})){
 const bytes=await sharp({create:{width:200,height:name==='stamp'?200:70,channels:4,background:['#eeeeee','#dd0000','#0000dd','#008800'][n++]}}).png().toBuffer(),id=randomUUID(),path='company-assets/'+companies[0].id+'/'+id+'.png';
 await mkdir(resolve(storage,'company-assets',companies[0].id),{recursive:true});await writeFile(resolve(storage,path),bytes);
 await prisma.attachment.create({data:{id,companyId:companies[0].id,originalFilename:name+'.png',storedFilename:id+'.png',storageProvider:'local',storagePath:path,mimeType:'image/png',fileSize:BigInt(bytes.length),checksumSha256:sha(bytes)}});
 const d=await prisma.document.create({data:{companyId:companies[0].id,documentCode:'FIXTURE-'+name,documentType:kind,entityType:'CompanyAsset',entityId:companies[0].id,attachmentId:id}});
 pictures[name]={bytes,mime:'image/png'};assetIds[name]={document:d,path,bytes};
}
const app=await buildApp({logger:false,auth:config}),base='/api/v1/soa';
const req=(who,method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin:config.appOrigin,...(who?{cookie:'erp_session='+who.raw,'x-csrf-token':csrfToken(who.raw,config.secret)}:{}),...extra}});
async function call(who,method,url,payload,status=200,extra={}){const r=await req(who,method,url,payload,extra);assert.equal(r.statusCode,status,url+': '+r.body);checks++;return r;}
const selection={partnerId:own.partner.id,asOf:'2026-01-31',currency:'USD',includePaid:true,placement:defaultSoaPlacements};
const preview=async(s=selection,who=manager)=>(await call(who,'POST',base+'/preview',s)).json();
const payload=(p,s=selection,requestId=randomUUID())=>({...s,digest:p.digest,confirmed:true,requestId});
const counts=async()=>Promise.all([prisma.invoice.count(),prisma.accountReceivable.count(),prisma.invoicePayment.count(),prisma.cashEntry.count()]);
const ledger=async()=>JSON.stringify(await Promise.all([prisma.invoice.findMany({orderBy:{id:'asc'},select:{id:true,status:true,isCurrent:true,payableAmount:true,paidAmount:true,invoiceDate:true,dueDate:true}}),prisma.accountReceivable.findMany({orderBy:{id:'asc'},select:{id:true,originalAmount:true,paidAmount:true,outstandingAmount:true,status:true}}),prisma.invoicePayment.findMany({orderBy:{id:'asc'},select:{id:true,paymentDate:true,allocationAmount:true,allocationCurrency:true,paidUsd:true,paidVnd:true,fxRate:true}})]));
const files=async()=>{try{return (await readdir(resolve(storage,'soa',companies[0].id))).sort();}catch(e){if(e.code==='ENOENT')return [];throw e;}};
try{
 const originalLedger=await ledger();
 for(const [role,allowed] of [['DGC_STAFF',false],['DGC_ACCOUNTANT',false],['DGC_MANAGER',true],['DGC_BOD',true]])eq(dgcRolePresets().find(p=>p.code===role).permissionCodes.includes('INVOICE_CREATE'),allowed);
 await call(null,'GET',base,undefined,401);
 for(const who of [reader,missingAr])for(const action of ['preview','pdf-preview','create'])await call(who,'POST',base+'/'+action,selection,403);
 await call(gst,'GET',base,undefined,404);await call(gst,'POST',base+'/preview',selection,404);
 await call(manager,'POST',base+'/preview',selection,403,{'x-csrf-token':'bad'});
 await call(manager,'POST',base+'/preview',selection,403,{origin:'https://other.example.test'});
 for(const bad of [{...selection,companyId:companies[1].id},{...selection,asOf:'2026-02-30'},{...selection,currency:'MZN'}])await call(manager,'POST',base+'/preview',bad,400);
 await call(manager,'POST',base+'/preview',{...selection,partnerId:foreign.partner.id},404);
 const before=await counts(),p=await preview();eq(p.cutoffPolicy,'THROUGH_AS_OF_INCLUSIVE');eq(p.data.lines.length,11);eq(p.data.totals,{amount:'1100.00',paidAtCutoff:'120.00',outstandingAtCutoff:'980.00'});eq(p.data.lines[0].description,'Synthetic service for January 2026');eq(p.data.lines[0].outstandingAtCutoff,'80.00');eq(p.data.number,'SOA-0001');
 const unpaid=await preview({...selection,includePaid:false});eq(unpaid.data.lines.length,10);eq(unpaid.data.totals.outstandingAtCutoff,'980.00');eq(unpaid.data.lines.some(l=>l.invoiceNumber==='SOA-02'),false);
 const vnd=await preview({...selection,currency:'VND'});eq(vnd.data.lines.length,1);eq(vnd.data.totals.outstandingAtCutoff,'1000000.00');
 const noData={...selection,asOf:'2025-01-01'};await call(manager,'POST',base+'/preview',noData,409);
 const {requestId:__,...pdfPayload}=payload(p),pdf=await call(manager,'POST',base+'/pdf-preview',pdfPayload);
 eq(pdf.headers['content-type'],'application/pdf');const doc=await PDFDocument.load(pdf.rawPayload);assert.ok(doc.getPageCount()>=2);checks++;
 const pictureCounts=doc.getPages().map(page=>{const resources=page.node.Resources(),objects=resources.lookup(PDFName.of('XObject'),PDFDict);return objects.keys().length;});eq(pictureCounts.at(-1),3);eq(pictureCounts[0],1);
 eq(await prisma.statementOfAccount.count(),0);eq(await files(),[]);eq(await counts(),before);
 await call(otherManager,'POST',base+'/create',payload(p),409);
 await call(manager,'POST',base+'/create',{...payload(p),digest:'0'.repeat(64)},409);
 await call(manager,'POST',base+'/create',payload(p,{...selection,includePaid:false}),409);
 await writeFile(resolve(storage,assetIds.title.path),Buffer.alloc(assetIds.title.bytes.length));await call(manager,'POST',base+'/create',payload(p),409);await writeFile(resolve(storage,assetIds.title.path),assetIds.title.bytes);
 const setting=await prisma.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId:companies[0].id,configKey:'DGC_INVOICE_PROFILE_V1'}}});await prisma.configuration.update({where:{id:setting.id},data:{configValue:JSON.stringify({version:2,profile})}});await call(manager,'POST',base+'/create',payload(p),409);await prisma.configuration.update({where:{id:setting.id},data:{configValue:setting.configValue}});
 const badPlacement={...selection,placement:{...selection.placement,stamp:{x:.96,y:.1,width:.5}}},badPlan=await preview(badPlacement);await call(manager,'POST',base+'/pdf-preview',Object.fromEntries(Object.entries(payload(badPlan,badPlacement)).filter(([k])=>k!=='requestId')),400);
 const fresh=await preview(),confirmed=payload(fresh);
 await prisma.$executeRawUnsafe("CREATE FUNCTION soa_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SOA_CREATE' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER soa_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION soa_failure()');
 await call(manager,'POST',base+'/create',confirmed,500);eq(await files(),[]);eq(await prisma.statementOfAccount.count(),0);eq(await prisma.invoiceDocumentLink.count(),0);eq(await prisma.sequence.count({where:{sequenceName:'STATEMENT_OF_ACCOUNT'}}),0);
 await prisma.$executeRawUnsafe('DROP TRIGGER soa_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION soa_failure()');
 const created=(await call(manager,'POST',base+'/create',confirmed,201)).json();eq(created.replayed,false);eq(created.item.status,'DRAFT');eq(created.item.statementNumber,'SOA-0001');eq(await prisma.invoiceDocumentLink.count({where:{documentId:created.item.documentId}}),11);eq((await files()).length,1);eq(await counts(),before);
 const saved=await prisma.statementOfAccount.findUniqueOrThrow({where:{id:created.item.id}});eq(saved.snapshot.data,fresh.data);eq(saved.snapshot.cutoffPolicy,p.cutoffPolicy);
 const replay=(await call(manager,'POST',base+'/create',confirmed)).json();eq(replay.replayed,true);eq(replay.item.id,created.item.id);eq(await prisma.statementOfAccount.count(),1);eq((await files()).length,1);
 await call(manager,'POST',base+'/create',{...confirmed,includePaid:false},409);
 const file=await call(reader,'GET',base+'/'+created.item.id+'/download');assert.ok((await PDFDocument.load(file.rawPayload)).getPageCount()>=2);checks++;
 await assert.rejects(()=>prisma.statementOfAccount.create({data:{companyId:companies[0].id,partnerId:foreign.partner.id,documentId:assetIds.stamp.document.id,statementNumber:'INVALID-PARTNER',asOf:new Date('2026-01-31'),currency:'USD',snapshot:{},requestId:randomUUID(),requestDigest:'x'}}),{code:'P2003'});checks++;
 await assert.rejects(()=>prisma.statementOfAccount.create({data:{companyId:companies[1].id,partnerId:foreign.partner.id,documentId:assetIds.stamp.document.id,statementNumber:'INVALID-DOCUMENT',asOf:new Date('2026-01-31'),currency:'USD',snapshot:{},requestId:randomUUID(),requestDigest:'x'}}),{code:'P2003'});checks++;
 await call(reader,'POST',base+'/'+created.item.id+'/cancel',{expectedUpdatedAt:created.item.updatedAt,reason:'Fixture only',confirmed:true},403);
 await call(manager,'POST',base+'/'+randomUUID()+'/cancel',{expectedUpdatedAt:created.item.updatedAt,reason:'Fixture only',confirmed:true},404);
 await call(manager,'POST',base+'/'+created.item.id+'/cancel',{expectedUpdatedAt:'2025-01-01T00:00:00.000Z',reason:'Fixture only',confirmed:true},409);
 const oldSnapshot=JSON.stringify(saved.snapshot),oldHash=sha(file.rawPayload);
 const unusedId=own.invoices.find(i=>i.invoiceNumber==='SOA-03').id;
 await assert.rejects(()=>prisma.$transaction(tx=>assertInvoiceUnused(tx,companies[0].id,unusedId)),/SOA/);checks++;
 await prisma.$executeRawUnsafe("CREATE FUNCTION soa_cancel_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SOA_CANCEL' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER soa_cancel_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION soa_cancel_failure()');
 await call(manager,'POST',base+'/'+created.item.id+'/cancel',{expectedUpdatedAt:created.item.updatedAt,reason:'Injected failure',confirmed:true},500);eq(await prisma.invoiceDocumentLink.count({where:{documentId:created.item.documentId}}),11);eq((await prisma.statementOfAccount.findUniqueOrThrow({where:{id:created.item.id}})).status,'DRAFT');
 await prisma.$executeRawUnsafe('DROP TRIGGER soa_cancel_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION soa_cancel_failure()');
 await call(manager,'POST',base+'/'+created.item.id+'/cancel',{expectedUpdatedAt:created.item.updatedAt,reason:'Owner fixture cancellation',confirmed:true});
 const cancelled=await prisma.statementOfAccount.findUniqueOrThrow({where:{id:created.item.id},include:{document:true}});eq(cancelled.status,'CANCELLED');eq(cancelled.document.status,'CANCELLED');eq(JSON.stringify(cancelled.snapshot),oldSnapshot);eq(await prisma.invoiceDocumentLink.count({where:{documentId:created.item.documentId}}),0);eq(sha((await call(reader,'GET',base+'/'+created.item.id+'/download')).rawPayload),oldHash);eq(await counts(),before);
 eq((await prisma.$transaction(tx=>assertInvoiceUnused(tx,companies[0].id,unusedId))).links.length,0);
 await call(manager,'POST',base+'/'+created.item.id+'/cancel',{expectedUpdatedAt:cancelled.updatedAt.toISOString(),reason:'Again',confirmed:true},409);
 eq((await call(manager,'POST',base+'/create',confirmed)).json().item.status,'CANCELLED');
 const current=await preview(),pay=await prisma.invoicePayment.findFirstOrThrow({where:{invoiceId:own.crossing.id,paymentDate:new Date('2026-01-31')}});await prisma.invoicePayment.update({where:{id:pay.id},data:{paymentDate:new Date('2026-02-01')}});await call(manager,'POST',base+'/create',payload(current),409);await prisma.invoicePayment.update({where:{id:pay.id},data:{paymentDate:pay.paymentDate}});
 let racePlan=await preview(),racePayload=payload(racePlan);const races=await Promise.all([req(manager,'POST',base+'/create',racePayload),req(manager,'POST',base+'/create',racePayload)]);eq(races.filter(r=>r.statusCode===201).length,1);eq(races.some(r=>[200,409,429].includes(r.statusCode)),true);eq((await call(manager,'POST',base+'/create',racePayload)).json().replayed,true);
 // Saved document snapshot and file stay stable after later source payments move.
 const raceItem=races.find(r=>r.statusCode===201).json().item,raceFile=await call(manager,'GET',base+'/'+raceItem.id+'/download');await prisma.invoicePayment.update({where:{id:pay.id},data:{paymentDate:new Date('2026-02-01')}});eq(sha((await call(manager,'GET',base+'/'+raceItem.id+'/download')).rawPayload),sha(raceFile.rawPayload));await prisma.invoicePayment.update({where:{id:pay.id},data:{paymentDate:pay.paymentDate}});
 for(let i=0;i<9;i++){const p=await preview();await call(manager,'POST',base+'/create',payload(p),201);}
 const list=(await call(reader,'GET',base+'?page=1')).json(),last=(await call(reader,'GET',base+'?page=99')).json();eq(list.total,11);eq(list.items.length,10);eq(list.pageSize,10);eq(last.page,2);eq(last.items.length,1);eq(await counts(),before);
 const savedFile=await prisma.document.findUniqueOrThrow({where:{id:raceItem.documentId},include:{attachment:true}});const original=await readFile(resolve(storage,savedFile.attachment.storagePath));await writeFile(resolve(storage,savedFile.attachment.storagePath),Buffer.alloc(original.length));await call(reader,'GET',base+'/'+raceItem.id+'/download',undefined,409);await writeFile(resolve(storage,savedFile.attachment.storagePath),original);
 eq(await ledger(),originalLedger);
 if(process.env.SOA_PROOF_ROOT){await mkdir(process.env.SOA_PROOF_ROOT,{recursive:true});await writeFile(resolve(process.env.SOA_PROOF_ROOT,'synthetic-soa.pdf'),pdf.rawPayload);await writeFile(resolve(process.env.SOA_PROOF_ROOT,'soa-proof.json'),JSON.stringify({checks,sourceMoneyUnchanged:true,rollback:true,replay:true,tenantGuard:true,finalPageSigning:true,pages:doc.getPageCount()},null,2));}
 console.log('PASS: '+checks+' SOA cutoff, permissions, atomic file/DB rollback, replay, tenant, immutable PDF, final-page signing and history checks.');
}finally{await app.close();await prisma.$disconnect();}
