import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {CommandError,date,parse} from './commands.js';

const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v);
const round=(v:Prisma.Decimal)=>v.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
function fail(message:string):never{throw new CommandError(409,message);}
type Receipt={paymentDate:Date;allocationAmount:Prisma.Decimal;allocationCurrency:string};
export function cutoffAmounts(amount:Prisma.Decimal,currency:string,asOf:string,receipts:Receipt[]){
 if(!['USD','VND'].includes(currency)||!amount.isFinite()||amount.lt(0))fail('Tiền hoặc tiền tệ Invoice không hợp lệ.');
 let through=D('0'),after=D('0');
 for(const p of receipts){
  if(p.allocationCurrency!==currency||!p.allocationAmount.isFinite()||p.allocationAmount.lt(0)||!Number.isFinite(p.paymentDate.getTime()))fail('Khoản thu sai tiền tệ, số tiền hoặc ngày.');
  if(p.paymentDate.toISOString().slice(0,10)<=asOf)through=through.plus(p.allocationAmount);else after=after.plus(p.allocationAmount);
 }
 const all=round(through.plus(after));through=round(through);after=round(after);
 return {amount:round(amount).toFixed(2),paidThrough:through.toFixed(2),paidAfter:after.toFixed(2),paidAll:all.toFixed(2),remainingThrough:round(amount.minus(through)).toFixed(2),remainingAll:round(amount.minus(all)).toFixed(2)};
}
const query=z.object({partnerId:z.uuid(),asOf:date,page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
const issued=['ISSUED','OVERDUE','PARTIALLY_PAID','PAID'];
export async function soaCutoffReviewRoutes(app:FastifyInstance,_config:AuthConfig){
 const guard=requirePermission('AR_VIEW');
 const access=async(request:FastifyRequest,reply:FastifyReply)=>{
  await guard(request,reply);if(reply.sent)return;
  if(request.auth!.companyCode!=='DGC')return reply.code(404).send({message:'Không tìm thấy chức năng.'});
  if(!['INVOICE_VIEW','INVOICE_PAYMENT_VIEW'].every(p=>request.auth!.permissions.includes(p)))return reply.code(403).send({message:'Cần quyền xem Invoice và lịch sử thu để đối chiếu SOA.'});
 };
 app.get('/api/v1/soa-cutoff-review/partners',{preHandler:access},async request=>({items:await prisma.partner.findMany({where:{companyId:request.auth!.companyId,invoices:{some:{isCurrent:true,status:{in:issued}}}},select:{id:true,partnerKey:true,legalName:true},orderBy:[{partnerKey:'asc'},{id:'asc'}]})}));
 app.get('/api/v1/soa-cutoff-review',{preHandler:access},async request=>{
  const q=parse(query,request.query),companyId=request.auth!.companyId;
  return prisma.$transaction(async tx=>{
   const partner=await tx.partner.findFirst({where:{companyId,id:q.partnerId},select:{id:true,partnerKey:true,legalName:true}});
   if(!partner)throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
   const invoices=await tx.invoice.findMany({where:{companyId,partnerId:q.partnerId,isCurrent:true,status:{in:issued},invoiceDate:{lte:new Date(q.asOf+'T00:00:00Z')}},select:{id:true,invoiceNumber:true,invoiceDate:true,currency:true,payableAmount:true,paidAmount:true,receivable:{select:{companyId:true,status:true,originalAmount:true,paidAmount:true,outstandingAmount:true}}},orderBy:[{invoiceDate:'asc'},{invoiceNumber:'asc'},{id:'asc'}],take:10001});
   if(invoices.length>10000)fail('Vượt giới hạn 10.000 Invoice; cần chia phạm vi đối chiếu.');
   const receipts=await tx.invoicePayment.findMany({where:{companyId,invoiceId:{in:invoices.map(i=>i.id)}},select:{invoiceId:true,paymentDate:true,allocationAmount:true,allocationCurrency:true},take:100001});
   if(receipts.length>100000)fail('Vượt giới hạn 100.000 khoản thu; chưa thể đối chiếu đầy đủ.');
   const byInvoice=new Map<string,Receipt[]>();for(const p of receipts){const list=byInvoice.get(p.invoiceId)??[];list.push(p);byInvoice.set(p.invoiceId,list);}
   const totals:Record<string,Record<string,Prisma.Decimal>>={};
   const rows=invoices.map(i=>{
    const ar=i.receivable;
    if(!ar||ar.companyId!==companyId||['CANCELLED','CANCELED','SUPERSEDED'].includes(ar.status))fail('Invoice '+i.invoiceNumber+' thiếu AR hiện hành hợp lệ.');
    const amounts=cutoffAmounts(i.payableAmount,i.currency,q.asOf,byInvoice.get(i.id)??[]);
    if(ar.originalAmount.minus(i.payableAmount).abs().gt('.01')||ar.paidAmount.minus(i.paidAmount).abs().gt('.01')||D(amounts.paidAll).minus(i.paidAmount).abs().gt('.01')||ar.outstandingAmount.minus(ar.originalAmount.minus(ar.paidAmount)).abs().gt('.01'))fail('Invoice '+i.invoiceNumber+' có AR/khoản thu không khớp; cần đối chiếu nguồn trước.');
    const t=totals[i.currency]??={};for(const [k,v] of Object.entries(amounts))t[k]=(t[k]??D('0')).plus(v);
    return {id:i.id,invoiceNumber:i.invoiceNumber,invoiceDate:i.invoiceDate.toISOString().slice(0,10),currency:i.currency,...amounts};
   });
   const total=rows.length,pages=Math.max(1,Math.ceil(total/10)),page=Math.min(q.page,pages);
   return {reviewOnly:true,cutoffPolicy:'AWAITING_OWNER',asOf:q.asOf,partner,total,page,pages,pageSize:10,affectedInvoices:rows.filter(r=>D(r.paidAfter).gt(0)).length,totals:Object.entries(totals).map(([currency,t])=>({currency,...Object.fromEntries(Object.entries(t).map(([k,v])=>[k,v.toFixed(2)]))})),items:rows.slice((page-1)*10,page*10)};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
 });
}
