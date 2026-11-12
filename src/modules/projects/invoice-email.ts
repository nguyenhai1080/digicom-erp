import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {Prisma,prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {checkedFile,sha} from './financial-documents.js';
import {capturedSignedReconDocument} from './captured-recon-signed.js';
import {financialFilename,invoiceServices} from './document-filename.js';
import {deliverInvoiceMail,emailAddress,mailConfiguration,type InvoiceMail,type MailResult} from './invoice-mail-transport.js';

const selection=z.object({invoiceIds:z.array(z.uuid()).min(1).max(50)}).strict();
const compose=selection.extend({to:z.array(emailAddress).min(1).max(20),cc:z.array(emailAddress).max(20),subject:z.string().trim().min(1).max(200).refine(v=>!/[\r\n]/.test(v)),text:z.string().trim().min(1).max(10000)}).strict().refine(v=>new Set([...v.to,...v.cc].map(a=>a.toLowerCase())).size===v.to.length+v.cc.length,'Duplicate recipients');
const send=compose.safeExtend({requestId:z.uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict();
const MAX_BYTES=18*1024*1024;
function access(user:Identity){if(user.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy chức năng.');for(const permission of ['INVOICE_VIEW','RECON_VIEW','INVOICE_ISSUE'])if(!user.permissions.includes(permission))throw new CommandError(403,'Cần quyền xem Invoice, xem đối soát và phát hành Invoice để gửi chứng từ.');}
const requireStatus=(v:boolean,message:string)=>{if(!v)throw new CommandError(409,message);};
export async function invoiceEmailPackage(tx:Prisma.TransactionClient,companyId:string,invoiceIds:string[]){
 const ids=[...new Set(invoiceIds)].sort();
 const invoices=await tx.invoice.findMany({where:{companyId,id:{in:ids}},include:{partner:true,document:{include:{attachment:true}},scopes:{orderBy:{id:'asc'},include:{items:{orderBy:{lineNo:'asc'},include:{revenue:{include:{reconciliation:true}}}}}}},orderBy:{id:'asc'}});
 if(invoices.length!==ids.length)throw new CommandError(404,'Không tìm thấy đủ Invoice của công ty.');
 const first=invoices[0];
 requireStatus(invoices.every(i=>i.isCurrent&&['DRAFT','ISSUED','OVERDUE','PARTIALLY_PAID','PAID'].includes(i.status)&&i.partnerId===first.partnerId&&i.period===first.period&&i.partner.companyId===companyId),'Chỉ gửi các Invoice đang hiệu lực của cùng đối tác và kỳ.');
 const selectedReconIds=[...new Set(invoices.flatMap(i=>i.scopes.filter(s=>s.isCurrent).flatMap(s=>s.items.filter(v=>v.isCurrent).map(v=>String((v.revenue.reconciliation.ocrRawJson as any)?.documentSource?.legacyId??'').toUpperCase()))).filter(Boolean))];
 const capturedReconIds=[...new Set(invoices.flatMap(i=>i.scopes.filter(s=>s.isCurrent).flatMap(s=>s.items.filter(v=>v.isCurrent&&(v.revenue.calculationJson as any)?.sourceKind==='DGC_CAPTURED_BOOK_V1').map(v=>v.revenue.reconciliationId))))];
 const capturedSources=capturedReconIds.length?await tx.revenue.findMany({where:{companyId,partnerId:first.partnerId,isCurrent:true,reconciliationId:{in:capturedReconIds},calculationJson:{path:['sourceKind'],equals:'DGC_CAPTURED_BOOK_V1'}},select:{reconciliationId:true,calculationJson:true},take:5001}):[];
 requireStatus(capturedSources.length<=5000,'Nguồn đối soát vượt giới hạn tra cứu bản ký.');
 const sourceLegacy=(r:{calculationJson:unknown})=>String((r.calculationJson as any)?.source?.legacyId??'').toUpperCase();
 const selectedRevenueIds=[...new Set(capturedSources.map(sourceLegacy).filter(Boolean))];
 const selectedInvoiceIds=invoices.map(i=>String((i.snapshot as any)?.source?.legacyId??'').toUpperCase()).filter(Boolean);
 const files=new Map<string,{id:string;filename:string;kind:string;checksum:string;size:number;downloadUrl:string;content:Buffer}>(),warnings:string[]=[];
 async function add(d:typeof first.document,filename:string,kind:string,expected:string,downloadUrl:string){
  if(files.has(d.id))return;
  requireStatus(d.companyId===companyId&&d.attachment.companyId===companyId&&d.status==='ACTIVE'&&d.attachment.mimeType==='application/pdf','PDF không còn hiệu lực hoặc sai công ty.');
  const size=Number(d.attachment.fileSize);requireStatus(Number.isSafeInteger(size)&&size>0&&size+[...files.values()].reduce((s,f)=>s+f.size,0)<=MAX_BYTES,'Gói email vượt 18 MB. Chọn ít Invoice hơn để gửi.');
  const bytes=await checkedFile(d.attachment,expected,MAX_BYTES);
  files.set(d.id,{id:d.id,filename,kind,checksum:sha(bytes),size:bytes.length,downloadUrl,content:bytes});
 }
 for(const i of invoices){
  requireStatus(i.document.documentType==='INVOICE'&&i.document.entityType==='Invoice'&&i.document.entityId===i.id,'PDF Invoice không khớp hồ sơ.');
  await add(i.document,financialFilename('Invoice',invoiceServices(i.snapshot),i.period,i.invoiceNumber,i.revisionNo),'Invoice',`invoices/${companyId}/${i.document.attachment.id}.pdf`,`/api/v1/invoices/${i.id}/download`);
  if(i.status==='DRAFT')warnings.push(i.invoiceNumber+' là Invoice nháp, chưa phát hành.');
  const scopes=i.scopes.filter(s=>s.isCurrent);requireStatus(scopes.length>0,'Invoice chưa có liên kết nguồn đối soát để gom chứng từ.');
  for(const s of scopes){
   requireStatus(s.companyId===companyId&&s.partnerId===i.partnerId,'Phạm vi Invoice không khớp.');
   requireStatus(s.items.some(v=>v.isCurrent),'Phạm vi Invoice không có nguồn đang hiệu lực.');
   for(const item of s.items.filter(v=>v.isCurrent)){
    const r=item.revenue,recon=r.reconciliation,j=r.calculationJson as any;
    requireStatus(item.companyId===companyId&&r.companyId===companyId&&recon.companyId===companyId&&r.partnerId===i.partnerId&&recon.partnerId===i.partnerId&&r.periodStart.toISOString().slice(0,7)===i.period&&recon.periodStart.toISOString().slice(0,7)===i.period&&recon.status==='APPROVED'&&recon.isCurrent&&r.isCurrent,'Nguồn đối soát đã đổi phạm vi hoặc không còn hiệu lực.');
    if(j?.sourceKind==='MANUAL_PERIOD'){warnings.push(recon.reconCode+': doanh thu nhập tay, không có PDF đối soát.');continue;}
    if(j?.sourceKind==='DGC_CAPTURED_BOOK_V1'){
     const signed=await capturedSignedReconDocument(tx,companyId,{id:recon.id,partnerId:i.partnerId,period:i.period,raw:recon.ocrRawJson,selectedReconIds,selectedInvoiceIds,selectedRevenueIds,revenueIds:capturedSources.filter(v=>v.reconciliationId===recon.id).map(sourceLegacy)}),d=signed.document;
     await add(d,`Doi-soat-da-ky-${signed.source}-${i.period}.pdf`,'Đối soát đã ký',`dgc-history/${companyId}/${d.attachment.id}.pdf`,`/api/v1/invoice-email/recon/${recon.id}/signed-pdf?invoiceIds=${ids.join(',')}`);continue;
    }
    const u=typeof j?.uploadId==='string'?await tx.outputReconUpload.findFirst({where:{id:j.uploadId,companyId,partnerId:i.partnerId,period:i.period,status:'APPROVED'}}):null,f=(u?.extractionData as any)?.finalization;
    requireStatus(!!u&&f?.reconciliationId===recon.id&&!!f?.documentId&&(recon.approvedSnapshot as any)?.uploadId===u?.id,'Chưa tìm thấy PDF đối soát đã chốt đúng nguồn Invoice.');
    const d=await tx.document.findFirst({where:{id:f.documentId,companyId,documentType:'RECON_SIGNED',entityType:'OutputReconUpload',entityId:u!.id,status:'ACTIVE'},include:{attachment:true}});
    requireStatus(!!d,'PDF đối soát đã chốt không còn hiệu lực.');
    await add(d!,`Doi-soat-${u!.uploadCode}-${i.period}.pdf`,'Đối soát đã chốt',`signed-recon/${companyId}/${d!.attachment.id}.pdf`,`/api/v1/output-recon/uploads/${u!.id}/signed-download`);
   }
  }
 }
 const contacts=await tx.partnerContact.findMany({where:{companyId,partnerId:first.partnerId,status:'ACTIVE'},select:{fullName:true,email:true},take:100}),staff=await tx.user.findMany({where:{companyId,status:'ACTIVE'},select:{fullName:true,email:true},take:200});
 const recipients=[...staff.map(s=>({...s,group:'Nội bộ'})),...contacts.map(c=>({...c,group:'Đối tác'})),{fullName:first.partner.legalName,email:first.partner.invoiceEmail??first.partner.email,group:'Đối tác'}].filter(v=>emailAddress.safeParse(v.email).success);
 const metadata={invoiceIds:ids,partner:first.partner.legalName,partnerId:first.partnerId,period:first.period,invoices:invoices.map(i=>({id:i.id,number:i.invoiceNumber,status:i.status,updatedAt:i.updatedAt.toISOString(),documentId:i.documentId})),files:[...files.values()].map(({content,...f})=>f),warnings:[...new Set(warnings)]};
 return {metadata,files:[...files.values()],recipients};
}
function digest(p:Awaited<ReturnType<typeof invoiceEmailPackage>>,body:z.infer<typeof compose>){return sha(JSON.stringify({metadata:p.metadata,body:{...body,invoiceIds:[...new Set(body.invoiceIds)].sort()},from:mailConfiguration().from}));}
export async function invoiceEmailRoutes(app:FastifyInstance,config:AuthConfig & {emailTransport?:(mail:InvoiceMail)=>Promise<MailResult>}){
 app.get('/api/v1/invoice-email/recon/:id/signed-pdf',{preHandler:requirePermission('INVOICE_ISSUE')},async(request,reply)=>{
  const user=request.auth!;access(user);const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),q=parse(z.object({invoiceIds:z.string().max(2000).transform(v=>v.split(',')).pipe(z.array(z.uuid()).min(1).max(50))}).strict(),request.query);
  const p=await prisma.$transaction(tx=>invoiceEmailPackage(tx,user.companyId,q.invoiceIds),{isolationLevel:'RepeatableRead',timeout:20000});
  const suffix=`/api/v1/invoice-email/recon/${id}/signed-pdf?`,file=p.files.find(f=>f.downloadUrl.startsWith(suffix));if(!file)throw new CommandError(404,'Không tìm thấy bản đối soát đã ký trong lựa chọn.');
  return reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`inline; filename="${file.filename}"`).type('application/pdf').send(file.content);
 });
 app.post('/api/v1/invoice-email/prepare',{onRequest:writeGuard('INVOICE_ISSUE',config)},async request=>{
  const user=request.auth!;access(user);const b=parse(selection,request.body),p=await prisma.$transaction(tx=>invoiceEmailPackage(tx,user.companyId,b.invoiceIds),{isolationLevel:'RepeatableRead',timeout:20000});
  const availableInvoices=await prisma.invoice.findMany({where:{companyId:user.companyId,partnerId:p.metadata.partnerId,period:p.metadata.period,isCurrent:true,status:{in:['DRAFT','ISSUED','OVERDUE','PARTIALLY_PAID','PAID']}},select:{id:true,invoiceNumber:true,status:true},orderBy:{invoiceNumber:'asc'},take:100});
  const c=mailConfiguration();return {availableInvoices:availableInvoices.map(i=>({id:i.id,number:i.invoiceNumber,status:i.status})),...p.metadata,recipients:p.recipients,from:c.from,configured:c.configured,to:[],cc:[],subject:`Digicom - Invoice và đối soát kỳ ${p.metadata.period} - ${p.metadata.partner}`,text:`Kính gửi Quý đối tác / Anh chị,\n\nDigicom gửi kèm Invoice và các đối soát đã chốt của kỳ ${p.metadata.period}.\nVui lòng kiểm tra các tệp đính kèm.\n\nTrân trọng,\nDigicom`,requestId:randomUUID()};
 });
 app.post('/api/v1/invoice-email/preview',{onRequest:writeGuard('INVOICE_ISSUE',config)},async request=>{
  access(request.auth!);const b=parse(compose,request.body),p=await prisma.$transaction(tx=>invoiceEmailPackage(tx,request.auth!.companyId,b.invoiceIds),{isolationLevel:'RepeatableRead',timeout:20000});return {...p.metadata,digest:digest(p,b)};
 });
 app.post('/api/v1/invoice-email/send',{onRequest:writeGuard('INVOICE_ISSUE',config)},async request=>{
  const user=request.auth!;access(user);const {requestId,digest:expected,confirmed,...b}=parse(send,request.body);
  if(!mailConfiguration().configured)throw new CommandError(409,'Chưa cấu hình máy chủ gửi thư. Chưa có email nào được gửi.');
  const p=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+'|INVOICE_EMAIL'},0))`;
   const old=await tx.auditLog.findFirst({where:{companyId:user.companyId,entityType:'InvoiceEmail',entityId:requestId,action:'INVOICE_EMAIL_ATTEMPT'}});
   if(old)throw new CommandError(409,'Lần gửi này đã được tiếp nhận. Kiểm tra lịch sử gửi; không tự gửi lại khi chưa rõ kết quả.');
   const duplicate=await tx.auditLog.findFirst({where:{companyId:user.companyId,entityType:'InvoiceEmail',action:'INVOICE_EMAIL_ATTEMPT',createdAt:{gt:new Date(Date.now()-5*60000)},newValue:{path:['digest'],equals:expected}}});
   if(duplicate)throw new CommandError(409,'Email có cùng nội dung và chứng từ đã được tiếp nhận gần đây. Kiểm tra lịch sử trước khi gửi lại.');
   const pending=await tx.auditLog.count({where:{companyId:user.companyId,entityType:'InvoiceEmail',action:'INVOICE_EMAIL_ATTEMPT',createdAt:{gt:new Date(Date.now()-60000)}}});
   if(pending>=5)throw new CommandError(429,'Vui lòng chờ trước khi gửi thêm email.');
   const p=await invoiceEmailPackage(tx,user.companyId,b.invoiceIds);if(digest(p,b)!==expected)throw new CommandError(409,'Chứng từ hoặc nội dung đã thay đổi. Xem lại email trước khi gửi.');
   await audit(tx,user,'INVOICE_EMAIL_ATTEMPT','InvoiceEmail',requestId,null,{...p.metadata,to:b.to,cc:b.cc,subject:b.subject,text:b.text,from:mailConfiguration().from,digest:expected});return p;
  },{timeout:25000});
  const messageId=`<${requestId}@${mailConfiguration().from.split('@')[1]}>`;
  let result:MailResult;
  try{result=await (config.emailTransport??deliverInvoiceMail)({...b,messageId,attachments:p.files.map(f=>({filename:f.filename,content:f.content,contentType:'application/pdf'}))});}
  catch{
   await prisma.$transaction(tx=>audit(tx,user,'INVOICE_EMAIL_UNKNOWN','InvoiceEmail',requestId,null,{invoiceIds:p.metadata.invoiceIds,messageId,status:'UNKNOWN'}));
   return {status:'UNKNOWN',message:'Chưa xác nhận được kết quả gửi. Kiểm tra hộp thư hoặc liên hệ quản trị viên trước khi gửi lại.',requestId};
  }
  const status=result.accepted.length?(result.rejected.length?'PARTIAL':'ACCEPTED'):'REJECTED';
  await prisma.$transaction(tx=>audit(tx,user,'INVOICE_EMAIL_'+status,'InvoiceEmail',requestId,null,{invoiceIds:p.metadata.invoiceIds,messageId,...result,status}));
  return {status,...result,requestId,message:status==='ACCEPTED'?'Máy chủ thư đã nhận email cho tất cả người nhận; chưa xác nhận thư đã đến hộp thư.':status==='PARTIAL'?'Máy chủ thư chỉ nhận một phần người nhận. Kiểm tra kết quả, không gửi lại cho toàn bộ danh sách.':'Máy chủ thư không nhận email cho người nhận nào.'};
 });
 app.get('/api/v1/invoice-email/history/:id',{preHandler:requirePermission('INVOICE_ISSUE')},async request=>{
  const user=request.auth!;access(user);const {id}=parse(z.object({id:z.uuid()}).strict(),request.params);
  if(!await prisma.invoice.findFirst({where:{companyId:user.companyId,id}}))throw new CommandError(404,'Không tìm thấy Invoice.');
  return {items:await prisma.auditLog.findMany({where:{companyId:user.companyId,entityType:'InvoiceEmail',newValue:{path:['invoiceIds'],array_contains:[id]}},select:{entityId:true,action:true,newValue:true,createdAt:true},orderBy:{createdAt:'desc'},take:30})};
 });
}
