import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {PDFDocument,PDFName,PDFDict,degrees} from 'pdf-lib';
import sharp from 'sharp';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {parseReconFinancial} from '../dist/modules/projects/recon-financial.js';
import {prepareReconDocument,reconSigningMode} from '../dist/modules/projects/recon-signing.js';
import {previewReconPage} from '../dist/modules/projects/recon-reader.js';
import {singleText} from './recon-financial.characterization.mjs';
import {dgcRolePresets} from '../dist/modules/auth/dgc-role-presets.js';

if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_dgc_recon'))throw Error('Use a disposable DGC recon acceptance database');
const storage=await mkdtemp(resolve(tmpdir(),'dgc-recon-synthetic-'));process.env.STORAGE_ROOT=storage;
const company=await prisma.company.upsert({where:{companyCode:'DGC'},create:{companyCode:'DGC',companyName:'Synthetic DGC',defaultCurrency:'USD'},update:{}});
assert.equal(await prisma.outputReconUpload.count(),0,'Fresh synthetic database required');
const marker=randomUUID(),origin='https://dgc-recon.example.test',raw=randomBytes(32).toString('hex');
const permissions=['SYSTEM_CONFIG_EDIT','RECON_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','RECON_RESTAMP','INPUT_RECON_VIEW','INPUT_RECON_GENERATE','INPUT_RECON_APPROVE','AP_VIEW'];
const ps=await Promise.all(permissions.map(code=>prisma.permission.upsert({where:{code},create:{code,name:code,module:'FIXTURE'},update:{}})));
const role=await prisma.role.create({data:{companyId:company.id,code:marker,name:'Synthetic capability fixture',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});
const user=await prisma.user.create({data:{companyId:company.id,email:marker+'@example.test',fullName:'Synthetic DGC actor',passwordHash:'unused fixture'}});
await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});
const config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
const accountantPreset=dgcRolePresets().find(p=>p.code==='DGC_ACCOUNTANT'),accountantPermissions=await Promise.all(accountantPreset.permissionCodes.map(code=>prisma.permission.upsert({where:{code},create:{code,name:code,module:'FIXTURE'},update:{}})));
const accountant=await prisma.user.create({data:{companyId:company.id,email:randomUUID()+'@example.test',fullName:'Synthetic accountant',passwordHash:'unused fixture'}}),accountantRole=await prisma.role.create({data:{companyId:company.id,code:'ACCOUNTING_FIXTURE',name:'Synthetic accountant',permissions:{create:accountantPermissions.map(p=>({permissionId:p.id}))}}});
await prisma.userRole.create({data:{userId:accountant.id,roleId:accountantRole.id}});const accountantRaw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:company.id,userId:accountant.id,tokenHash:tokenHash(accountantRaw),expiresAt:new Date(Date.now()+3600000)}});
const accountantHeaders={cookie:'erp_session='+accountantRaw,'x-csrf-token':csrfToken(accountantRaw,config.secret)};
const app=await buildApp({auth:config,logger:false});let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},hash=b=>createHash('sha256').update(b).digest('hex');
const request=(method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret),...extra}});
const post=(url,payload,extra)=>request('POST',url,payload,extra),base='/api/v1/company-assets',compose=base+'/signing-composite';
const ok=async(url,payload,status=200)=>{const r=await post(url,payload);assert.equal(r.statusCode,status,r.body);checks++;return r.json();};
async function capability(code,enabled){const id=ps.find(p=>p.code===code).id;if(enabled)await prisma.rolePermission.create({data:{roleId:role.id,permissionId:id}});else await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:id}}});}
const png=async color=>sharp({create:{width:200,height:100,channels:4,background:color}}).png().toBuffer();
const images={stamp:await png('#dd0000'),signature:await png('#0000dd'),title:await png('#008800')};
const sourceIds={};
async function upload(kind,bytes,current=null){return (await ok(base,{kind,filename:'synthetic.png',base64:bytes.toString('base64'),expectedCurrentId:current,reason:'Synthetic image only'},201)).item;}
const files=async()=>{const result=[];for(const folder of ['company-assets','signed-recon'])try{result.push(...(await readdir(resolve(storage,folder,company.id))).map(n=>folder+'/'+n));}catch(e){if(e.code!=='ENOENT')throw e;}return result.sort();};
try{
 eq(reconSigningMode('DIGICOM','DGC'),'DGC_COMPOSITE');eq(reconSigningMode('DIGICOM','GST'),'EXTERNAL_DIGITAL');
 eq((await post(compose+'/preview',{sourceIds})).statusCode,400);
 for(const [name,kind] of Object.entries({stamp:'COMPANY_STAMP',signature:'SIGNATURE',title:'SIGNER_TITLE_NAME'}))sourceIds[name]=(await upload(kind,images[name])).id;
 eq((await post(compose+'/preview',{sourceIds},{cookie:''})).statusCode,401);
 eq((await post(compose+'/preview',{sourceIds},{'x-csrf-token':'bad'})).statusCode,403);
 eq((await post(compose+'/preview',{sourceIds},{origin:'https://foreign.test'})).statusCode,403);
 await capability('SYSTEM_CONFIG_EDIT',false);eq((await post(compose+'/preview',{sourceIds})).statusCode,403);await capability('SYSTEM_CONFIG_EDIT',true);
 eq((await post(compose+'/preview',{sourceIds:{...sourceIds,title:randomUUID()}})).statusCode,409);
 const foreign=await prisma.company.create({data:{companyCode:'FOREIGN_'+marker,companyName:'Synthetic foreign tenant'}});
 const ownSource=await prisma.document.findUniqueOrThrow({where:{id:sourceIds.title}});
 const foreignSource=await prisma.document.create({data:{companyId:foreign.id,documentCode:'SYNTHETIC_FOREIGN',documentType:'SIGNER_TITLE_NAME',entityType:'CompanyAsset',entityId:foreign.id,attachmentId:ownSource.attachmentId}});
 eq((await post(compose+'/preview',{sourceIds:{...sourceIds,title:foreignSource.id}})).statusCode,409);
 const originalAttachment=await prisma.attachment.findUniqueOrThrow({where:{id:ownSource.attachmentId}});
 await writeFile(resolve(storage,originalAttachment.storagePath),Buffer.alloc(images.title.length));
 eq((await post(compose+'/preview',{sourceIds})).statusCode,409);
 await writeFile(resolve(storage,originalAttachment.storagePath),images.title);
 let preview=await ok(compose+'/preview',{sourceIds});const bytes=Buffer.from(preview.base64,'base64');eq((await sharp(bytes).metadata()).hasAlpha,true);
 const {data:pixels,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});eq(pixels[3],0);eq(info.width,1100);
 const payload=()=>({sourceIds:{...sourceIds},digest:preview.digest,expectedCurrentId:null,reason:'Synthetic composite approval'});
 eq((await post(compose+'/create',{...payload(),digest:'0'.repeat(64)})).statusCode,409);
 const races=await Promise.all([post(compose+'/create',payload()),post(compose+'/create',payload())]);
 eq(races.filter(r=>r.statusCode===201).length,1);eq(races.some(r=>[409,429].includes(r.statusCode)),true);
 let composite=races.find(r=>r.statusCode===201).json().item;eq(composite.version,1);
 const downloaded=await request('GET',base+'/'+composite.id+'/download');eq(hash(downloaded.rawPayload),hash(bytes));
 const composeAudit=await prisma.auditLog.findFirstOrThrow({where:{entityId:composite.id,action:'COMPANY_ASSET_COMPOSE'}});eq(composeAudit.newValue.provenance.sources.stamp.id,sourceIds.stamp);
 for(const [name,id] of Object.entries(sourceIds))eq((await request('GET',base+'/'+id+'/download')).rawPayload,images[name]);
 eq((await post(compose+'/create',payload())).statusCode,409);
 const oldPreview=preview,oldIds={...sourceIds};sourceIds.signature=(await upload('SIGNATURE',await png('#3333ff'),sourceIds.signature)).id;
 eq((await post(compose+'/create',{...payload(),sourceIds:oldIds,digest:oldPreview.digest,expectedCurrentId:composite.id})).statusCode,409);
 preview=await ok(compose+'/preview',{sourceIds});
 const beforeFiles=await files(),beforeDocs=await prisma.document.count();
 await prisma.$executeRawUnsafe("CREATE FUNCTION dgc_compose_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='COMPANY_ASSET_COMPOSE' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER dgc_compose_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_compose_failure()');
 try{eq((await post(compose+'/create',{...payload(),expectedCurrentId:composite.id})).statusCode,503);eq(await files(),beforeFiles);eq(await prisma.document.count(),beforeDocs);eq((await prisma.document.findUniqueOrThrow({where:{id:composite.id}})).status,'ACTIVE');}finally{await prisma.$executeRawUnsafe('DROP TRIGGER dgc_compose_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION dgc_compose_failure()');}
 composite=(await ok(compose+'/create',{...payload(),expectedCurrentId:composite.id},201)).item;eq(composite.version,2);
 const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYNTHETIC',partnerKey:'DIGICOM',legalName:'Synthetic customer',partnerType:'CUSTOMER'}});
 const service=await prisma.service.create({data:{companyId:company.id,serviceCode:'SYNTHETIC',serviceKey:'TESTSERVICE',serviceName:'TESTSERVICE',category:'OTHER'}});
 const contract=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:'SYNTHETIC',contractNumber:'SYNTHETIC-001',contractName:'Synthetic USD output',currency:'USD',status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:{companyId:company.id,serviceId:service.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE',currency:'USD'}}}});
 const pdf=await PDFDocument.create();for(const rot of [0,90,180,270]){const page=pdf.addPage([500,500]);page.setCropBox(20,15,460,470);page.setRotation(degrees(rot));}
 const original=Buffer.from(await pdf.save({useObjectStreams:false})),selection={partnerId:partner.id,serviceId:service.id,period:'2026-01'};
 const pre=(await request('GET','/api/v1/output-recon/preflight?'+new URLSearchParams(selection))).json();
 const uploadResponse=await post('/api/v1/output-recon/uploads',{...selection,filename:'Synthetic.pdf',base64:original.toString('base64'),fingerprint:pre.fingerprint},accountantHeaders);eq(uploadResponse.statusCode,201);
 const uploadResult=uploadResponse.json(),id=uploadResult.item.id,url='/api/v1/output-recon/uploads/'+id;eq((await prisma.outputReconUpload.findUniqueOrThrow({where:{id}})).createdById,accountant.id);
 // Isolate finalization from OCR: freeze a characterized synthetic extraction on
 // an actual uploaded PDF. The full reader is covered by recon-invoice integration.
 await prisma.outputReconUpload.update({where:{id},data:{rawText:singleText,status:'OCR_EXTRACTED',extractionData:{financial:parseReconFinancial(singleText),pages:[{},{},{},{}]}}});
 const review=async()=>(await request('GET',url+'/financial')).json();let v=await review();eq(v.signingMode,'DGC_COMPOSITE');eq(v.restampPermission,'RECON_RESTAMP');eq(v.operationalCurrency,'USD');eq(v.errors,[]);eq(v.canFinalize,true);
 const corrected=await post(url+'/correct-financial',{expectedUpdatedAt:v.item.updatedAt,changes:[{lineNo:1,revenueMzn:'101.00'}],reason:'Synthetic accounting preparation'},accountantHeaders);eq(corrected.statusCode,200);
 eq((await prisma.auditLog.findFirstOrThrow({where:{entityId:id,action:'RECON_CORRECT_FINANCIAL'}})).userId,accountant.id);
 for(const action of ['signed-preview','finalize'])eq((await post(url+'/'+action,{},accountantHeaders)).statusCode,403);
 await prisma.outputReconUpload.update({where:{id},data:{extractionData:{financial:{...parseReconFinancial(singleText),source:'DIGICOM_VND_STATEMENT'}}}});
 eq((await review()).errors.includes('Mẫu đối soát này ghi phần thực nhận của GST; không dùng làm doanh thu DGC.'),true);
 await prisma.outputReconUpload.update({where:{id},data:{extractionData:{financial:parseReconFinancial(singleText),pages:[{},{},{},{}]}}});v=await review();
 const confirm=()=>({expectedUpdatedAt:v.item.updatedAt,digest:v.digest,signingAssetId:v.signingAsset.id,placement:{page:1,x:.1,y:.4,width:.3},confirmed:true});
 eq((await request('GET','/api/v1/output-recon/signing-asset?v='+randomUUID())).statusCode,409);
 eq((await post(url+'/signed-preview',{...confirm(),signingAssetId:randomUUID()})).statusCode,409);
 await prisma.contract.update({where:{id:contract.id},data:{currency:'MZN'}});eq((await review()).canFinalize,false);await prisma.contract.update({where:{id:contract.id},data:{currency:'USD'}});v=await review();
 await capability('RECON_APPROVE',false);eq((await post(url+'/signed-preview',confirm())).statusCode,403);eq((await post(url+'/finalize',confirm())).statusCode,403);await capability('RECON_APPROVE',true);
 eq((await post(url+'/signed-preview',{...confirm(),placement:{page:1,x:.95,y:.95,width:.3}})).statusCode,400);
 const signed=await post(url+'/signed-preview',confirm());eq(signed.statusCode,200);eq(await prisma.reconciliation.count(),0);
 const signedPdf=await PDFDocument.load(signed.rawPayload);eq(signedPdf.getPageCount(),4);for(const page of signedPdf.getPages())eq(page.node.Resources().lookup(PDFName.of('XObject'),PDFDict).keys().length,1);
 if(process.env.DGC_TEST_PDF_PREVIEW==='true')for(let page=1;page<=4;page++){const rendered=await previewReconPage(signed.rawPayload,page);const {data,info}=await sharp(rendered).removeAlpha().raw().toBuffer({resolveWithObject:true});const x=Math.floor(info.width*.13),y=Math.floor(info.height*.46),i=(y*info.width+x)*info.channels;eq(data[i]>150&&data[i+1]<80&&data[i+2]<80,true);}
 const financialFiles=await files();await prisma.$executeRawUnsafe("CREATE FUNCTION dgc_recon_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RECON_FINALIZE' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER dgc_recon_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_recon_failure()');
 try{eq((await post(url+'/finalize',confirm())).statusCode,500);eq(await prisma.reconciliation.count(),0);eq(await prisma.revenue.count(),0);eq(await files(),financialFiles);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER dgc_recon_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION dgc_recon_failure()');}
 const final=await ok(url+'/finalize',confirm(),201);eq(final.finalization.signingMode,'DGC_COMPOSITE');eq(final.finalization.signingAssetId,composite.id);eq(final.finalization.signingAssetVersion,2);
 const rec=await prisma.reconciliation.findUniqueOrThrow({where:{id:final.finalization.reconciliationId},include:{items:true}});eq(rec.currency,'USD');eq(rec.totalGrossRevenue.toFixed(2),'17.98');eq(rec.totalNetRevenue.toFixed(2),'1.40');eq(rec.items[0].netRevenue.toFixed(2),'1.40');eq(rec.approvedSnapshot.financial.mzn.partnerRevenue,'90.00');
 const revenue=await prisma.revenue.findFirstOrThrow({where:{reconciliationId:rec.id}});eq(revenue.currency,'USD');eq(revenue.netAmount.toFixed(2),'1.40');eq(await prisma.invoice.count(),0);eq(await prisma.accountReceivable.count(),0);eq(await prisma.cashEntry.count(),0);
 const inputPartner=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYNTHETIC_INPUT',partnerKey:'SYNTHETIC_INPUT',legalName:'Synthetic input supplier',partnerType:'SUPPLIER',status:'ACTIVE'}});
 await prisma.contract.create({data:{companyId:company.id,partnerId:inputPartner.id,contractCode:'SYNTHETIC_INPUT',contractName:'Synthetic PDF-source input',currency:'USD',status:'ACTIVE',dgcDirection:'Input',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',revenueShareRate:'.4',taxRate:'0',services:{create:{companyId:company.id,serviceId:service.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE',revenueShareRate:'.4'}}}});
 const inputPreview=await ok('/api/v1/input-recon/preview',{revenueId:revenue.id});eq(inputPreview.baseUsd,'1.40');eq(inputPreview.payableAmount,'0.56');
 const inputRow=await ok('/api/v1/input-recon/generate',{revenueId:revenue.id,digest:inputPreview.digest,confirmed:true},201);
 const inputApproval=await ok('/api/v1/input-recon/'+inputRow.item.id+'/approve',{expectedUpdatedAt:inputRow.item.updatedAt,confirmed:true});eq(inputApproval.payable.originalAmount,'0.56');eq(await prisma.accountPayable.count(),1);eq(await prisma.cashEntry.count(),0);
 const sourceAttachment=await prisma.attachment.findUniqueOrThrow({where:{id:uploadResult.item.attachmentId}});eq(hash(await readFile(resolve(storage,sourceAttachment.storagePath))),hash(original));
 v=await review();await capability('RECON_RESTAMP',false);eq((await post(url+'/signed-preview',confirm())).statusCode,403);eq((await post(url+'/finalize',confirm())).statusCode,403);await capability('RECON_RESTAMP',true);
 const oldDownload=await request('GET',url+'/signed-download');eq(oldDownload.statusCode,200);
 const replaced=await ok(url+'/finalize',{...confirm(),placement:{page:2,x:.12,y:.4,width:.3}},201);eq(replaced.finalization.documentVersion,2);eq(await prisma.revenue.count(),1);eq(await prisma.reconciliation.count(),1);eq((await prisma.document.findUniqueOrThrow({where:{id:final.finalization.documentId}})).status,'SUPERSEDED');
 eq((await ok('/api/v1/input-recon/preview',{revenueId:revenue.id})).digest,inputPreview.digest);eq(await prisma.accountPayable.count(),1);
 const stale=confirm();await upload('SIGNING_COMPOSITE',await png('#555555'),composite.id);eq((await post(url+'/signed-preview',stale)).statusCode,409);
 if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-dgc-composite.png'),Buffer.from(preview.base64,'base64'));await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-dgc-composite-recon.pdf'),signed.rawPayload);}
 console.log('PASS: '+checks+' DGC composition, original-image preservation, source/version/digest/CSRF/permissions, rollback, all-page signing, USD provenance and placement-only invariants.');
}finally{await app.close();await prisma.$disconnect();}
