import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import {PDFDocument} from 'pdf-lib';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {linkInvoiceDocument,linkInvoiceDocuments} from '../dist/modules/projects/invoice-cancel.js';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_dgc'))throw Error('Use a disposable DGC acceptance database');
const storage=await mkdtemp(resolve(tmpdir(),'dgc-invoice-synthetic-'));process.env.STORAGE_ROOT=storage;
const company=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}});
const user=await prisma.user.create({data:{companyId:company.id,email:'dgc-invoice-'+randomUUID()+'@example.test',fullName:'Synthetic invoice actor',passwordHash:'unused synthetic hash'}});
const role=await prisma.role.findUniqueOrThrow({where:{companyId_code:{companyId:company.id,code:'ADMIN'}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const origin='https://dgc-invoice.example.test',raw=randomBytes(32).toString('hex'),config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:true,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});
const app=await buildApp({auth:config,logger:false});let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const request=(method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret),...extra}});
const post=(url,payload,extra)=>request('POST',url,payload,extra);
const ok=async(url,payload,status=200)=>{const r=await post(url,payload);if(r.statusCode!==status)throw Error(url+' expected '+status+' got '+r.statusCode+': '+r.body);eq(r.statusCode,status);return r.json();};
const profile={issuerName:'Synthetic DGC Company',address:'Synthetic address only',phone:'+00 000',fax:'',email:'issuer@example.test',website:'example.test',taxCode:'SYNTHETIC',bank:{beneficiary:'Synthetic beneficiary',account:'SYNTHETIC_ACCOUNT',bankName:'Synthetic bank',bankAddress:'Synthetic bank address',swift:'SYNTHETIC'},signatureName:'Synthetic fixture signer',signatureTitle:'Fixture only'};
const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYNTHETIC_DGC',partnerKey:'SYNTHETIC_DGC',legalName:'Synthetic customer',partnerType:'CUSTOMER',status:'ACTIVE',billingAddress:'Synthetic billing address',invoiceRecipient:'Synthetic recipient',invoiceEmail:'recipient@example.test'}});
async function approvedRevenue(currency,period,amount,deduction){
 const s=await prisma.service.create({data:{companyId:company.id,serviceKey:randomUUID(),serviceCode:randomUUID(),serviceName:'Synthetic '+currency+' service',category:'OTHER'}});
 const c=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:randomUUID(),contractName:'Synthetic contract',contractNumber:'SYNTHETIC-ONLY',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',currency,status:'ACTIVE'}});
 await prisma.contractService.create({data:{companyId:company.id,contractId:c.id,serviceId:s.id,businessModel:'REVENUE_SHARE',currency,dgcStatus:'ACTIVE'}});
 const d=await ok('/api/v1/manual-revenue/drafts',{partnerId:partner.id,rows:[{period,serviceId:s.id,contractId:c.id,currency,amount,deduction,note:'Synthetic characterization fixture'}]},201),id=d.items[0].id;
 for(const action of ['submit','approve']){const r=await prisma.reconciliation.findUniqueOrThrow({where:{id}});await ok('/api/v1/manual-revenue/'+id+'/'+action,{expectedUpdatedAt:r.updatedAt.toISOString(),confirmed:true});}
 return prisma.revenue.findFirstOrThrow({where:{companyId:company.id,reconciliationId:id},include:{reconciliation:true}});
}
const selection={partnerId:partner.id,period:'2026-01',currency:'USD',invoiceMode:'CONSOLIDATED',invoiceDate:'2026-02-01',paymentTermDays:45};
const payload=(p,sel=selection)=>({...sel,digest:p.digest,confirmed:true,placements:p.invoices.map(i=>({businessKey:i.businessKey,placement:i.suggestedDgcPlacement.stamp,dgcPlacement:i.suggestedDgcPlacement}))});
const files=async()=>{const all=[];for(const folder of ['invoices']){const root=resolve(storage,folder,company.id);try{all.push(...await readdir(root));}catch(e){if(e.code!=='ENOENT')throw e;}}return all.sort();};
try{
 eq((await request('GET','/api/v1/company/invoice-profile',undefined,{cookie:''})).statusCode,401);
 eq((await request('GET','/api/v1/company/invoice-profile')).json().profile,null);
 eq((await post('/api/v1/company/invoice-profile',{profile,expectedUpdatedAt:null,reason:'Synthetic setup'},{'x-csrf-token':'bad'})).statusCode,403);
 let setting=await ok('/api/v1/company/invoice-profile',{profile,expectedUpdatedAt:null,reason:'Synthetic setup'});eq(setting.metadata.version,1);
 eq((await post('/api/v1/company/invoice-profile',{profile,expectedUpdatedAt:null,reason:'Stale'})).statusCode,409);
 eq((await post('/api/v1/company/invoice-profile',{profile,expectedUpdatedAt:setting.updatedAt,reason:'Spoof',companyId:randomUUID()})).statusCode,400);
 const source=await approvedRevenue('USD','2026-01','100.00','10.00');
 eq((await post('/api/v1/invoices/preview',selection)).statusCode,409);
 const png=await sharp({create:{width:200,height:100,channels:4,background:'#ddeeff'}}).png().toBuffer();
 for(const kind of ['COMPANY_LOGO','COMPANY_STAMP','SIGNATURE'])await ok('/api/v1/company-assets',{kind,filename:'synthetic-'+kind+'.png',base64:png.toString('base64'),expectedCurrentId:null,reason:'Synthetic test image, no real signature'},201);
 let p=await ok('/api/v1/invoices/preview',selection);eq(p.renderer,'DGC');eq(p.invoices[0].invoice.invoiceNumber,'01/02/2026/DGC-INV');eq(p.invoices[0].invoice.totals,{revenue:'100.00',wht:'10.00',payable:'90.00'});
 eq((await request('GET','/api/v1/invoices/signing-asset?kind=stamp&v='+p.dgcSigningAssets.stamp.id)).rawPayload,png);
 eq((await request('GET','/api/v1/invoices/signing-asset?kind=signature&v='+randomUUID())).statusCode,409);
 const zeroTerm=await ok('/api/v1/invoices/preview',{...selection,paymentTermDays:0});eq(zeroTerm.invoices[0].invoice.paymentTermDays,45);eq(zeroTerm.invoices[0].invoice.dueDate,'2026-03-18');
 const permission=await prisma.permission.findUniqueOrThrow({where:{code:'INVOICE_CREATE'}});await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});eq((await post('/api/v1/invoices/preview',selection)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 const missing=payload(p);delete missing.placements[0].dgcPlacement;eq((await post('/api/v1/invoices/create',missing)).statusCode,400);eq(await prisma.invoice.count(),0);
 const bad=payload(p);bad.placements[0].dgcPlacement.stamp.y=.1;eq((await post('/api/v1/invoices/preview-pdf',bad)).statusCode,400);
 const firstPayload=payload(p);setting=await ok('/api/v1/company/invoice-profile',{profile:{...profile,phone:'+00 001'},expectedUpdatedAt:setting.updatedAt,reason:'Synthetic profile version change'});eq(setting.metadata.version,2);eq((await post('/api/v1/invoices/create',firstPayload)).statusCode,409);
 p=await ok('/api/v1/invoices/preview',selection);
 const pdf=await post('/api/v1/invoices/preview-pdf',payload(p));eq(pdf.statusCode,200);eq(pdf.headers['content-type'],'application/pdf');assert.ok((await PDFDocument.load(pdf.rawPayload)).getPageCount()>=1);
 if(process.env.DGC_TEST_PDF_PREVIEW==='true'){const page=await post('/api/v1/invoices/preview-page',payload(p));eq(page.statusCode,200);eq(page.headers['content-type'],'image/png');eq(page.rawPayload.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
 if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-dgc-route-preview.pdf'),pdf.rawPayload);}
 const created=await ok('/api/v1/invoices/create',payload(p),201),firstId=created.items[0].id;eq(await prisma.accountReceivable.count(),0);eq(await prisma.cashEntry.count(),0);
 const first=await prisma.invoice.findUniqueOrThrow({where:{id:firstId}});eq(first.snapshot.layout,'DGC_V61_V1');eq(first.snapshot.resourceVersions.template.version,2);eq(first.snapshot.resourceVersions.stamp.id,p.dgcSigningAssets.stamp.id);
 const book=await request('GET','/api/v1/invoices/'+firstId+'/download?format=workbook');eq(book.statusCode,200);const zip=new AdmZip(book.rawPayload);assert.ok(zip.readAsText('xl/workbook.xml').includes('DGC Invoice'));assert.ok(zip.readAsText('xl/worksheets/sheet1.xml').includes('90.00'));
 const draftWorkflow=await prisma.approvalWorkflow.create({data:{companyId:company.id,workflowCode:randomUUID(),workflowName:'Synthetic draft approval',entityType:'Invoice'}});
 const draftApproval=await prisma.approvalRequest.create({data:{companyId:company.id,workflowId:draftWorkflow.id,entityType:'Invoice',entityId:firstId}});
 eq((await post('/api/v1/invoices/'+firstId+'/delete',{expectedUpdatedAt:first.updatedAt.toISOString(),confirmed:true})).statusCode,409);
 await prisma.approvalRequest.delete({where:{id:draftApproval.id}});
 await ok('/api/v1/invoices/'+firstId+'/delete',{expectedUpdatedAt:first.updatedAt.toISOString(),confirmed:true});
 // Simulate a preserved historical number with a stale sequence, including cancelled history.
 await prisma.invoice.update({where:{id:firstId},data:{invoiceNumber:'09/02/2026/DGC-INV'}});
 p=await ok('/api/v1/invoices/preview',selection);eq(p.invoices[0].invoice.invoiceNumber,'10/02/2026/DGC-INV');
 const beforeFiles=await files(),beforeDocs=await prisma.document.count(),beforeSeq=(await prisma.sequence.findUniqueOrThrow({where:{companyId_sequenceName:{companyId:company.id,sequenceName:'DGC_INVOICE_2026-02'}}})).currentValue;
 await prisma.$executeRawUnsafe("CREATE FUNCTION dgc_test_invoice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INVOICE_CREATE' THEN RAISE EXCEPTION 'synthetic downstream failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER dgc_test_invoice_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_test_invoice_failure()');
 try{eq((await post('/api/v1/invoices/create',payload(p))).statusCode,500);eq(await files(),beforeFiles);eq(await prisma.document.count(),beforeDocs);eq((await prisma.sequence.findUniqueOrThrow({where:{companyId_sequenceName:{companyId:company.id,sequenceName:'DGC_INVOICE_2026-02'}}})).currentValue,beforeSeq);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER dgc_test_invoice_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION dgc_test_invoice_failure()');}
 const races=await Promise.all([post('/api/v1/invoices/create',payload(p)),post('/api/v1/invoices/create',payload(p))]);eq(races.map(r=>r.statusCode).sort(),[201,429]);
 const invoiceId=races.find(r=>r.statusCode===201).json().items[0].id;eq((await prisma.invoice.findUniqueOrThrow({where:{id:invoiceId}})).invoiceNumber,'10/02/2026/DGC-INV');eq(await prisma.accountReceivable.count(),0);
 // A reviewed source version cannot change after PDF creation, even if totals stay the same.
 const oldJson=source.calculationJson;await prisma.revenue.update({where:{id:source.id},data:{calculationJson:{...oldJson,syntheticSourceChanged:true}}});eq((await post('/api/v1/invoices/'+invoiceId+'/issue-preview',{})).statusCode,409);
 await prisma.revenue.update({where:{id:source.id},data:{calculationJson:oldJson}});
 // Regenerate the draft after the source version changed; restoration does not erase history.
 p=await ok('/api/v1/invoices/preview',selection);const regenerated=await ok('/api/v1/invoices/create',payload(p),201),currentId=regenerated.items[0].id;eq(regenerated.items[0].revisionNo,3);
 const issue=await ok('/api/v1/invoices/'+currentId+'/issue-preview',{});await ok('/api/v1/invoices/'+currentId+'/issue',{digest:issue.digest,confirmedHistorical:true,historicalReason:'Synthetic source fixture; no email sent'});
 eq(await prisma.accountReceivable.count({where:{invoiceId:currentId}}),1);eq((await prisma.accountReceivable.findFirstOrThrow({where:{companyId:company.id,invoiceId:currentId}})).outstandingAmount.toFixed(2),'90.00');eq((await post('/api/v1/invoices/'+currentId+'/issue',{digest:issue.digest,confirmedSent:true})).statusCode,409);eq(await prisma.cashEntry.count(),0);
 await approvedRevenue('VND','2026-03','1000000','0');const vndSelection={...selection,currency:'VND',period:'2026-03',invoiceDate:'2026-04-01'};const vndPlan=await ok('/api/v1/invoices/preview',vndSelection);eq(vndPlan.invoices[0].invoice.invoiceNumber,'01/04/2026/DGC-INV');const vnd=await ok('/api/v1/invoices/create',payload(vndPlan,vndSelection),201);const vndIssue=await ok('/api/v1/invoices/'+vnd.items[0].id+'/issue-preview',{});await ok('/api/v1/invoices/'+vnd.items[0].id+'/issue',{digest:vndIssue.digest,confirmedHistorical:true,historicalReason:'Synthetic VND issue characterization'});eq((await prisma.accountReceivable.findFirstOrThrow({where:{companyId:company.id,invoiceId:vnd.items[0].id}})).originalAmount.toFixed(),'1000000');

 // Cancellation retains financial history and files, releases source billing,
 // and excludes the old AR rather than erasing its original balanced amounts.
 const cancelUrl='/api/v1/invoices/'+currentId+'/cancel',previewUrl=cancelUrl+'-preview';
 eq((await request('GET','/api/v1/invoices/references')).json().canCancelUnpaid,true);
 eq((await post(previewUrl,{}, {cookie:''})).statusCode,401);
 eq((await post(previewUrl,{}, {'x-csrf-token':'invalid'})).statusCode,403);
 eq((await post('/api/v1/invoices/'+randomUUID()+'/cancel-preview',{})).statusCode,404);
 const cancelPermission=await prisma.permission.findUniqueOrThrow({where:{code:'INVOICE_CANCEL'}});
 await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:cancelPermission.id}}});
 eq((await post(previewUrl,{})).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:cancelPermission.id}});
 for(const status of ['PAID','PARTIALLY_PAID','SUPERSEDED']){await prisma.invoice.update({where:{id:currentId},data:{status}});eq((await post(previewUrl,{})).statusCode,409);}
 await prisma.invoice.update({where:{id:currentId},data:{status:'ISSUED',isCurrent:false}});eq((await post(previewUrl,{})).statusCode,409);await prisma.invoice.update({where:{id:currentId},data:{isCurrent:true}});
 let cancelPreview=await ok(previewUrl,{});eq(cancelPreview.hasReceivable,true);
 eq((await post(cancelUrl,{digest:cancelPreview.digest,reason:'too short',confirmed:true})).statusCode,400);
 eq((await post(cancelUrl,{digest:'0'.repeat(64),reason:'Synthetic wrong digest',confirmed:true})).statusCode,409);
 const activeAr=await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:currentId}});
 await prisma.accountReceivable.update({where:{id:activeAr.id},data:{paidAmount:'1',outstandingAmount:'89'}});eq((await post(previewUrl,{})).statusCode,409);
 await prisma.accountReceivable.update({where:{id:activeAr.id},data:{paidAmount:'0',outstandingAmount:'90'}});
 const pdfDocument=await prisma.document.findUniqueOrThrow({where:{id:(await prisma.invoice.findUniqueOrThrow({where:{id:currentId}})).documentId},include:{attachment:true}});
 const pdfPath=resolve(storage,pdfDocument.attachment.storagePath),pdfBytes=await readFile(pdfPath);
 await writeFile(pdfPath,Buffer.from('tampered fixture'));eq((await post(previewUrl,{})).statusCode,409);await writeFile(pdfPath,pdfBytes);
 for(const kind of ['SOA','APPROVAL_PACKAGE']){
  const doc=await prisma.document.create({data:{companyId:company.id,documentCode:randomUUID(),documentType:kind,entityType:kind,entityId:randomUUID(),attachmentId:pdfDocument.attachmentId}});
  await assert.rejects(()=>prisma.invoiceDocumentLink.create({data:{companyId:randomUUID(),invoiceId:currentId,documentId:doc.id,kind}}));checks++;
  await prisma.$transaction(tx=>linkInvoiceDocument(tx,company.id,currentId,doc.id,kind));
  await prisma.$transaction(tx=>linkInvoiceDocument(tx,company.id,currentId,doc.id,kind));
  eq(await prisma.invoiceDocumentLink.count({where:{invoiceId:currentId}}),1);eq((await post(previewUrl,{})).statusCode,409);
  await prisma.invoiceDocumentLink.deleteMany({where:{invoiceId:currentId}});
 }
 const batchDoc=await prisma.document.create({data:{companyId:company.id,documentCode:randomUUID(),documentType:'SOA',entityType:'SOA',entityId:randomUUID(),attachmentId:pdfDocument.attachmentId}});
 await prisma.$transaction(tx=>linkInvoiceDocuments(tx,company.id,[currentId,vnd.items[0].id,currentId],batchDoc.id,'SOA'));
 eq(await prisma.invoiceDocumentLink.count({where:{documentId:batchDoc.id}}),2);eq((await post(previewUrl,{})).statusCode,409);
 await prisma.invoiceDocumentLink.deleteMany({where:{documentId:batchDoc.id}});
 const workflow=await prisma.approvalWorkflow.create({data:{companyId:company.id,workflowCode:randomUUID(),workflowName:'Synthetic approval',entityType:'Invoice'}});
 const approval=await prisma.approvalRequest.create({data:{companyId:company.id,workflowId:workflow.id,entityType:'Invoice',entityId:currentId}});
 eq((await post(previewUrl,{})).statusCode,409);await prisma.approvalRequest.delete({where:{id:approval.id}});
 // A recorded payment blocks cancellation even if cached header/AR still show zero paid.
 const zeroPayment=await prisma.invoicePayment.create({data:{companyId:company.id,invoiceId:currentId,paymentCode:randomUUID(),requestId:randomUUID(),requestDigest:'synthetic',paymentDate:new Date('2026-02-01'),paidUsd:1,allocationAmount:1,cashAmount:1,cashCurrency:'USD',historicalSource:{reference:'Synthetic payment guard fixture'},swiftNo:'SYNTHETIC',bankAccount:'SYNTHETIC',paymentMethod:'SYNTHETIC',note:'Synthetic guard fixture',approvedById:user.id}});
 eq((await post(previewUrl,{})).statusCode,409);await prisma.invoicePayment.delete({where:{id:zeroPayment.id}});
 cancelPreview=await ok(previewUrl,{});const oldStatus=(await prisma.revenue.findUniqueOrThrow({where:{id:source.id}})).status;
 await prisma.revenue.update({where:{id:source.id},data:{status:oldStatus}});
 eq((await post(cancelUrl,{digest:cancelPreview.digest,reason:'Synthetic stale preview',confirmed:true})).statusCode,409);
 cancelPreview=await ok(previewUrl,{});
 const beforeCancelFiles=await files();
 await prisma.$executeRawUnsafe("CREATE FUNCTION dgc_cancel_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INVOICE_CANCEL_UNPAID' THEN RAISE EXCEPTION 'synthetic cancel rollback'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER dgc_cancel_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_cancel_failure()');
 try{eq((await post(cancelUrl,{digest:cancelPreview.digest,reason:'Synthetic audit rollback',confirmed:true})).statusCode,500);eq((await prisma.invoice.findUniqueOrThrow({where:{id:currentId}})).status,'ISSUED');eq((await prisma.accountReceivable.findUniqueOrThrow({where:{id:activeAr.id}})).status,'OPEN');eq((await prisma.revenue.findUniqueOrThrow({where:{id:source.id}})).status,'INVOICED');eq(await files(),beforeCancelFiles);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER dgc_cancel_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION dgc_cancel_failure()');}
 const cancelRace=await Promise.all([post(cancelUrl,{digest:cancelPreview.digest,reason:'Synthetic concurrent cancel',confirmed:true}),post(cancelUrl,{digest:cancelPreview.digest,reason:'Synthetic concurrent cancel',confirmed:true})]);
 eq(cancelRace.map(r=>r.statusCode).sort(),[200,409]);
 const cancelled=await prisma.invoice.findUniqueOrThrow({where:{id:currentId}});eq(cancelled.status,'CANCELLED');eq(cancelled.isCurrent,false);eq(cancelled.issuedAt!==null,true);
 const cancelledAr=await prisma.accountReceivable.findUniqueOrThrow({where:{id:activeAr.id}});eq(cancelledAr.status,'CANCELLED');eq(cancelledAr.originalAmount.toFixed(2),'90.00');eq(cancelledAr.outstandingAmount.toFixed(2),'90.00');
 eq((await prisma.revenue.findUniqueOrThrow({where:{id:source.id}})).status,'INVOICE_READY');eq(await prisma.invoiceScopeItem.count({where:{scope:{invoiceId:currentId},isCurrent:true}}),0);
 eq(await files(),beforeCancelFiles);eq(await readFile(pdfPath),pdfBytes);eq((await request('GET','/api/v1/invoices/'+currentId+'/download')).statusCode,404);
 eq((await request('GET','/api/v1/receivables?asOf=2026-10-20')).json().items.some(i=>i.invoiceId===currentId),false);
 eq(await prisma.auditLog.count({where:{entityId:currentId,action:'INVOICE_CANCEL_UNPAID'}}),1);eq(await prisma.cashEntry.count(),0);
 const newPlan=await ok('/api/v1/invoices/preview',selection),replacement=await ok('/api/v1/invoices/create',payload(newPlan),201);eq(replacement.items[0].revisionNo,4);
 const replacementIssue=await ok('/api/v1/invoices/'+replacement.items[0].id+'/issue-preview',{});await ok('/api/v1/invoices/'+replacement.items[0].id+'/issue',{digest:replacementIssue.digest,confirmedHistorical:true,historicalReason:'Synthetic replacement after unpaid cancellation'});
 eq(await prisma.accountReceivable.count({where:{invoice:{companyId:company.id,partnerId:partner.id,period:'2026-01',isCurrent:true}}}),1);
 eq(await prisma.accountReceivable.count({where:{invoiceId:currentId}}),1);
 const overdueStored=await prisma.invoice.findUniqueOrThrow({where:{id:vnd.items[0].id}});eq(overdueStored.status,'ISSUED');eq(overdueStored.dueDate<new Date('2026-10-20'),true);
 const overdueUrl='/api/v1/invoices/'+vnd.items[0].id+'/cancel',overdue=await ok(overdueUrl+'-preview',{});
 await ok(overdueUrl,{digest:overdue.digest,reason:'Synthetic overdue VND cancellation',confirmed:true});
 eq((await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:vnd.items[0].id}})).originalAmount.toFixed(),'1000000');eq(await prisma.cashEntry.count(),0);
 console.log('PASS: '+checks+' DGC API assertions for profile/version/permissions, separate assets, draft/PDF/workbook, monthly sequence, stale source, rollback, issue/AR and USD/VND with no cash posting.');
}finally{await app.close();await prisma.$disconnect();}
