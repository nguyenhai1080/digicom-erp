import type {FastifyInstance} from 'fastify';
import {Prisma,prisma} from '@erp/db';
import {z} from 'zod';
import {authenticate} from '../auth/access.js';
import {CommandError,parse} from './commands.js';
import {nativeAmount} from './revenue-money.js';

export async function dashboardOperationsRoutes(app:FastifyInstance){
 app.get('/api/v1/dashboard/operations',{preHandler:authenticate},async req=>{
  const user=req.auth!;
  if(user.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy báo cáo.');
  parse(z.object({}).strict(),req.query);
  const has=(p:string)=>user.permissions.includes(p);
  if(!['REVENUE_VIEW','INVOICE_VIEW','AR_VIEW'].some(has))throw new CommandError(403,'Không có quyền xem báo cáo nghiệp vụ.');
  const companyId=user.companyId,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}),start=new Date(today+'T00:00:00Z'),until=new Date(start.getTime()+7*86400000);
  return prisma.$transaction(async tx=>{
   let pendingRevenue=null,drafts=null,receivables=null;
   if(has('REVENUE_VIEW')){
    const where:Prisma.RevenueWhereInput={companyId,isCurrent:true,currency:{in:['USD','VND']},status:{in:['INVOICE_READY','INVOICED']},partner:{companyId},service:{companyId},contract:{companyId},reconciliation:{companyId,isCurrent:true,status:'APPROVED'},AND:[{calculationJson:{path:['dgc'],equals:true}},{calculationJson:{path:['rowType'],equals:'TOTAL'}},{calculationJson:{path:['includeInMonthlyTotal'],equals:true}}],invoiceScopeItems:{none:{companyId,isCurrent:true,scope:{companyId,isCurrent:true,status:{notIn:['SUPERSEDED','CANCELLED']},OR:[{invoiceId:null},{invoice:{companyId,isCurrent:true,status:{notIn:['SUPERSEDED','CANCELLED']}}}]}}}};
    const totals=await tx.revenue.groupBy({by:['currency'],where,_count:{_all:true},_sum:{netAmount:true}});
    pendingRevenue={count:totals.reduce((n,t)=>n+t._count._all,0),amounts:totals.map(t=>({currency:t.currency,amount:nativeAmount(t._sum.netAmount??new Prisma.Decimal(0),t.currency)}))};
   }
   if(has('INVOICE_VIEW'))drafts={count:await tx.invoice.count({where:{companyId,partner:{companyId},isCurrent:true,status:'DRAFT',issuedAt:null}})};
   if(has('AR_VIEW')){
    const where:Prisma.AccountReceivableWhereInput={companyId,outstandingAmount:{gt:0},invoice:{companyId,partner:{companyId},isCurrent:true,currency:{in:['USD','VND']},status:{in:['ISSUED','OVERDUE','PARTIALLY_PAID','PAID']}}};
    const count=await tx.accountReceivable.count({where});
    const amounts=[];
    for(const currency of ['USD','VND']){
     const sum=await tx.accountReceivable.aggregate({where:{...where,invoice:{...(where.invoice as Prisma.InvoiceWhereInput),currency}},_sum:{outstandingAmount:true}});
     amounts.push({currency,amount:nativeAmount(sum._sum.outstandingAmount??new Prisma.Decimal(0),currency)});
    }
    const dueSoonCount=await tx.accountReceivable.count({where:{...where,invoice:{...(where.invoice as Prisma.InvoiceWhereInput),dueDate:{gte:start,lt:until}}}});
    receivables={count,amounts,dueSoonCount};
   }
   return {asOf:today,balanceBasis:'CURRENT_LEDGER',dueSoonFrom:today,dueSoonUntilExclusive:until.toISOString().slice(0,10),scope:'ALL_PERIODS',pendingRevenue,drafts,receivables,readOnly:true};
  },{isolationLevel:'RepeatableRead'});
 });
}
