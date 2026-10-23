import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,date,parse,timestamp,unchanged,writeGuard} from './commands.js';
import {checkedFile,persistPdf,persistPaymentImage,rollbackFiles,sha} from './financial-documents.js';
import {financialPeriodLock} from './recon-finalize.js';
import {historicalPaymentSchema,historicalPaymentAmounts,historicalPaymentDate} from './historical-payment.js';
import {invoicePaymentReadPermission,canPostInvoicePayment} from './invoice-payment-access.js';
import {isSourceReceipt,sourceReceiptView} from './source-receipt.js';

const amount=z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/);
const bodySchema=z.object({requestId:z.uuid(),expectedUpdatedAt:timestamp,paymentDate:date,paidUsd:amount,paidVnd:z.string().regex(/^[1-9]\d{0,15}$/),fxRate:z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/).optional(),swiftNo:z.string().trim().max(200),cashAccountId:z.uuid(),bankAccount:z.string().trim().max(200).default(''),paymentMethod:z.enum(['Bank Transfer','Cash','Other']),note:z.string().trim().max(2000),confirmed:z.literal(true),swiftFile:z.object({filename:z.string().trim().min(1).max(200),base64:z.string().max(7*1024*1024)}).strict().optional()}).strict();
const id=(p:unknown)=>parse(z.object({id:z.uuid()}).strict(),p).id;
const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v);
function fail(message:string):never{throw new CommandError(409,message);}
// DGC USD allocations and VND receipts are independent amounts. FX is informational.
export function paymentAmounts(original:string,alreadyPaid:string,usd:string,vnd:string,fx?:string){
 const total=D(original),paid=D(alreadyPaid),next=D(usd),cash=D(vnd);
 if(!next.gt(0)||!cash.gt(0)||paid.lt(0)||paid.gt(total)||!total.gt(0))fail('Số tiền thanh toán hoặc số dư không hợp lệ.');
 const remaining=total.minus(paid);
 if(next.gt(remaining))fail('Tiền thu USD vượt số còn phải thu '+remaining.toFixed(2)+' USD.');
 const rate=fx?D(fx):cash.div(next).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
 if(!rate.gt(0)||rate.gte('1000000000000'))fail('Tỷ giá thanh toán phải lớn hơn 0.');
 const paidAfter=paid.plus(next),outstanding=total.minus(paidAfter);
 return {paidAfter,outstanding,rate,status:outstanding.lte('.01')?'PAID' as const:'PARTIALLY_PAID' as const};
}
export function nativeVndPayment(original:string,paid:string,next:string){const total=D(original),old=D(paid),cash=D(next);if(!total.isInteger()||!old.isInteger()||!cash.isInteger()||!cash.gt(0)||old.lt(0)||cash.gt(total.minus(old)))fail('Tiền thu VND vượt số dư hoặc không hợp lệ.');const paidAfter=old.plus(cash),outstanding=total.minus(paidAfter);return {paidAfter,outstanding,rate:D('1'),status:outstanding.isZero()?'PAID' as const:'PARTIALLY_PAID' as const};}
export async function invoicePaymentRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/invoices/:id/payments',{preHandler:requirePermission(invoicePaymentReadPermission)},async request=>{
  const invoice=await prisma.invoice.findFirst({where:{companyId:request.auth!.companyId,id:id(request.params)},include:{receivable:true}});
  if(!invoice)throw new CommandError(404,'Không tìm thấy Invoice.');
  const items=await prisma.invoicePayment.findMany({where:{companyId:invoice.companyId,invoiceId:invoice.id},orderBy:[{paymentDate:'desc'},{createdAt:'desc'}]});
  const canPost=canPostInvoicePayment(request.auth!);
  const accounts=request.auth!.companyCode==='DGC'&&!canPost?[]:await prisma.cashAccount.findMany({where:{companyId:invoice.companyId,status:'ACTIVE',currency:'VND'},select:{id:true,accountCode:true,name:true,kind:true,currency:true,bankName:true,accountNumber:true},orderBy:{accountCode:'asc'},take:1000});
  return {canPost,accounts,invoice:{id:invoice.id,invoiceNumber:invoice.invoiceNumber,period:invoice.period,currency:invoice.currency,status:invoice.status,updatedAt:invoice.updatedAt,payable:invoice.payableAmount.toFixed(2),paid:invoice.paidAmount.toFixed(2),outstanding:invoice.receivable?.outstandingAmount.toFixed(2)??null},items:items.map(p=>({...p,historicalSource:sourceReceiptView(p.historicalSource)}))};
 });
 app.post('/api/v1/invoices/:id/payments',{bodyLimit:8*1024*1024,onRequest:writeGuard('PAYMENT_POST',config)},async request=>{
  const user=request.auth!,invoiceId=id(request.params),body=parse(z.union([bodySchema,historicalPaymentSchema]),request.body),historical='mode' in body,digest=sha(JSON.stringify({invoiceId,...body}));
  if(!['PAYMENT_CREATE','PAYMENT_APPROVE'].every(p=>user.permissions.includes(p)))throw new CommandError(403,'Cần quyền tạo và duyệt thanh toán.');
  let bytes:Buffer|undefined,ext:'pdf'|'png'|'jpg'='pdf';
  if(!historical&&body.swiftFile){
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(body.swiftFile.base64))throw new CommandError(400,'Chứng từ PDF không hợp lệ.');
   bytes=Buffer.from(body.swiftFile.base64,'base64');
   if(bytes.length>5*1024*1024)throw new CommandError(400,'Chứng từ tối đa 5 MB.');
   if(bytes.subarray(0,5).equals(Buffer.from('%PDF-'))){
    try{const pdf=await PDFDocument.load(bytes);if(pdf.isEncrypted||pdf.getPageCount()>30)throw new Error();}catch{throw new CommandError(400,'PDF chứng từ bị lỗi hoặc khóa.');}
   }else{
    try{const image=sharp(bytes,{limitInputPixels:20000000}),meta=await image.metadata();if(!['png','jpeg'].includes(meta.format??'')||(meta.pages??1)>1)throw new Error();await image.stats();ext=meta.format==='png'?'png':'jpg';}catch{throw new CommandError(400,'Chứng từ phải là PDF hoặc ảnh PNG/JPEG hợp lệ, tối đa 20 triệu điểm ảnh.');}
   }
  }
  const files:string[]=[];
  try{return await prisma.$transaction(async tx=>{
   const invoice=await tx.invoice.findFirst({where:{companyId:user.companyId,id:invoiceId}});
   if(!invoice)throw new CommandError(404,'Không tìm thấy Invoice.');
   await financialPeriodLock(tx,user.companyId,invoice.partnerId,invoice.period);
   await tx.$queryRaw`SELECT id FROM invoices WHERE id=${invoiceId}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const duplicate=await tx.invoicePayment.findUnique({where:{companyId_requestId:{companyId:user.companyId,requestId:body.requestId}}});
   if(duplicate){if(duplicate.requestDigest!==digest)fail('Mã yêu cầu đã được dùng cho thanh toán khác.');return {message:'Thanh toán này đã được ghi nhận; không ghi trùng.',paymentId:duplicate.id};}
   const inv=await tx.invoice.findFirstOrThrow({where:{companyId:user.companyId,id:invoiceId},include:{receivable:true,scopes:{include:{items:{include:{revenue:{include:{reconciliation:true}}}}}}}});
   if(historical)historicalPaymentDate(inv.period,body.paymentDate,body.dateBasis);
   unchanged(inv,body.expectedUpdatedAt);
   if(!inv.isCurrent||!inv.issuedAt||!['ISSUED','OVERDUE','PARTIALLY_PAID'].includes(inv.status)||!['USD','VND'].includes(inv.currency))fail('Chỉ ghi thanh toán cho Invoice hiện hành đã phát hành và còn phải thu.');
   const ar=inv.receivable;
   if(!ar||ar.companyId!==user.companyId||!ar.originalAmount.eq(inv.payableAmount)||!ar.paidAmount.eq(inv.paidAmount)||!ar.outstandingAmount.eq(ar.originalAmount.minus(ar.paidAmount)))fail('Invoice và công nợ không khớp; chưa thể ghi thanh toán.');
   if(!inv.scopes.length||inv.scopes.some(s=>!s.isCurrent||s.status!=='INVOICED'||!s.items.length||s.items.some(v=>!v.isCurrent||v.companyId!==user.companyId||!v.revenue.isCurrent||!['INVOICED','PARTIALLY_PAID','PAID'].includes(v.revenue.status)||v.revenue.companyId!==user.companyId||!v.revenue.reconciliation.isCurrent||v.revenue.reconciliation.status!=='APPROVED')))fail('Nguồn Invoice đã bị thay thế; không ghi thanh toán trên bản cũ.');
   const old=await tx.invoicePayment.aggregate({where:{companyId:user.companyId,invoiceId},_sum:{allocationAmount:true}});
   if(!(old._sum.allocationAmount??D('0')).eq(inv.paidAmount))fail('Lịch sử thanh toán không khớp số đã thu.');
   if(!historical&&inv.currency==='VND'&&(!D(body.paidUsd).isZero()||body.fxRate&& !D(body.fxRate).eq(1)))fail('Invoice VND chỉ phân bổ VND, không nhập khoản USD giả.');
   const a=historical?historicalPaymentAmounts(inv.payableAmount.toString(),inv.paidAmount.toString(),body.allocationAmount,inv.currency,body.cashAmount,body.cashCurrency,body.conversionRate):inv.currency==='VND'?nativeVndPayment(inv.payableAmount.toFixed(0),inv.paidAmount.toFixed(0),body.paidVnd):paymentAmounts(inv.payableAmount.toFixed(2),inv.paidAmount.toFixed(2),body.paidUsd,body.paidVnd,body.fxRate);
   const allocationAmount=historical?D(body.allocationAmount):D(inv.currency==='VND'?body.paidVnd:body.paidUsd),cashCurrency=historical?body.cashCurrency:'VND',cashAmount=D(historical?body.cashAmount:body.paidVnd);
   let cashAccount;
   if(!historical){
    await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${user.companyId}::uuid AND id=${body.cashAccountId}::uuid FOR UPDATE`;
    cashAccount=await tx.cashAccount.findFirst({where:{companyId:user.companyId,id:body.cashAccountId,status:'ACTIVE',currency:cashCurrency}});
    if(!cashAccount)fail('Chọn tài khoản/quỹ đang hoạt động, đúng tiền tệ nhận và thuộc công ty.');
    if(cashAccount.openingDate>new Date(body.paymentDate))fail('Ngày nhận tiền phải từ ngày bắt đầu theo dõi số dư tài khoản.');
    if(body.paymentMethod==='Bank Transfer'&&cashAccount.kind!=='BANK'||body.paymentMethod==='Cash'&&cashAccount.kind!=='CASH')fail('Phương thức thanh toán không khớp loại tài khoản/quỹ.');
   }
   const history=historical?{reference:body.sourceReference,dateBasis:body.dateBasis,accountKnown:!!body.bankAccount,rateKind:inv.currency===body.cashCurrency?'NONE':'REPORTING_CONVERSION'}:undefined;
   const payment=await tx.invoicePayment.create({data:{companyId:user.companyId,invoiceId,allocationCurrency:inv.currency,allocationAmount,cashCurrency,cashAmount,historicalSource:history,paymentCode:await code(tx,user.companyId,'INVOICE_PAYMENT','PAY'),requestId:body.requestId,requestDigest:digest,paymentDate:new Date(body.paymentDate),paidUsd:historical?(inv.currency==='USD'?allocationAmount:D('0')):D(body.paidUsd),paidVnd:historical?(cashCurrency==='VND'?cashAmount:null):D(body.paidVnd),fxRate:a.rate,swiftNo:historical?'':body.swiftNo,cashAccountId:cashAccount?.id,bankAccount:cashAccount?[cashAccount.accountCode,cashAccount.bankName,cashAccount.accountNumber,cashAccount.name].filter(Boolean).join(' · '):body.bankAccount,paymentMethod:historical?'Other':body.paymentMethod,note:body.note,approvedById:user.userId}});
   if(cashAccount){
    const updated=await tx.cashAccount.update({where:{id:cashAccount.id},data:{balance:{increment:cashAmount}}});
    await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:cashAccount.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:new Date(body.paymentDate),kind:'INVOICE_RECEIPT',direction:'IN',currency:cashCurrency,amount:cashAmount,balanceAfter:updated.balance,sourceId:payment.id,description:'Thu tiền Invoice '+inv.invoiceNumber+' · '+payment.paymentCode}});
   }
   if(bytes){const filename='SWIFT_'+inv.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+body.paymentDate+'_'+payment.paymentCode+'.'+ext;const doc=ext==='pdf'?await persistPdf(tx,user,'InvoicePayment',payment.id,'PAYMENT_SWIFT',filename,bytes,1,files):await persistPaymentImage(tx,user,payment.id,filename,bytes,ext,files);await tx.invoicePayment.update({where:{id:payment.id},data:{documentId:doc.id}});}
   await tx.invoice.update({where:{id:inv.id},data:{paidAmount:a.paidAfter,status:a.status}});
   await tx.accountReceivable.update({where:{id:ar.id},data:{paidAmount:a.paidAfter,outstandingAmount:a.outstanding,status:a.status}});
   await tx.revenue.updateMany({where:{companyId:user.companyId,id:{in:inv.scopes.flatMap(s=>s.items.map(v=>v.revenueId))}},data:{status:a.status}});
   await audit(tx,user,'INVOICE_PAYMENT_POST','InvoicePayment',payment.id,{invoiceStatus:inv.status,paid:inv.paidAmount,outstanding:ar.outstandingAmount},{...payment,invoiceStatus:a.status,paid:a.paidAfter,outstanding:a.outstanding,cashCurrency,cashDirection:'IN',approved:true},(historical?'Ghi nhận thanh toán lịch sử từ bảng nguồn; ':'Ghi nhận thu tiền; ')+'phân bổ '+inv.currency+' cho Invoice và cập nhật phải thu');
   return {paymentId:payment.id,message:'Đã ghi nhận thanh toán, cập nhật Invoice và công nợ. Còn phải thu '+a.outstanding.toFixed(2)+' '+inv.currency+'.'};
  },{timeout:30000});}catch(e){await rollbackFiles(files);throw e;}
 });
 app.post('/api/v1/invoice-payments/:id/post-cash',{onRequest:writeGuard('PAYMENT_POST',config)},async request=>{
  const user=request.auth!,paymentId=id(request.params),b=parse(z.object({cashAccountId:z.uuid(),reason:z.string().trim().min(10).max(2000),confirmed:z.literal(true)}).strict(),request.body);
  if(!['PAYMENT_CREATE','PAYMENT_APPROVE'].every(p=>user.permissions.includes(p)))throw new CommandError(403,'Cần quyền tạo và duyệt thanh toán.');
  return prisma.$transaction(async tx=>{
   const initial=await tx.invoicePayment.findFirst({where:{companyId:user.companyId,id:paymentId},include:{invoice:true}});
   if(!initial)throw new CommandError(404,'Không tìm thấy thanh toán.');
   if(isSourceReceipt(initial.historicalSource))fail('Khoản thu nhập từ nguồn chỉ cập nhật lịch sử Invoice/công nợ; không được ghi vào tài khoản tiền.');
   await financialPeriodLock(tx,user.companyId,initial.invoice.partnerId,initial.invoice.period);
   await tx.$queryRaw`SELECT id FROM invoices WHERE id=${initial.invoiceId}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM invoice_payments WHERE id=${paymentId}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const payment=await tx.invoicePayment.findFirstOrThrow({where:{companyId:user.companyId,id:paymentId},include:{invoice:{include:{receivable:true}}}});
   const existing=await tx.cashEntry.findUnique({where:{companyId_kind_sourceId:{companyId:user.companyId,kind:'INVOICE_RECEIPT',sourceId:paymentId}}});
   if(existing){if(payment.cashAccountId!==b.cashAccountId||existing.cashAccountId!==b.cashAccountId)fail('Khoản thu đã được ghi vào tài khoản khác.');return {message:'Khoản thu đã được ghi vào tài khoản; không cộng trùng.',entryId:existing.id};}
   if(payment.cashAccountId||!payment.historicalSource)fail('Chỉ bổ sung tài khoản cho khoản lịch sử chưa ghi vào sổ tài khoản.');
   const inv=payment.invoice,ar=inv.receivable;
   if(!inv.isCurrent||!inv.issuedAt||!['PAID','PARTIALLY_PAID','ISSUED','OVERDUE'].includes(inv.status)||!ar||ar.companyId!==user.companyId||!ar.paidAmount.eq(inv.paidAmount)||!ar.outstandingAmount.eq(ar.originalAmount.minus(ar.paidAmount)))fail('Invoice hoặc công nợ không hợp lệ.');
   const total=await tx.invoicePayment.aggregate({where:{companyId:user.companyId,invoiceId:inv.id},_sum:{allocationAmount:true}});
   if(!(total._sum.allocationAmount??D('0')).eq(inv.paidAmount))fail('Lịch sử thanh toán không khớp số đã thu.');
   if(payment.cashCurrency!=='VND'||!payment.cashAmount.gt(0)||!payment.cashAmount.isInteger())fail('Cần số tiền VND thực nhận hợp lệ trước khi ghi vào tài khoản.');
   await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${user.companyId}::uuid AND id=${b.cashAccountId}::uuid FOR UPDATE`;
   const account=await tx.cashAccount.findFirst({where:{companyId:user.companyId,id:b.cashAccountId,status:'ACTIVE',currency:payment.cashCurrency}});
   if(!account||account.openingDate>payment.paymentDate||payment.paymentDate>new Date())fail('Tài khoản không hợp lệ hoặc ngày nhận tiền nằm ngoài thời gian theo dõi.');
   const updated=await tx.cashAccount.update({where:{id:account.id},data:{balance:{increment:payment.cashAmount}}});
   const entry=await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:account.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:payment.paymentDate,kind:'INVOICE_RECEIPT',direction:'IN',currency:payment.cashCurrency,amount:payment.cashAmount,balanceAfter:updated.balance,sourceId:payment.id,description:'Thu tiền Invoice '+inv.invoiceNumber+' · '+payment.paymentCode}});
   const result=await tx.invoicePayment.update({where:{id:payment.id},data:{cashAccountId:account.id,bankAccount:[account.accountCode,account.bankName,account.accountNumber,account.name].filter(Boolean).join(' · '),paymentMethod:account.kind==='BANK'?'Bank Transfer':'Cash',historicalSource:{...(payment.historicalSource as object),cashPosting:{entryId:entry.id,postedAt:new Date().toISOString(),postedById:user.userId,reason:b.reason}}}});
   await audit(tx,user,'INVOICE_PAYMENT_CASH_POST','InvoicePayment',payment.id,{cashAccountId:payment.cashAccountId,balance:account.balance,historicalSource:payment.historicalSource},{cashAccountId:result.cashAccountId,balance:updated.balance,entryId:entry.id,amount:payment.cashAmount,invoicePaid:inv.paidAmount,arOutstanding:ar.outstandingAmount},b.reason);
   return {message:'Đã cộng '+payment.cashAmount.toFixed(0)+' VND vào '+account.accountCode+'. Giữ nguyên số đã thu và công nợ.',entryId:entry.id};
  },{timeout:30000});
 });
 app.get('/api/v1/invoice-payments/:id/document',{preHandler:requirePermission('PAYMENT_VIEW')},async(request,reply)=>{
  const user=request.auth!,payment=await prisma.invoicePayment.findFirst({where:{companyId:user.companyId,id:id(request.params)}});
  if(!payment?.documentId)throw new CommandError(404,'Không có chứng từ.');
  const doc=await prisma.document.findFirst({where:{companyId:user.companyId,id:payment.documentId,entityId:payment.id,entityType:'InvoicePayment',documentType:'PAYMENT_SWIFT',status:'ACTIVE'},include:{attachment:true}});
  if(!doc||doc.attachment.companyId!==user.companyId)throw new CommandError(404,'Không có chứng từ.');
  const ext=doc.attachment.storedFilename.split('.').at(-1);if(!['pdf','png','jpg'].includes(ext??''))throw new CommandError(409,'Chứng từ không hợp lệ.');
  const bytes=await checkedFile(doc.attachment,`payments/${user.companyId}/${doc.attachment.id}.${ext}`,5*1024*1024);
  return reply.type(doc.attachment.mimeType!).header('Content-Disposition',`inline; filename="${doc.attachment.originalFilename.replace(/[^A-Za-z0-9_.-]/g,'_')}"`).send(bytes);
 });
}
