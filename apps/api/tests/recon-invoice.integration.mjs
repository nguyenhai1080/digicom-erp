import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {singleText,bundleText} from './recon-financial.characterization.mjs';
import {previewReconPage} from '../dist/modules/projects/recon-reader.js';
import {stampPdf} from '../dist/modules/projects/financial-documents.js';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_finance_'))throw new Error('Use a separate disposable financial acceptance database');
const storage=await mkdtemp(resolve(tmpdir(),'erp-finance-'));process.env.STORAGE_ROOT=storage;
const company=await prisma.company.upsert({where:{companyCode:'GST'},create:{companyCode:'GST',companyName:'Synthetic GST test company'},update:{}}),marker=randomUUID();
const other=await prisma.company.create({data:{companyCode:'FOREIGN_'+marker,companyName:'Synthetic foreign company'}});
const permissions=['PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST','RECON_CANCEL','INVOICE_CANCEL','RECON_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','INVOICE_VIEW','INVOICE_CREATE','INVOICE_ISSUE','REVENUE_VIEW','AR_VIEW','SYSTEM_CONFIG_EDIT'];
const ps=await Promise.all(permissions.map(code=>prisma.permission.upsert({where:{code},create:{code,name:code,module:'FIXTURE'},update:{}})));
const user=await prisma.user.create({data:{companyId:company.id,email:marker+'@example.test',fullName:'Synthetic finance test',passwordHash:'unused-local-session-fixture'}});
const role=await prisma.role.create({data:{companyId:company.id,code:marker,name:'Synthetic role',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const token=randomBytes(32).toString('hex'),origin='https://finance.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'GST'};
await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});
const headers={cookie:'erp_session='+token,origin,'x-csrf-token':csrfToken(token,config.secret)},app=await buildApp({auth:config,logger:false});let checks=0,proxy;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;},request=(method,url,payload,extra={})=>app.inject({method,url,payload,headers:{...headers,...extra}}),post=(url,payload)=>request('POST',url,payload);
const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:marker,partnerKey:marker,legalName:'Synthetic customer',partnerType:'CUSTOMER',invoiceRecipient:'Synthetic recipient',billingAddress:'Synthetic billing address',invoiceEmail:'billing@example.test',paymentTermDays:45}});
const makeService=name=>prisma.service.create({data:{companyId:company.id,serviceCode:marker+'-'+name,serviceKey:marker+'-'+name,serviceName:name,category:'OTHER',keyword:name}});
const service=await makeService('TESTSERVICE'),parent=await makeService('MCAVM-ISIGN'),children=await Promise.all(['VOICEMAIL','ISIGN','MCA'].map(makeService));
const contract=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:marker+'-S',contractNumber:'SYNTHETIC-001',contractName:'Synthetic output contract',status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:[{companyId:company.id,serviceId:service.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}]}}});
await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:marker+'-B',contractNumber:'SYNTHETIC-BUNDLE',contractName:'Synthetic bundle contract',status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:[parent,...children].map(s=>({companyId:company.id,serviceId:s.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}))}}});
async function makePdf(text,rotation=0){const doc=await PDFDocument.create(),page=doc.addPage([842,595]);page.setRotation(degrees(rotation));const font=await doc.embedFont(StandardFonts.Helvetica);let y=550;for(const line of text.split('\n')){page.drawText(line,{x:25,y,size:8,font});y-=18;}return Buffer.from(await doc.save({useObjectStreams:false}));}
async function upload(text,s=service,selectedPartner=partner){const bytes=await makePdf(text);const selection={partnerId:selectedPartner.id,serviceId:s.id,period:'2026-01'},pre=(await request('GET','/api/v1/output-recon/preflight?'+new URLSearchParams(selection))).json();const res=await post('/api/v1/output-recon/uploads',{...selection,filename:'Synthetic.pdf',base64:bytes.toString('base64'),fingerprint:pre.fingerprint,confirmNewVersion:pre.action==='CONFIRM_REPLACE'});check(res.statusCode,201);const u=res.json().item;
 const read=await post('/api/v1/output-recon/uploads/'+u.id+'/read',{expectedUpdatedAt:u.updatedAt});check(read.statusCode,200);return {bytes,item:read.json().item};}
