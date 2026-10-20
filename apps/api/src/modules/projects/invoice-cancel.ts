import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import type {AuthConfig} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {financialPeriodLock} from './recon-finalize.js';
import {derivedBytes,sha} from './financial-documents.js';

function fail(message:string):never{throw new CommandError(409,message);}
const ids=z.object({id:z.uuid()}).strict();

// SOA/package creators must register the complete invoice set in one call.
// Lock every period before the company and invoice rows, matching cancel/issue;
// acquiring a second period after holding the company could deadlock.
export async function linkInvoiceDocuments(tx:Prisma.TransactionClient,companyId:string,invoiceIds:string[],documentId:string,kind:'SOA'|'APPROVAL_PACKAGE'){
 const selected=parse(z.array(z.uuid()).min(1).max(2000),invoiceIds),ids=[...new Set(selected)].sort();
 const initial=await tx.invoice.findMany({where:{companyId,id:{in:ids}},select:{id:true,partnerId:true,period:true}});
 if(initial.length!==ids.length)throw new CommandError(404,'Không tìm thấy đủ Invoice của công ty.');
 const periods=[...new Map(initial.map(i=>[i.partnerId+'|'+i.period,i])).entries()].sort(([a],[b])=>a.localeCompare(b));
 for(const [,i] of periods)await financialPeriodLock(tx,companyId,i.partnerId,i.period);
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM invoices WHERE company_id=${companyId}::uuid AND id IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
 const invoices=await tx.invoice.findMany({where:{companyId,id:{in:ids}},orderBy:{id:'asc'}}),document=await tx.document.findFirst({where:{companyId,id:documentId}});
 if(invoices.length!==ids.length||invoices.some(i=>!i.isCurrent||!['ISSUED','OVERDUE','PARTIALLY_PAID','PAID'].includes(i.status)))fail('Invoice không còn hiệu lực để ghi vào tài liệu.');
 if(!document||document.status!=='ACTIVE'||document.documentType!==kind)fail('Không tìm thấy tài liệu SOA/gói phê duyệt hợp lệ của công ty.');
 const links=[];
 for(const invoiceId of ids)links.push(await tx.invoiceDocumentLink.upsert({where:{companyId_invoiceId_documentId:{companyId,invoiceId,documentId}},create:{companyId,invoiceId,documentId,kind},update:{}}));
 return links;
}
export async function linkInvoiceDocument(tx:Prisma.TransactionClient,companyId:string,invoiceId:string,documentId:string,kind:'SOA'|'APPROVAL_PACKAGE'){
 return (await linkInvoiceDocuments(tx,companyId,[invoiceId],documentId,kind))[0];
}

export async function assertInvoiceUnused(tx:Prisma.TransactionClient,companyId:string,id:string){
 const [payments,links,approvals]=await Promise.all([
  tx.invoicePayment.count({where:{companyId,invoiceId:id}}),
  tx.invoiceDocumentLink.findMany({where:{companyId,invoiceId:id},orderBy:{documentId:'asc'}}),
  tx.approvalRequest.findMany({where:{companyId,entityId:id,entityType:{equals:'Invoice',mode:'insensitive'}},select:{id:true,status:true},orderBy:{id:'asc'}})
 ]);
 if(payments)fail('Invoice đã có khoản thu; không thể hủy trực tiếp.');
 if(links.length||approvals.length)fail('Invoice đang được dùng trong SOA hoặc hồ sơ phê duyệt; không thể hủy trực tiếp.');
 return {payments,links,approvals};
}

