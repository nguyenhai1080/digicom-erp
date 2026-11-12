import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import nodemailer from 'nodemailer';
import {prisma} from '@erp/db';
import {invoiceEmailRoutes} from '../dist/modules/projects/invoice-email.js';
import {persistPdf,sha} from '../dist/modules/projects/financial-documents.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {CommandError} from '../dist/modules/projects/commands.js';
const testDb=new URL(process.env.DATABASE_URL);if(!['127.0.0.1','localhost'].includes(testDb.hostname)||!/^\/erp_execution_acceptance_dgc_email(?:_[a-z0-9_]+)?$/.test(testDb.pathname))throw Error('Use a fresh localhost-only disposable email acceptance DB');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const company=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}}),companyId=company.id,tag=randomUUID();
process.env.STORAGE_ROOT=await mkdtemp(resolve(tmpdir(),'dgc-email-synthetic-'));
const user=await prisma.user.create({data:{companyId,email:tag+'@example.test',fullName:'Synthetic email actor',passwordHash:'unused'}}),role=await prisma.role.findUniqueOrThrow({where:{companyId_code:{companyId,code:'ADMIN'}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const identity={companyId,userId:user.id,companyCode:'DGC',fullName:user.fullName,email:user.email,permissions:[]},origin='https://email.example.test',raw=randomBytes(32).toString('hex'),config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:true,bootstrapEnabled:false,bootstrapToken:'',defaultCompanyCode:'DGC'};
await prisma.authSession.create({data:{companyId,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});
const partner=await prisma.partner.create({data:{companyId,partnerCode:tag,partnerKey:tag,legalName:'Synthetic partner',partnerType:'CUSTOMER',invoiceEmail:'partner@example.test'}}),service=await prisma.service.create({data:{companyId,serviceKey:tag,serviceCode:tag,serviceName:'Synthetic service',category:'OTHER'}}),contract=await prisma.contract.create({data:{companyId,partnerId:partner.id,contractCode:tag,contractName:'Synthetic',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',currency:'USD'}});
const start=new Date('2026-10-01'),end=new Date('2026-10-31');
const doc=await prisma.$transaction(tx=>persistPdf(tx,identity,'OutputReconUpload',randomUUID(),'RECON_SIGNED','synthetic.pdf',Buffer.from('%PDF-1.4\nSynthetic signed recon only'),1,[]));
const upload=await prisma.outputReconUpload.create({data:{companyId,partnerId:partner.id,serviceId:service.id,uploadCode:tag,period:'2026-10',businessKey:tag,attachmentId:doc.attachmentId,createdById:user.id,status:'APPROVED'}});
await prisma.document.update({where:{id:doc.id},data:{entityId:upload.id}});
const recon=await prisma.reconciliation.create({data:{companyId,partnerId:partner.id,contractId:contract.id,reconCode:tag,logicalGroupId:randomUUID(),periodStart:start,periodEnd:end,currency:'USD',sourceType:'FILE_UPLOAD',status:'APPROVED',approvedSnapshot:{uploadId:upload.id}}});
await prisma.outputReconUpload.update({where:{id:upload.id},data:{extractionData:{finalization:{reconciliationId:recon.id,documentId:doc.id}}}});
const ri=await prisma.reconciliationItem.create({data:{companyId,reconciliationId:recon.id,serviceId:service.id,lineNo:1,businessScopeKey:tag,periodStart:start,periodEnd:end,grossRevenue:'100',netRevenue:'90'}}),revenue=await prisma.revenue.create({data:{companyId,revenueCode:tag,logicalGroupId:randomUUID(),reconciliationId:recon.id,reconciliationItemId:ri.id,partnerId:partner.id,contractId:contract.id,serviceId:service.id,businessScopeKey:tag,periodStart:start,periodEnd:end,currency:'USD',grossAmount:'100',partnerShareAmount:'0',companyShareAmount:'100',netAmount:'90',status:'INVOICE_READY',calculationJson:{uploadId:upload.id}}});
async function invoice(rv=revenue){const id=randomUUID(),d=await prisma.$transaction(tx=>persistPdf(tx,identity,'Invoice',id,'INVOICE','synthetic.pdf',Buffer.from('%PDF-1.4\nSynthetic invoice '+id),1,[]));const i=await prisma.invoice.create({data:{id,companyId,invoiceNumber:'SYN-'+id,businessKey:id,partnerId:partner.id,period:'2026-10',invoiceMode:'PER_SERVICE',invoiceDate:new Date('2026-11-11'),dueDate:new Date('2026-12-26'),revenueAmount:'100',whtAmount:'10',payableAmount:'90',snapshot:{fileServices:['Synthetic service']},documentId:d.id,createdById:user.id}});const s=await prisma.invoiceScope.create({data:{companyId,invoiceId:id,scopeCode:id,logicalGroupId:randomUUID(),partnerId:partner.id,contractId:contract.id,periodStart:start,periodEnd:end,invoiceMode:'PER_SERVICE',currency:'USD',scopeKey:id,totalAmount:'90',status:'INVOICE_READY'}});await prisma.invoiceScopeItem.create({data:{companyId,scopeId:s.id,revenueId:rv.id,lineNo:1,amount:'90'}});return {i,d};}
const {id:rid,createdAt,updatedAt,...copy}=revenue;const ri2=await prisma.reconciliationItem.create({data:{companyId,reconciliationId:recon.id,serviceId:service.id,lineNo:2,businessScopeKey:tag+'2',periodStart:start,periodEnd:end,grossRevenue:'100',netRevenue:'90'}});const revenue2=await prisma.revenue.create({data:{...copy,revenueCode:tag+'2',logicalGroupId:randomUUID(),reconciliationItemId:ri2.id,businessScopeKey:tag+'2'}});
const a=await invoice(),b=await invoice(revenue2);let sent=[],mode='accepted',mime;
const app=Fastify();await app.register(cookie);app.decorateRequest('auth',null);app.setErrorHandler((e,_req,reply)=>reply.code(e instanceof CommandError?e.statusCode:500).send({message:e.message}));
await app.register(invoiceEmailRoutes,{...config,emailTransport:async mail=>{sent.push(mail);if(mode==='unknown')throw Error('Synthetic timeout with private credentials NEVER returned');if(mode==='slow')await new Promise(r=>setTimeout(r,100));mime=await nodemailer.createTransport({streamTransport:true,buffer:true}).sendMail({...mail,from:'info@digicomjsc.com'});return mode==='rejected'?{accepted:[],rejected:[...mail.to,...mail.cc]}:mode==='partial'?{accepted:mail.to,rejected:mail.cc}:{accepted:[...mail.to,...mail.cc],rejected:[]};}});
const headers={origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret)},post=(path,payload,extra={})=>app.inject({method:'POST',url:'/api/v1/invoice-email/'+path,payload,headers:{...headers,...extra}}),ids=[a.i.id,b.i.id],body={invoiceIds:ids,to:['recipient@example.test'],cc:['accountant@example.test'],subject:'Synthetic email fixture',text:'Synthetic message only'};
const finance=async()=>JSON.stringify({invoices:await prisma.invoice.findMany({where:{id:{in:ids}}}),revenue:await prisma.revenue.findUnique({where:{id:revenue.id}}),ar:await prisma.accountReceivable.count(),cash:await prisma.cashEntry.count(),documents:await prisma.document.count()});
const before=await finance();
try{
 eq((await post('prepare',{invoiceIds:ids},{cookie:''})).statusCode,401);
 eq((await post('prepare',{invoiceIds:ids},{origin:'https://wrong.example.test'})).statusCode,403);
 eq((await post('prepare',{invoiceIds:ids},{'x-csrf-token':'bad'})).statusCode,403);
 eq((await post('prepare',{invoiceIds:ids,companyId:randomUUID()})).statusCode,400);
 eq((await post('prepare',{invoiceIds:[randomUUID()]})).statusCode,404);
 const prepared=await post('prepare',{invoiceIds:ids});eq(prepared.statusCode,200);const p=prepared.json();eq(p.files.length,3);eq(p.files.filter(f=>f.kind==='Đối soát đã chốt').length,1);eq(p.from,'info@digicomjsc.com');eq(p.warnings.length,2);eq(p.availableInvoices.length,2);eq(p.recipients.some(r=>r.email==='partner@example.test'),true);eq('content' in p.files[0],false);eq('host' in p,false);eq(p.configured,false);
 const preview=await post('preview',body);eq(preview.statusCode,200);const digest=preview.json().digest,sendBody={...body,requestId:p.requestId,digest,confirmed:true};
 eq((await post('send',sendBody)).statusCode,409);eq(sent.length,0);
 process.env.DGC_SMTP_HOST='synthetic.example.invalid';process.env.DGC_SMTP_USER='synthetic';process.env.DGC_SMTP_PASSWORD='synthetic-never-connect';
 eq((await post('preview',{...body,to:['recipient@example.test\r\nBcc: thief@example.test']})).statusCode,400);
 eq((await post('preview',{...body,cc:['RECIPIENT@example.test']})).statusCode,400);
 eq((await post('preview',{...body,subject:'Subject\r\nBcc:thief@example.test'})).statusCode,400);
 eq((await post('send',{...sendBody,confirmed:false})).statusCode,400);
 eq((await post('send',{...sendBody,text:'Tampered text'})).statusCode,409);eq(sent.length,0);
 const fresh=async label=>{const next={...body,subject:body.subject+' '+label};const p=await post('preview',next);eq(p.statusCode,200);return {...next,requestId:randomUUID(),digest:p.json().digest,confirmed:true};};
 const accepted=await post('send',sendBody);eq(accepted.statusCode,200);eq(accepted.json().status,'ACCEPTED');eq(sent.length,1);eq(sent[0].attachments.length,3);eq(sent[0].attachments[0].content.toString().startsWith('%PDF'),true);eq(mime.message.toString().includes('Content-Type: application/pdf'),true);eq(mime.message.toString().match(/Content-Disposition: attachment/g).length,3);
 eq((await post('send',sendBody)).statusCode,409);eq(sent.length,1);
 const history=await app.inject({url:'/api/v1/invoice-email/history/'+a.i.id,headers});eq(history.statusCode,200);eq(history.json().items.length,2);eq(history.json().items.some(v=>v.action==='INVOICE_EMAIL_ACCEPTED'),true);
 eq((await post('send',{...sendBody,requestId:randomUUID()})).statusCode,409);eq(sent.length,1);
 mode='partial';const partial=await post('send',await fresh('partial'));eq(partial.json().status,'PARTIAL');eq(partial.json().rejected,['accountant@example.test']);
 mode='unknown';const unknownPayload=await fresh('unknown'),unknownId=unknownPayload.requestId,unknown=await post('send',unknownPayload);eq(unknown.json().status,'UNKNOWN');eq(unknown.body.includes('credentials'),false);eq((await post('send',unknownPayload)).statusCode,409);
 mode='slow';const concurrentPayload=await fresh('concurrent'),both=await Promise.all([post('send',concurrentPayload),post('send',concurrentPayload)]);eq(both.map(v=>v.statusCode).sort(),[200,409]);eq(sent.length,4);
 mode='rejected';const rejected=await post('send',await fresh('rejected'));eq(rejected.json().status,'REJECTED');eq((await post('send',await fresh('rate limit'))).statusCode,429);
 await prisma.document.update({where:{id:doc.id},data:{status:'SUPERSEDED'}});eq((await post('preview',body)).statusCode,409);await prisma.document.update({where:{id:doc.id},data:{status:'ACTIVE'}});
 const attachment=await prisma.attachment.findUniqueOrThrow({where:{id:doc.attachmentId}}),path=resolve(process.env.STORAGE_ROOT,attachment.storagePath),original=await readFile(path);await writeFile(path,Buffer.alloc(original.length,42));eq((await post('preview',body)).statusCode,409);await writeFile(path,original);
 await prisma.invoice.update({where:{id:b.i.id},data:{period:'2026-09'}});eq((await post('preview',body)).statusCode,409);await prisma.invoice.update({where:{id:b.i.id},data:{period:'2026-10'}});
 await prisma.invoice.update({where:{id:b.i.id},data:{isCurrent:false}});eq((await post('preview',body)).statusCode,409);await prisma.invoice.update({where:{id:b.i.id},data:{isCurrent:true}});
 const foreign=await prisma.company.create({data:{companyCode:'SYN-'+tag,companyName:'Other synthetic tenant'}});await prisma.invoice.update({where:{id:b.i.id},data:{companyId:foreign.id}});eq((await post('preview',body)).statusCode,404);await prisma.invoice.update({where:{id:b.i.id},data:{companyId}});
 const size=attachment.fileSize;await prisma.attachment.update({where:{id:attachment.id},data:{fileSize:BigInt(19*1024*1024)}});eq((await post('preview',body)).statusCode,409);await prisma.attachment.update({where:{id:attachment.id},data:{fileSize:size}});
 const limited=await prisma.role.create({data:{companyId,code:'SYN-'+tag,name:'Synthetic limited'}});for(const code of ['INVOICE_VIEW','INVOICE_ISSUE']){const p=await prisma.permission.findUniqueOrThrow({where:{code}});await prisma.rolePermission.create({data:{roleId:limited.id,permissionId:p.id}});}await prisma.userRole.deleteMany({where:{userId:user.id}});await prisma.userRole.create({data:{userId:user.id,roleId:limited.id}});eq((await post('prepare',{invoiceIds:ids})).statusCode,403);await prisma.userRole.deleteMany({where:{userId:user.id}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
 // Exactly the finance fields remain unchanged; updatedAt changed above only by the deliberate fixture status tests.
 const after=JSON.parse(await finance()),orig=JSON.parse(before);for(const i of [...after.invoices,...orig.invoices])delete i.updatedAt;eq(after,orig);
 eq(await prisma.auditLog.count({where:{companyId,entityType:'InvoiceEmail',action:'INVOICE_EMAIL_ATTEMPT',newValue:{path:['invoiceIds'],array_contains:[a.i.id]}}}),5);
// Regression: captured originals and approved signed copies coexist. Email must
// use only the latter, through source row/link metadata, never a filename guess.
const snapshotHash='1'.repeat(64),appendixHash='2'.repeat(64),rowHash='3'.repeat(64),packageHash='4'.repeat(64),sourceSpreadsheetId='synthetic-source',source={sheetId:43,sourceRow:2,rowHash,legacyId:'RPD-SYN',snapshotHash};
for(const hash of [snapshotHash,appendixHash])await prisma.dgcImportSnapshot.create({data:{companyId,snapshotHash:hash,sourceSpreadsheetId,sourceMetadata:{synthetic:true},rowCount:2}});
await prisma.auditLog.create({data:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER',entityType:'Configuration',newValue:{sourceSnapshotHash:snapshotHash,sourceAppendixHash:appendixHash}}});
await prisma.dgcImportRow.create({data:{companyId,snapshotHash,sheetId:43,sourceRow:2,rowHash,legacyId:'RPD-SYN',sheetName:'43_RECON_PDF_HEADER',payload:{values:{Recon_Doc_ID:'RPD-SYN',Partner_ID:'PARTNER-SYN',Period_Month:46296}}}});
await prisma.dgcImportRow.create({data:{companyId,snapshotHash,sheetId:20,sourceRow:2,rowHash:'5'.repeat(64),legacyId:'PARTNER-SYN',sheetName:'20_PARTNERS',payload:{values:{}}}});
await prisma.dgcImportLink.create({data:{companyId,snapshotHash,sourceSpreadsheetId,sheetId:20,sourceRow:2,rowHash:'5'.repeat(64),legacyId:'PARTNER-SYN',targetModel:'partner',targetId:partner.id,targetHash:'6'.repeat(64)}});
const packageValues={Approval_ID:'APP-SYN',Partner_ID:'PARTNER-SYN',Period:46296,Approval_Status:'Approved',Related_Recon_Doc_IDs:'RPD-SYN',Related_Invoice_IDs:null,Related_Revenue_IDs:'REV-SYN',File_ID:'synthetic-signed-file'};
const packageRow={companyId,snapshotHash:appendixHash,sheetId:55,sourceRow:2,rowHash:packageHash,legacyId:'APP-SYN',sheetName:'55_APPROVAL_PACKAGE',payload:{values:packageValues}};
await prisma.dgcImportRow.create({data:packageRow});
async function historyDoc(code,bytes,type){const aid=randomUUID(),storagePath=`dgc-history/${companyId}/${aid}.pdf`;await mkdir(resolve(process.env.STORAGE_ROOT,'dgc-history',companyId),{recursive:true});await writeFile(resolve(process.env.STORAGE_ROOT,storagePath),bytes);const att=await prisma.attachment.create({data:{id:aid,companyId,originalFilename:'do-not-infer-signed-from-name.pdf',storedFilename:aid+'.pdf',storageProvider:'local',storagePath,mimeType:'application/pdf',fileSize:BigInt(bytes.length),checksumSha256:sha(bytes)}});return prisma.document.create({data:{companyId,documentCode:code,documentType:type,entityType:type==='DGC_SOURCE_RECON'?type:'DGC_SOURCE_REFERENCE',entityId:randomUUID(),attachmentId:att.id}});}
const originalBytes=Buffer.from('%PDF-1.4 Synthetic ORIGINAL UNSIGNED'),signedBytes=Buffer.from('%PDF-1.4 Synthetic SAVED SIGNED COMPOSITE'),originalDoc=await historyDoc(tag+'-original',originalBytes,'DGC_SOURCE_RECON'),signedDoc=await historyDoc(tag+'-signed',signedBytes,'APPROVAL_PACKAGE');
await prisma.dgcImportLink.create({data:{companyId,snapshotHash,sourceSpreadsheetId,...source,targetModel:'document',targetId:originalDoc.id,targetHash:'7'.repeat(64)}});
await prisma.dgcImportLink.create({data:{companyId,snapshotHash:appendixHash,sourceSpreadsheetId,sheetId:55,sourceRow:2,rowHash:packageHash,legacyId:'APP-SYN',targetModel:'document',targetId:signedDoc.id,targetHash:'8'.repeat(64)}});
const originalCalcs=[revenue.calculationJson,revenue2.calculationJson];for(const rv of [revenue,revenue2])await prisma.revenue.update({where:{id:rv.id},data:{calculationJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',source:{legacyId:'REV-SYN'}}}});
await prisma.reconciliation.update({where:{id:recon.id},data:{ocrRawJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:'9'.repeat(64),documentSource:source}}});
// Old approved copy refers to the previous revenue revision; it must not win.
await prisma.dgcImportRow.create({data:{...packageRow,sourceRow:4,legacyId:'APP-OLD',payload:{values:{...packageValues,Related_Revenue_IDs:'REV-OLD'}}}});
const capBefore=await finance();
const cap=await post('prepare',{invoiceIds:ids});eq(cap.statusCode,200);const capData=cap.json();eq(capData.files.length,3);const sf=capData.files.find(f=>f.kind==='Đối soát đã ký');eq(sf.id,signedDoc.id);eq(sf.checksum,sha(signedBytes));eq(capData.files.some(f=>f.id===originalDoc.id),false);eq(sf.filename.includes('APP-SYN'),true);
const downloaded=await app.inject({url:sf.downloadUrl,headers});eq(downloaded.statusCode,200);eq(downloaded.rawPayload.equals(signedBytes),true);eq(downloaded.rawPayload.equals(originalBytes),false);eq(downloaded.headers['cache-control'],'no-store');
eq((await app.inject({url:sf.downloadUrl,headers:{...headers,cookie:''}})).statusCode,401);
eq((await app.inject({url:'/api/v1/invoice-email/recon/'+randomUUID()+'/signed-pdf?invoiceIds='+ids.join(','),headers})).statusCode,404);
const previewCap=await post('preview',body);eq(previewCap.statusCode,200);
// No original PDF is acceptable as a fallback when the signed source is absent.
await prisma.document.update({where:{id:signedDoc.id},data:{status:'SUPERSEDED'}});let blocked=await post('prepare',{invoiceIds:ids});eq(blocked.statusCode,409);eq(blocked.body.includes('không còn hiệu lực'),true);await prisma.document.update({where:{id:signedDoc.id},data:{status:'ACTIVE'}});
const whereRow={companyId_snapshotHash_sheetId_sourceRow:{companyId,snapshotHash:appendixHash,sheetId:55,sourceRow:2}};
async function values(changes){await prisma.dgcImportRow.update({where:whereRow,data:{payload:{values:{...packageValues,...changes}}}});}
for(const delta of [{Approval_Status:'Draft'},{Period:46266},{Partner_ID:'OTHER'},{Related_Recon_Doc_IDs:'RPD-OTHER'},{File_ID:null},{Related_Recon_Doc_IDs:'RPD-SYN,RPD-OTHER'},{Related_Invoice_IDs:'INV-UNSELECTED'},{Related_Revenue_IDs:'REV-OLD'},{Related_Revenue_IDs:'REV-SYN,REV-OLD'}]){await values(delta);eq((await post('prepare',{invoiceIds:ids})).statusCode,409);}await values({});
await prisma.dgcImportRow.create({data:{...packageRow,sourceRow:3,legacyId:'APP-AMBIGUOUS'}});eq((await post('prepare',{invoiceIds:ids})).statusCode,409);await prisma.dgcImportRow.delete({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId,snapshotHash:appendixHash,sheetId:55,sourceRow:3}}});
const signedAtt=await prisma.attachment.findUniqueOrThrow({where:{id:signedDoc.attachmentId}}),signedPath=resolve(process.env.STORAGE_ROOT,signedAtt.storagePath);await writeFile(signedPath,Buffer.alloc(signedBytes.length,63));eq((await post('prepare',{invoiceIds:ids})).statusCode,409);await writeFile(signedPath,signedBytes);
// A package may not be repointed to a foreign tenant's attachment.
await prisma.document.update({where:{id:signedDoc.id},data:{companyId:foreign.id}});eq((await post('prepare',{invoiceIds:ids})).statusCode,409);await prisma.document.update({where:{id:signedDoc.id},data:{companyId}});
eq(await finance(),capBefore);

 console.log('PASS: '+checks+' Invoice email assertions; synthetic transport only, no real email or ledger writes.');
}finally{await app.close();await prisma.$disconnect();}