const getReview=async id=>(await request('GET','/api/v1/output-recon/uploads/'+id+'/financial')).json();
const confirm=v=>({expectedUpdatedAt:v.item.updatedAt,digest:v.digest,signingAssetId:v.signingAsset.id,placement:{page:1,x:.55,y:.72,width:.18},confirmed:true});
const png=await sharp({create:{width:200,height:120,channels:3,background:'#d80000'}}).png().toBuffer();
async function uploadAsset(kind,bytes,filename,current=null){return post('/api/v1/company-assets',{kind,filename,base64:bytes.toString('base64'),expectedCurrentId:current,reason:'Synthetic local acceptance fixture'});}
const template=new AdmZip();template.addFile('[Content_Types].xml',Buffer.from('<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>'));template.addFile('xl/workbook.xml',Buffer.from('<workbook><sheets><sheet name="Invoice Feb 2019"/></sheets></workbook>'));template.addFile('xl/sharedStrings.xml',Buffer.from('<sst><si><t>GST Synthetic</t></si></sst>'));
const cells=['B1','C2','C3','C4','C6','C7','C8','C9','C10','C11','C12','C13','B14','C17','D17','D18','D19','C20','C22','C23','C24','C25','C26','C27','D27'];
template.addFile('xl/worksheets/sheet1.xml',Buffer.from('<worksheet><sheetData><row r="1">'+cells.map(ref=>'<c r="'+ref+'" t="s"><v>0</v></c>').join('')+'</row></sheetData></worksheet>'));template.addFile('xl/media/image1.png',png);template.addFile('xl/vbaProject.bin',Buffer.from('synthetic-vba-preserved-not-executed'));const templateBytes=template.toBuffer();
try{
 for(const path of ['/api/v1/invoices','/api/v1/output-recon/signing-asset'])check((await request('GET',path,undefined,{cookie:''})).statusCode,401);
 const disposable=await upload(singleText),deleteReconPath='/api/v1/output-recon/uploads/'+disposable.item.id+'/delete',deleteReconBody={expectedUpdatedAt:disposable.item.updatedAt,confirmed:true};
 check((await request('POST',deleteReconPath,deleteReconBody,{'x-csrf-token':'bad'})).statusCode,403);
 check((await post(deleteReconPath,{...deleteReconBody,confirmed:false})).statusCode,400);
 check((await post(deleteReconPath,{...deleteReconBody,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 check((await post(deleteReconPath,deleteReconBody)).statusCode,200);
 for(const suffix of ['', '/download','/preview','/review'])check((await request('GET','/api/v1/output-recon/uploads/'+disposable.item.id+suffix)).statusCode,404);
 check((await post('/api/v1/output-recon/uploads/'+disposable.item.id+'/read',{expectedUpdatedAt:disposable.item.updatedAt})).statusCode,409);
 const single=await upload(singleText),reviewWithoutAsset=await getReview(single.item.id);check(reviewWithoutAsset.canFinalize,false);check(reviewWithoutAsset.financial.ready,true);
 const currentAssets=await prisma.document.findMany({where:{companyId:company.id,entityType:'CompanyAsset',status:'ACTIVE'}});const assetCurrent=kind=>currentAssets.find(a=>a.documentType===kind)?.id??null;
 const uploadedAsset=await uploadAsset('SIGNING_COMPOSITE',png,'synthetic-signing.png',assetCurrent('SIGNING_COMPOSITE'));check(uploadedAsset.statusCode,201);check((await uploadAsset('INVOICE_TEMPLATE',templateBytes,'synthetic-template.xlsm',assetCurrent('INVOICE_TEMPLATE'))).statusCode,201);
 let v=await getReview(single.item.id);if(!v.canFinalize)console.log(v.errors);check(v.canFinalize,true);check(v.bindings[0].contractId,contract.id);
 check((await request('POST','/api/v1/output-recon/uploads/'+single.item.id+'/finalize',confirm(v),{'x-csrf-token':'bad'})).statusCode,403);
 check((await post('/api/v1/output-recon/uploads/'+single.item.id+'/finalize',{...confirm(v),digest:'0'.repeat(64)})).statusCode,409);
 const permission=ps.find(p=>p.code==='RECON_APPROVE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});check((await post('/api/v1/output-recon/uploads/'+single.item.id+'/finalize',confirm(v))).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 const correction=await post('/api/v1/output-recon/uploads/'+single.item.id+'/correct-financial',{expectedUpdatedAt:v.item.updatedAt,changes:[{lineNo:1,revenueMzn:'200'}],reason:'Synthetic verified correction'});check(correction.statusCode,200);check(correction.json().financial.mzn.remunerationProvider,'200.00');v=await getReview(single.item.id);const restore=await post('/api/v1/output-recon/uploads/'+single.item.id+'/correct-financial',{expectedUpdatedAt:v.item.updatedAt,changes:[{lineNo:1,revenueMzn:'100'}],reason:'Synthetic restore baseline'});check(restore.statusCode,200);v=await getReview(single.item.id);
 const original=await request('GET','/api/v1/output-recon/uploads/'+single.item.id+'/download');check(original.rawPayload,single.bytes);
 const preview=await post('/api/v1/output-recon/uploads/'+single.item.id+'/signed-preview',confirm(v));check(preview.statusCode,200);check(preview.headers['content-type'],'application/pdf');check(await prisma.revenue.count({where:{companyId:company.id,partnerId:partner.id}}),0);
 const approved=await post('/api/v1/output-recon/uploads/'+single.item.id+'/finalize',confirm(v));check(approved.statusCode,201);check(approved.json().item.status,'APPROVED');check(await prisma.revenue.count({where:{companyId:company.id,partnerId:partner.id}}),1);
 check((await post('/api/v1/output-recon/uploads/'+single.item.id+'/finalize',confirm(v))).statusCode,409);
 const revenue=await prisma.revenue.findFirstOrThrow({where:{companyId:company.id,partnerId:partner.id}});check(revenue.status,'INVOICE_READY');check(revenue.grossAmount.toFixed(2),'1.40');check(revenue.netAmount.toFixed(2),'1.40');check(revenue.calculationJson.invoiceRevenueUsd,'1.55');check(revenue.calculationJson.invoiceWhtUsd,'0.16');
 check((await request('GET','/api/v1/output-recon/uploads/'+single.item.id+'/download')).rawPayload,single.bytes);
 v=await getReview(single.item.id);const restamp=await post('/api/v1/output-recon/uploads/'+single.item.id+'/finalize',{...confirm(v),placement:{page:1,x:.1,y:.75,width:.12}});check(restamp.statusCode,201);check(restamp.json().finalization.documentVersion,2);const signedFile=await request('GET','/api/v1/output-recon/uploads/'+single.item.id+'/signed-download');check(signedFile.headers['content-disposition'],`attachment; filename="Reconciliation_TESTSERVICE_2026-01_${single.item.uploadCode}_v2.pdf"`);const signedAttachment=await prisma.document.findUnique({where:{id:restamp.json().finalization.documentId},include:{attachment:true}});check(signedAttachment.attachment.originalFilename,`Reconciliation_TESTSERVICE_2026-01_${single.item.uploadCode}_v2.pdf`);check(await prisma.revenue.count({where:{companyId:company.id,partnerId:partner.id}}),1);
 check((await post('/api/v1/output-recon/uploads/'+single.item.id+'/correct-financial',{expectedUpdatedAt:restamp.json().item.updatedAt,changes:[{lineNo:1,revenueMzn:'200'}],reason:'Forbidden after approval'})).statusCode,409);
 const bundle=await upload(bundleText,parent);v=await getReview(bundle.item.id);check(v.financial.details.length,4);check(v.canFinalize,true);
 const finalBundle=await post('/api/v1/output-recon/uploads/'+bundle.item.id+'/finalize',confirm(v));check(finalBundle.statusCode,201);check(await prisma.revenue.count({where:{companyId:company.id,partnerId:partner.id}}),5);
 const foreignUser=await prisma.user.create({data:{companyId:other.id,email:marker+'-foreign@example.test',fullName:'Synthetic foreign viewer',passwordHash:'unused'}});const foreignRole=await prisma.role.create({data:{companyId:other.id,code:marker,name:'Foreign fixture',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:foreignUser.id,roleId:foreignRole.id}});const foreignToken=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:other.id,userId:foreignUser.id,tokenHash:tokenHash(foreignToken),expiresAt:new Date(Date.now()+3600000)}});const foreignHeaders={cookie:'erp_session='+foreignToken,origin,'x-csrf-token':csrfToken(foreignToken,config.secret)};
 for(const path of ['/api/v1/output-recon/uploads/'+single.item.id+'/financial','/api/v1/output-recon/uploads/'+single.item.id+'/signed-download'])check((await request('GET',path,undefined,foreignHeaders)).statusCode,404);
 const selection={partnerId:partner.id,period:'2026-01',invoiceMode:'CONSOLIDATED',invoiceDate:'2026-02-01',paymentTermDays:45};
 let pResponse=await post('/api/v1/invoices/preview',selection);check(pResponse.statusCode,200);let p=pResponse.json();check(p.invoices.length,1);check(p.invoices[0].invoice.lines.length,2);check(p.invoices[0].invoice.totals,{revenue:'6.20',wht:'0.63',payable:'5.59'});check(p.invoices[0].invoice.dueDate,'2026-03-18');
 const grouped=p.invoices[0].invoice.lines.filter(l=>l.groupServiceId===parent.id);check(grouped.map(l=>l.wht),['0.47']);check(grouped.map(l=>l.payable),['4.19']);check(grouped.map(l=>l.serviceId),[parent.id]);
 const separated=await post('/api/v1/invoices/preview',{...selection,invoiceMode:'PER_SERVICE'});check(separated.statusCode,200);check(separated.json().invoices.length,2);check(separated.json().invoices.map(i=>i.invoice.lines.length).sort(),[1,1]);check((await request('POST','/api/v1/invoices/preview',selection,foreignHeaders)).statusCode,404);
 const invoiceBody=plan=>({...selection,digest:plan.digest,placements:plan.invoices.map(i=>({businessKey:i.businessKey,placement:{page:1,x:.6,y:.82,width:.25}})),confirmed:true});
 const pp=await post('/api/v1/invoices/preview-pdf',invoiceBody(p));check(pp.statusCode,200);check(pp.headers['content-type'],'application/pdf');check(await prisma.invoice.count({where:{partnerId:partner.id}}),0);
 const page=await post('/api/v1/invoices/preview-page',invoiceBody(p));check(page.statusCode,200);check(page.headers['content-type'],'image/png');
 check((await post('/api/v1/invoices/create',{...invoiceBody(p),placements:[]})).statusCode,400);
 const race=await Promise.all([post('/api/v1/invoices/create',invoiceBody(p)),post('/api/v1/invoices/create',invoiceBody(p))]);check(race.map(r=>r.statusCode).sort(),[201,429]);const inv=race.find(r=>r.statusCode===201).json().items[0];
 const invoice=await prisma.invoice.findUniqueOrThrow({where:{id:inv.id}});check(invoice.status,'DRAFT');check(invoice.payableAmount.toFixed(2),'5.59');check(invoice.snapshot.sourceRevenueIds.length,2);check(await prisma.invoiceScopeItem.count({where:{companyId:company.id,scope:{invoiceId:inv.id}}}),2);
 check((await request('GET','/api/v1/invoices/'+inv.id+'/download',undefined,foreignHeaders)).statusCode,404);
 const invPdf=await request('GET','/api/v1/invoices/'+inv.id+'/download');check(invPdf.statusCode,200);const wb=await request('GET','/api/v1/invoices/'+inv.id+'/download?format=workbook');check(wb.statusCode,200);const basename='Invoice_MCAVM-ISIGN+TESTSERVICE_2026-01_'+inv.invoiceNumber.replace(/\//g,'_')+'_v1';check(invPdf.headers['content-disposition'],`inline; filename="${basename}.pdf"`);check(wb.headers['content-disposition'],`attachment; filename="${basename}.xlsm"`);const pdfAttachment=await prisma.document.findUnique({where:{id:invoice.documentId},include:{attachment:true}});check(pdfAttachment.attachment.originalFilename,basename+'.pdf');await prisma.invoice.update({where:{id:inv.id},data:{snapshot:{...invoice.snapshot,fileServices:null}}});check((await request('GET','/api/v1/invoices/'+inv.id+'/download')).headers['content-disposition'].includes('MCAVM-ISIGN+TESTSERVICE_2026-01_'),true);const zip=new AdmZip(wb.rawPayload);check(zip.readFile('xl/vbaProject.bin'),template.readFile('xl/vbaProject.bin'));check(zip.readFile('xl/media/image1.png'),png);check(zip.readAsText('xl/worksheets/sheet1.xml').includes('<v>5.59</v>'),true);check(zip.readAsText('xl/worksheets/sheet1.xml').includes(inv.invoiceNumber),true);
 check((await request('GET','/api/v1/invoices/'+inv.id+'/download',undefined,{cookie:''})).statusCode,401);check((await post('/api/v1/invoices/create',invoiceBody(p))).statusCode,409);
 check((await post('/api/v1/invoices/preview',{...selection,invoiceMode:'PER_SERVICE'})).statusCode,409);
 // Asset replacement invalidates the prior preview even when totals are unchanged.
 p=(await post('/api/v1/invoices/preview',selection)).json();const oldSigner=(await prisma.document.findFirst({where:{companyId:company.id,documentType:'SIGNING_COMPOSITE',status:'ACTIVE'}})).id;
 const png2=await sharp({create:{width:200,height:120,channels:3,background:'#00aa00'}}).png().toBuffer();check((await uploadAsset('SIGNING_COMPOSITE',png2,'synthetic-signing2.png',oldSigner)).statusCode,201);check((await post('/api/v1/invoices/create',invoiceBody(p))).statusCode,409);
 p=(await post('/api/v1/invoices/preview',selection)).json();const regenerated=await post('/api/v1/invoices/create',invoiceBody(p));check(regenerated.statusCode,201);check(regenerated.json().items[0].revisionNo,2);check((await prisma.invoice.findUnique({where:{id:inv.id}})).status,'SUPERSEDED');check((await request('GET','/api/v1/invoices/'+inv.id+'/download')).rawPayload,invPdf.rawPayload);
 const newId=regenerated.json().items[0].id;await prisma.invoice.update({where:{id:newId},data:{paidAmount:'0.01'}});check((await post('/api/v1/invoices/preview',selection)).statusCode,409);
 const deletePath='/api/v1/invoices/'+newId+'/delete',paidDraft=await prisma.invoice.findUniqueOrThrow({where:{id:newId}});
 check((await post(deletePath,{expectedUpdatedAt:paidDraft.updatedAt.toISOString(),confirmed:true})).statusCode,409);
 const freshDraft=await prisma.invoice.update({where:{id:newId},data:{paidAmount:0}}),deleteBody={expectedUpdatedAt:freshDraft.updatedAt.toISOString(),confirmed:true};
 check((await request('POST',deletePath,deleteBody,foreignHeaders)).statusCode,404);
 check((await request('POST',deletePath,deleteBody,{'x-csrf-token':'bad'})).statusCode,403);
 const deletes=await Promise.all([post(deletePath,deleteBody),post(deletePath,deleteBody)]);check(deletes.map(r=>r.statusCode).sort(),[200,409]);
 check(await prisma.invoiceScopeItem.count({where:{scope:{invoiceId:newId},isCurrent:true}}),0);
 check(await prisma.accountReceivable.count({where:{invoiceId:newId}}),0);
 check((await request('GET','/api/v1/invoices/'+newId+'/download')).statusCode,404);
 check((await request('GET','/api/v1/invoices/'+newId+'/download?format=workbook')).statusCode,404);
 const afterDeletePlan=(await post('/api/v1/invoices/preview',selection)).json();
 const afterDeleteCreate=await post('/api/v1/invoices/create',invoiceBody(afterDeletePlan));check(afterDeleteCreate.statusCode,201);check(afterDeleteCreate.json().items[0].revisionNo,3);
 // A second synthetic partner verifies real per-service creation and rollback
 // after the first group's documents have been written.
 const partner2=await prisma.partner.create({data:{companyId:company.id,partnerKey:marker+'-2',partnerCode:marker+'-2',legalName:'Second synthetic customer',partnerType:'CUSTOMER'}});
 for(const [number,services] of [['SYNTHETIC-001',[service]],['SYNTHETIC-BUNDLE',[parent,...children]]])await prisma.contract.create({data:{companyId:company.id,partnerId:partner2.id,contractCode:marker+'-2-'+number,contractNumber:number,contractName:'Synthetic second contract',status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:services.map(s=>({companyId:company.id,serviceId:s.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}))}}});
 for(const [text,s] of [[singleText,service],[bundleText,parent]]){const u=await upload(text,s,partner2),v=await getReview(u.item.id);check((await post('/api/v1/output-recon/uploads/'+u.item.id+'/finalize',confirm(v))).statusCode,201);}
 const separateSelection={...selection,partnerId:partner2.id,invoiceMode:'PER_SERVICE'},separatePlan=(await post('/api/v1/invoices/preview',separateSelection)).json(),separateBody={...separateSelection,digest:separatePlan.digest,placements:separatePlan.invoices.map(i=>({businessKey:i.businessKey,placement:{page:1,x:.6,y:.82,width:.25}})),confirmed:true};
 const fileCount=async()=>{try{return (await readdir(resolve(storage,'invoices',company.id),{recursive:true})).length;}catch{return 0;}};const beforeFiles=await fileCount();
 const brokenPlacements=structuredClone(separateBody);brokenPlacements.placements[1].placement.x=.99;
 check((await post('/api/v1/invoices/create',brokenPlacements)).statusCode,400);check(await prisma.invoice.count({where:{partnerId:partner2.id}}),0);check(await fileCount(),beforeFiles);
 check((await post('/api/v1/invoices/preview',separateSelection)).json().digest,separatePlan.digest);
 const separateCreated=await post('/api/v1/invoices/create',separateBody);check(separateCreated.statusCode,201);check(separateCreated.json().items.length,2);check(await prisma.invoice.count({where:{partnerId:partner2.id,isCurrent:true}}),2);
 // Issue and AR are one atomic workflow; previews never create financial records.
 const issueIds=separateCreated.json().items.map(i=>i.id),issuePath='/api/v1/invoices/'+issueIds[0];
 const revenueList=(await request('GET','/api/v1/revenues?period=2026-01&partnerId='+partner2.id)).json();
 check(revenueList.total,2);check(revenueList.monthlyPayableUsd,'5.59');
 const revenueDetails=(await request('GET','/api/v1/revenues?period=2026-01&partnerId='+partner2.id+'&details=true')).json();check(revenueDetails.total,5);check(revenueDetails.monthlyPayableUsd,'5.59');
 const arPath='/api/v1/receivables?asOf=2026-03-19&partnerId='+partner2.id;
 check((await request('GET',arPath)).json().total,0);
 check((await request('POST',issuePath+'/issue-preview',{},foreignHeaders)).statusCode,404);
 check((await request('POST',issuePath+'/issue-preview',{}, {'x-csrf-token':'bad'})).statusCode,403);
 const issuePermission=ps.find(p=>p.code==='INVOICE_ISSUE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:issuePermission.id}}});check((await post(issuePath+'/issue-preview',{})).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:issuePermission.id}});
 const ipResponse=await post(issuePath+'/issue-preview',{});check(ipResponse.statusCode,200);const ip=ipResponse.json();check(ip.items.length,2);check(await prisma.accountReceivable.count({where:{companyId:company.id}}),0);
 const issueBody={digest:ip.digest,confirmedSent:true};
 check((await post(issuePath+'/issue',{...issueBody,digest:'0'.repeat(64)})).statusCode,409);check((await post(issuePath+'/issue',{...issueBody,confirmedSent:false})).statusCode,400);
 const secondInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:issueIds[1]}});
 await prisma.invoice.update({where:{id:secondInvoice.id},data:{payableAmount:secondInvoice.payableAmount.plus(1)}});
 check((await post(issuePath+'/issue',issueBody)).statusCode,409);check(await prisma.accountReceivable.count({where:{companyId:company.id}}),0);check((await prisma.invoice.findUnique({where:{id:issueIds[0]}})).status,'DRAFT');
 await prisma.invoice.update({where:{id:secondInvoice.id},data:{payableAmount:secondInvoice.payableAmount}});
 const sourceScope=await prisma.invoiceScope.findFirstOrThrow({where:{invoiceId:issueIds[0]},include:{items:{include:{revenue:true}}}});
 const sourceRecon=sourceScope.items[0].revenue.reconciliationId;
 await prisma.reconciliation.update({where:{id:sourceRecon},data:{status:'CANCELLED'}});check((await post(issuePath+'/issue-preview',{})).statusCode,409);await prisma.reconciliation.update({where:{id:sourceRecon},data:{status:'APPROVED'}});
 const freshIssue=(await post(issuePath+'/issue-preview',{})).json();
 // Inject a database failure after the first AR write; the entire issue batch must roll back.
 if(!/^[a-f0-9-]{36}$/.test(secondInvoice.id))throw new Error('Unexpected synthetic UUID');
 await prisma.$executeRawUnsafe("ALTER TABLE account_receivables ADD CONSTRAINT acceptance_no_second_ar CHECK (invoice_id <> '"+secondInvoice.id+"'::uuid)");
 check((await post(issuePath+'/issue',{digest:freshIssue.digest,confirmedSent:true})).statusCode,500);
 check(await prisma.accountReceivable.count({where:{companyId:company.id}}),0);check(await prisma.invoice.count({where:{id:{in:issueIds},status:'DRAFT'}}),2);
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables DROP CONSTRAINT acceptance_no_second_ar');

 const races=await Promise.all([post(issuePath+'/issue',{digest:freshIssue.digest,confirmedSent:true}),post(issuePath+'/issue',{digest:freshIssue.digest,confirmedSent:true})]);check(races.map(r=>r.statusCode).sort(),[200,409]);
 check(await prisma.accountReceivable.count({where:{companyId:company.id}}),2);
 for(const id of issueIds){const issued=await prisma.invoice.findUniqueOrThrow({where:{id},include:{receivable:true}});check(issued.status,'ISSUED');check(issued.issuedById,user.id);check(!!issued.issuedAt,true);check(issued.receivable.originalAmount.toFixed(2),issued.payableAmount.toFixed(2));check(issued.receivable.paidAmount.toFixed(2),'0.00');check(issued.receivable.outstandingAmount.toFixed(2),issued.payableAmount.toFixed(2));}
 check((await post(issuePath+'/issue-preview',{})).statusCode,409);check((await post('/api/v1/invoices/'+inv.id+'/issue-preview',{})).statusCode,409);check((await post('/api/v1/invoices/'+newId+'/issue-preview',{})).statusCode,409);
 const ars=(await request('GET',arPath)).json();check(ars.total,2);check(ars.totals,{original:'5.59',paid:'0.00',outstanding:'5.59'});check(ars.items.every(a=>a.status==='OVERDUE'&&a.agingDays===1),true);
 check((await request('GET',arPath.replace('2026-03-19','2026-03-18'))).json().items.every(a=>a.status==='OPEN'&&a.agingDays===0),true);
 check((await request('GET',arPath,undefined,foreignHeaders)).json().total,0);check((await request('GET','/api/v1/receivables?asOf=invalid')).statusCode,400);
 check((await request('GET','/api/v1/revenues?details=true&partnerId='+partner2.id)).json().items.every(v=>v.status==='INVOICED'),false); // CHILD remains approved detail; only TOTAL is billed.
 check((await request('GET','/api/v1/revenues?partnerId='+partner2.id)).json().items.every(v=>v.status==='INVOICED'),true);
 // DGC payment flow: issued/current only, USD AR and independently recorded VND.
 const payInv=await prisma.invoice.findUniqueOrThrow({where:{id:issueIds[0]}}),payUrl='/api/v1/invoices/'+payInv.id+'/payments';
 const cashAccount=await prisma.cashAccount.create({data:{companyId:company.id,accountCode:'TEST_BANK',name:'Synthetic bank',kind:'BANK',currency:'VND',bankName:'Synthetic',accountNumber:'000TEST',holderName:'Synthetic',openingDate:new Date('2010-01-01'),openingBalance:0,balance:0,note:''}});
 const paymentBody={cashAccountId:cashAccount.id,requestId:randomUUID(),expectedUpdatedAt:payInv.updatedAt.toISOString(),paymentDate:'2026-03-19',paidUsd:'0.50',paidVnd:'12500',swiftNo:'SYNTHETIC-SWIFT',bankAccount:'Synthetic bank account',paymentMethod:'Bank Transfer',note:'Synthetic payment only',confirmed:true,swiftFile:{filename:'synthetic-swift.pdf',base64:single.bytes.toString('base64')}};
 check((await request('GET',payUrl,undefined,foreignHeaders)).statusCode,404);
 check((await request('POST',payUrl,paymentBody,foreignHeaders)).statusCode,404);
 check((await request('POST',payUrl,paymentBody,{'x-csrf-token':'bad'})).statusCode,403);
 const paymentPermission=ps.find(p=>p.code==='PAYMENT_APPROVE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:paymentPermission.id}}});check((await post(payUrl,paymentBody)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:paymentPermission.id}});
 check((await post(payUrl,{...paymentBody,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 check((await post(payUrl,{...paymentBody,paidUsd:'9999'})).statusCode,409);
 check((await post('/api/v1/invoices/'+inv.id+'/payments',paymentBody)).statusCode,409);
 const scopeBefore=await prisma.invoiceScope.findFirstOrThrow({where:{invoiceId:payInv.id}});await prisma.invoiceScope.update({where:{id:scopeBefore.id},data:{isCurrent:false}});check((await post(payUrl,paymentBody)).statusCode,409);await prisma.invoiceScope.update({where:{id:scopeBefore.id},data:{isCurrent:true}});
 // A downstream failure rolls back payment, Invoice, AR, audit and uploaded evidence.
 const filesBefore=await prisma.attachment.count({where:{companyId:company.id}});
 await prisma.$executeRawUnsafe("ALTER TABLE account_receivables ADD CONSTRAINT acceptance_no_payment CHECK (paid_amount=0)");
 const rollbackPayment=await post(payUrl,paymentBody);if(rollbackPayment.statusCode!==500)console.log('Payment rollback response',rollbackPayment.json());check(rollbackPayment.statusCode,500);check(await prisma.invoicePayment.count({where:{invoiceId:payInv.id}}),0);check(await prisma.attachment.count({where:{companyId:company.id}}),filesBefore);
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables DROP CONSTRAINT acceptance_no_payment');
 const paymentsRace=await Promise.all([post(payUrl,paymentBody),post(payUrl,paymentBody)]);check(paymentsRace.map(r=>r.statusCode),[200,200]);check(paymentsRace[0].json().paymentId,paymentsRace[1].json().paymentId);check(await prisma.invoicePayment.count({where:{invoiceId:payInv.id}}),1);
 check((await post(payUrl,{...paymentBody,paidUsd:'0.51'})).statusCode,409);
 let paidInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:payInv.id},include:{receivable:true}});check(paidInvoice.status,'PARTIALLY_PAID');check(paidInvoice.paidAmount.toFixed(2),'0.50');check(paidInvoice.receivable.paidAmount.toFixed(2),'0.50');
 const history=(await request('GET',payUrl)).json();check(history.items.length,1);check(history.items[0].fxRate,'25000');check(history.items[0].paidVnd,'12500');
 const swiftUrl='/api/v1/invoice-payments/'+history.items[0].id+'/document';check((await request('GET',swiftUrl)).rawPayload,single.bytes);check((await request('GET',swiftUrl,undefined,foreignHeaders)).statusCode,404);
 const finalBody={...paymentBody,requestId:randomUUID(),expectedUpdatedAt:paidInvoice.updatedAt.toISOString(),paidUsd:paidInvoice.receivable.outstandingAmount.toFixed(2),paidVnd:'100000',swiftFile:{filename:'synthetic-swift.png',base64:png.toString('base64')}};
 const paidResponse=await post(payUrl,finalBody);check(paidResponse.statusCode,200);paidInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:payInv.id},include:{receivable:true}});check(paidInvoice.status,'PAID');check(paidInvoice.receivable.outstandingAmount.toFixed(2),'0.00');check(paidInvoice.receivable.status,'PAID');
 const lastPayment=await prisma.invoicePayment.findUniqueOrThrow({where:{id:paidResponse.json().paymentId}});check((await request('GET','/api/v1/invoice-payments/'+lastPayment.id+'/document')).rawPayload,png);
 check((await post(payUrl,{...finalBody,requestId:randomUUID(),expectedUpdatedAt:paidInvoice.updatedAt.toISOString()})).statusCode,409);
 // Current receivables register lists outstanding AR only; settled balances remain in the ledger.
 check((await request('GET',arPath)).json().totals.paid,'0.00');check(paidInvoice.receivable.paidAmount.toFixed(2),paidInvoice.payableAmount.toFixed(2));
 check(await prisma.auditLog.count({where:{companyId:company.id,action:'INVOICE_PAYMENT_POST'}}),2);
 // Manual GST entitlement: no MOVITEL OCR or share calculation; VND end-to-end.
 const vnatel=await prisma.partner.create({data:{companyId:company.id,partnerCode:marker+'-VN',partnerKey:marker+'-VN',legalName:'Synthetic VNATEL',partnerType:'CUSTOMER'}});
 const film=await makeService('FILM_CINETOP'),vnContract=await prisma.contract.create({data:{companyId:company.id,partnerId:vnatel.id,contractCode:marker+'-VN',contractName:'Synthetic VNATEL VND',currency:'VND',status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:[{companyId:company.id,serviceId:film.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}]}}});
 const entry={period:'2026-02',serviceId:film.id,contractId:vnContract.id,currency:'VND',amount:'25000000',deduction:'0',fxRate:'25000',note:'User supplied GST entitlement; no auto share'},manualBody={partnerId:vnatel.id,rows:[entry]},murl='/api/v1/manual-revenue';
 check((await request('POST',murl+'/drafts',manualBody,{'x-csrf-token':'bad'})).statusCode,403);
 check((await post(murl+'/drafts',{...manualBody,rows:[{...entry,amount:'1.23'}]})).statusCode,409);
 check((await request('POST',murl+'/drafts',manualBody,foreignHeaders)).statusCode,409);
 const csv=Buffer.from('period,serviceCode,contractCode,currency,amount,deduction,fxRate,note\r\n2026-02,'+film.serviceCode+','+vnContract.contractCode+',VND,25000000,0,25000,Manual GST entitlement\r\n'),file={filename:'Revenue.csv',base64:csv.toString('base64')};
 const imported=await post(murl+'/import-preview',{partnerId:vnatel.id,file});check(imported.statusCode,200);check(imported.json().rows[0].usd,'1000.00');check(imported.json().rows[0].vnd,'25000000');check(await prisma.revenue.count({where:{partnerId:vnatel.id}}),0);
 const saved=await post(murl+'/drafts',{...manualBody,source:file});check(saved.statusCode,201);const mid=saved.json().items[0].id;
 check((await post(murl+'/drafts',manualBody)).statusCode,409);
 let mr=await prisma.reconciliation.findUniqueOrThrow({where:{id:mid}});const mb=()=>({expectedUpdatedAt:mr.updatedAt.toISOString(),confirmed:true});
 // Donor and current UI allow direct Draft approval, but only with approval permission.
 const manualApprovalPermission=ps.find(p=>p.code==='RECON_APPROVE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:manualApprovalPermission.id}}});check((await post(murl+'/'+mid+'/approve',mb())).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:manualApprovalPermission.id}});check((await request('GET',murl+'/'+mid+'/source')).rawPayload,csv);check((await request('GET',murl+'/'+mid+'/source',undefined,foreignHeaders)).statusCode,404);
 check((await post(murl+'/'+mid+'/submit',mb())).statusCode,200);mr=await prisma.reconciliation.findUniqueOrThrow({where:{id:mid}});check(await prisma.revenue.count({where:{partnerId:vnatel.id}}),0);
 check((await post(murl+'/'+mid+'/approve',{...mb(),expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 const manualRace=await Promise.all([post(murl+'/'+mid+'/approve',mb()),post(murl+'/'+mid+'/approve',mb())]);check(manualRace.map(r=>r.statusCode).sort(),[200,409]);check(await prisma.revenue.count({where:{partnerId:vnatel.id}}),1);mr=await prisma.reconciliation.findUniqueOrThrow({where:{id:mid}});check((await post(murl+'/'+mid+'/cancel',mb())).statusCode,409);
 const manualRevenue=await prisma.revenue.findFirstOrThrow({where:{partnerId:vnatel.id}});check(manualRevenue.currency,'VND');check(manualRevenue.netAmount.toFixed(0),'25000000');check(manualRevenue.calculationJson.nativeWht,'0');
 const listing=(await request('GET','/api/v1/revenues?partnerId='+vnatel.id)).json();check(listing.items[0].equivalents,{usd:'1000.00',vnd:'25000000'});check(listing.monthlyPayableUsd,'0.00');
 const vsel={...selection,partnerId:vnatel.id,period:'2026-02',currency:'VND'},vr=await post('/api/v1/invoices/preview',vsel);check(vr.statusCode,200);const vp=vr.json();check(vp.invoices[0].invoice.currency,'VND');check(vp.invoices[0].invoice.lines.length,1);check(vp.invoices[0].invoice.lines[0].serviceId,film.id);check(vp.invoices[0].invoice.totals.payable,'25000000.00');check(vp.invoices[0].invoice.amountInWords.includes('Vietnamese Dong'),true);
 check((await post('/api/v1/invoices/preview',{...vsel,currency:'USD'})).statusCode,409);
 const vc={...vsel,digest:vp.digest,placements:vp.invoices.map(i=>({businessKey:i.businessKey,placement:{page:1,x:.6,y:.82,width:.25}})),confirmed:true};
 check((await post('/api/v1/invoices/preview-pdf',vc)).statusCode,200);const viResponse=await post('/api/v1/invoices/create',vc);check(viResponse.statusCode,201);const vid=viResponse.json().items[0].id;
 const vx=(await request('GET','/api/v1/invoices/'+vid+'/download?format=workbook'));check(vx.statusCode,200);const vzip=new AdmZip(vx.rawPayload);check(vzip.readAsText('xl/worksheets/sheet1.xml').includes('Revenue VND'),true);check(vx.headers['content-disposition'].endsWith('.xlsx"'),true);
 const vip=await post('/api/v1/invoices/'+vid+'/issue-preview',{});check(vip.statusCode,200);check(vip.json().items[0].currency,'VND');check((await post('/api/v1/invoices/'+vid+'/issue',{digest:vip.json().digest,confirmedSent:true})).statusCode,200);
 let vinv=await prisma.invoice.findUniqueOrThrow({where:{id:vid},include:{receivable:true}});check(vinv.currency,'VND');check(vinv.receivable.outstandingAmount.toFixed(0),'25000000');
 const vpmt={cashAccountId:cashAccount.id,requestId:randomUUID(),expectedUpdatedAt:vinv.updatedAt.toISOString(),paymentDate:'2026-03-01',paidUsd:'0',paidVnd:'10000000',fxRate:'1',swiftNo:'VNATEL-REF',bankAccount:'Synthetic VND account',paymentMethod:'Bank Transfer',note:'Synthetic partial VND receipt',confirmed:true};
 check((await post('/api/v1/invoices/'+vid+'/payments',{...vpmt,paidUsd:'1'})).statusCode,409);
 check((await post('/api/v1/invoices/'+vid+'/payments',vpmt)).statusCode,200);check((await post('/api/v1/invoices/'+vid+'/payments',vpmt)).statusCode,200);
 vinv=await prisma.invoice.findUniqueOrThrow({where:{id:vid},include:{receivable:true}});check(vinv.receivable.outstandingAmount.toFixed(0),'15000000');check(vinv.status,'PARTIALLY_PAID');
 const next={...vpmt,requestId:randomUUID(),expectedUpdatedAt:vinv.updatedAt.toISOString(),paidVnd:'15000001'};check((await post('/api/v1/invoices/'+vid+'/payments',next)).statusCode,409);check((await post('/api/v1/invoices/'+vid+'/payments',{...next,paidVnd:'15000000'})).statusCode,200);
 const varResult=(await request('GET','/api/v1/receivables?asOf=2026-03-01&partnerId='+vnatel.id)).json();check(varResult.totalsByCurrency.find(v=>v.currency==='VND').outstanding,'0');check(varResult.totals.original,'0.00');
 check((await request('GET','/api/v1/invoices/'+vid+'/payments')).json().items.length,2);
 check((await post('/api/v1/revenue-fx',{period:'2026-01',rate:'25000',source:'Synthetic reporting FX',confirmed:true})).statusCode,200);check((await post('/api/v1/revenue-fx',{period:'2026-01',rate:'26000',source:'Cannot overwrite',confirmed:true})).statusCode,409);
 const direct=await post(murl+'/drafts',{partnerId:vnatel.id,rows:[{...entry,period:'2026-04'}]});check(direct.statusCode,201);const directId=direct.json().items[0].id,directDraft=await prisma.reconciliation.findUniqueOrThrow({where:{id:directId}});check((await post(murl+'/'+directId+'/approve',{expectedUpdatedAt:directDraft.updatedAt.toISOString(),confirmed:true})).statusCode,200);check(await prisma.revenue.count({where:{reconciliationId:directId}}),1);
 // Placement uses actual visual crop box for every orthogonal rotation.
 const square=await sharp({create:{width:100,height:100,channels:3,background:'#d80000'}}).png().toBuffer();
 for(const rotation of [0,90,180,270]){const doc=await PDFDocument.create(),page=doc.addPage([300,200]);page.setCropBox(20,15,260,170);page.setRotation(degrees(rotation));const source=Buffer.from(await doc.save({useObjectStreams:false}));const signed=await stampPdf(source,square,'image/png',{page:1,x:.2,y:.2,width:.15});const rendered=await previewReconPage(signed,1),{data:pix,info}=await sharp(rendered).removeAlpha().raw().toBuffer({resolveWithObject:true});const x=Math.floor(info.width*.25),y=Math.floor(info.height*(.2+.075*info.width/info.height)),idx=(y*info.width+x)*info.channels;check(pix[idx]>150&&pix[idx+1]<50&&pix[idx+2]<50,true);}
 // Actual HTTP proxy preserves PDF, preview PNG and XLSM bytes/content types.
 const address=await app.listen({host:'127.0.0.1',port:0});proxy=spawn(process.execPath,[resolve('../../apps/web/server.mjs')],{env:{...process.env,PORT:'0',API_BASE_URL:address},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(new Error('Proxy timeout')),10000);proxy.stdout.on('data',chunk=>{const p=String(chunk).match(/listening on port (\d+)/)?.[1];if(p){clearTimeout(timer);res(p);}});proxy.once('error',rej);});
 for(const [url,mime,expected] of [['/api/v1/invoices/'+inv.id+'/download','application/pdf',invPdf.rawPayload],['/api/v1/invoices/'+inv.id+'/download?format=workbook','application/vnd.ms-excel.sheet.macroEnabled.12',wb.rawPayload]]){const got=await fetch('http://127.0.0.1:'+port+url,{headers:{cookie:headers.cookie}});check(got.status,200);check(got.headers.get('content-type'),mime);check(Buffer.from(await got.arrayBuffer()),expected);}
 if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});for(const [name,bytes] of [['synthetic-original.pdf',single.bytes],['synthetic-signed.pdf',(await request('GET','/api/v1/output-recon/uploads/'+single.item.id+'/signed-download')).rawPayload],['synthetic-invoice.pdf',invPdf.rawPayload],['synthetic-invoice-preview.png',page.rawPayload]])await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,name),bytes);}
 console.log(`PASS: ${checks} financial finalization, invoice, tenant, source preservation, aggregate totals, revisions, stale asset/payment guards, all PDF rotations and proxy checks.`);
}finally{proxy?.kill();await app.close();await prisma.$disconnect();}