async function cancelPlan(tx:Prisma.TransactionClient,companyId:string,id:string){
 const company=await tx.company.findUniqueOrThrow({where:{id:companyId},select:{companyCode:true}});
 if(company.companyCode!=='DGC')throw new CommandError(409,'Luồng hủy Invoice này dành cho DGC.');
 const item=await tx.invoice.findFirst({where:{companyId,id},include:{receivable:true,scopes:{orderBy:{id:'asc'},include:{items:{orderBy:{lineNo:'asc'},include:{revenue:true}}}}}});
 if(!item)throw new CommandError(404,'Không tìm thấy Invoice của công ty.');
 if(!item.isCurrent||!['DRAFT','ISSUED','OVERDUE'].includes(item.status)||!item.paidAmount.isZero())fail('Chỉ hủy Invoice nháp hoặc đã phát hành/quá hạn hiện hành chưa thanh toán.');
 const {payments,links,approvals}=await assertInvoiceUnused(tx,companyId,id);
 const ar=item.receivable,draft=item.status==='DRAFT';
 if(draft?(!!ar||!!item.issuedAt):(!ar||!item.issuedAt||!ar.paidAmount.isZero()||!ar.originalAmount.eq(item.payableAmount)||!ar.outstandingAmount.eq(item.payableAmount)||!['OPEN','OVERDUE'].includes(ar.status)))fail('Công nợ hoặc thông tin phát hành không nhất quán; cần đối chiếu trước khi hủy.');
 const sourceIds=item.scopes.flatMap(s=>s.items.map(v=>v.revenueId)),snapshot=item.snapshot as any;
 if(!sourceIds.length||new Set(sourceIds).size!==sourceIds.length||!Array.isArray(snapshot?.sourceRevenueIds)||JSON.stringify([...sourceIds].sort())!==JSON.stringify([...snapshot.sourceRevenueIds].sort()))fail('Nguồn Invoice không khớp phạm vi doanh thu.');
 if(item.scopes.some(s=>!s.isCurrent||s.companyId!==companyId||s.partnerId!==item.partnerId||s.currency!==item.currency||s.status!==(draft?'INVOICE_READY':'INVOICED')||!s.items.length||s.items.some(v=>!v.isCurrent||v.companyId!==companyId||v.revenue.companyId!==companyId||!v.revenue.isCurrent||v.revenue.status!==(draft?'INVOICE_READY':'INVOICED'))))fail('Nguồn hoặc phạm vi Invoice đã thay đổi; cần đối chiếu trước khi hủy.');
 if(await tx.invoiceScopeItem.count({where:{companyId,revenueId:{in:sourceIds},isCurrent:true,scope:{isCurrent:true,invoiceId:{not:id}}}}))fail('Nguồn doanh thu còn được Invoice khác sử dụng.');
 const document=await tx.document.findFirst({where:{companyId,id:item.documentId,entityType:'Invoice',entityId:id,documentType:'INVOICE',status:'ACTIVE'},include:{attachment:true}});
 if(!document)fail('Không tìm thấy PDF Invoice hiện hành.');
 await derivedBytes(tx,companyId,document.id,'INVOICE');
 const digest=sha(JSON.stringify({item,document:{id:document.id,updatedAt:document.updatedAt,attachmentId:document.attachmentId,checksum:document.attachment.checksumSha256,fileSize:document.attachment.fileSize?.toString()??null},payments,links,approvals}));
 return {item,ar,sourceIds,digest};
}

export async function invoiceCancelRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/invoices/:id/cancel-preview',{onRequest:writeGuard('INVOICE_CANCEL',config)},async request=>{
  const {id}=parse(ids,request.params);parse(z.object({}).strict(),request.body);
  return prisma.$transaction(async tx=>{const p=await cancelPlan(tx,request.auth!.companyId,id);return {digest:p.digest,invoice:{id:p.item.id,invoiceNumber:p.item.invoiceNumber,status:p.item.status,currency:p.item.currency,payableAmount:p.item.payableAmount.toFixed(2)},hasReceivable:!!p.ar,message:'Hủy Invoice chưa thanh toán, ngừng công nợ hiện hành và cho phép lập lại từ doanh thu đã chốt. Giữ lịch sử, PDF và Excel.'};},{isolationLevel:'RepeatableRead',timeout:15000});
 });
 app.post('/api/v1/invoices/:id/cancel',{onRequest:writeGuard('INVOICE_CANCEL',config)},async request=>{
  const {id}=parse(ids,request.params),body=parse(z.object({digest:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict(),request.body),user=request.auth!;
  return prisma.$transaction(async tx=>{
   const initial=await tx.invoice.findFirst({where:{companyId:user.companyId,id}});if(!initial)throw new CommandError(404,'Không tìm thấy Invoice của công ty.');
   await financialPeriodLock(tx,user.companyId,initial.partnerId,initial.period);
   await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM invoices WHERE company_id=${user.companyId}::uuid AND id=${id}::uuid FOR UPDATE`;
   const p=await cancelPlan(tx,user.companyId,id);if(body.digest!==p.digest)fail('Invoice, nguồn hoặc công nợ đã đổi; kiểm tra lại trước khi hủy.');
   await tx.invoiceScopeItem.updateMany({where:{companyId:user.companyId,scope:{invoiceId:id}},data:{isCurrent:false}});
   await tx.invoiceScope.updateMany({where:{companyId:user.companyId,invoiceId:id},data:{isCurrent:false,status:'CANCELLED'}});
   // Preserve balanced historical AR amounts. It is excluded from current AR
   // by both its CANCELLED status and the cancelled, non-current invoice.
   if(p.ar)await tx.accountReceivable.update({where:{id:p.ar.id},data:{status:'CANCELLED'}});
   await tx.revenue.updateMany({where:{companyId:user.companyId,id:{in:p.sourceIds},status:'INVOICED'},data:{status:'INVOICE_READY'}});
   await tx.document.updateMany({where:{companyId:user.companyId,entityType:'Invoice',entityId:id},data:{status:'CANCELLED'}});
   await tx.invoice.update({where:{id},data:{status:'CANCELLED',isCurrent:false}});
   await audit(tx,user,'INVOICE_CANCEL_UNPAID','Invoice',id,{invoiceNumber:p.item.invoiceNumber,status:p.item.status,receivable:p.ar?{id:p.ar.id,status:p.ar.status,original:p.ar.originalAmount.toFixed(),paid:p.ar.paidAmount.toFixed(),outstanding:p.ar.outstandingAmount.toFixed()}:null},{status:'CANCELLED',isCurrent:false,sourceRevenueIds:p.sourceIds,receivableStatus:p.ar?'CANCELLED':null,filesRetained:true},body.reason);
   return {message:'Đã hủy Invoice chưa thanh toán; giữ lịch sử, ngừng phải thu hiện hành và trả nguồn để lập lại.'};
  },{timeout:30000});
 });
}
