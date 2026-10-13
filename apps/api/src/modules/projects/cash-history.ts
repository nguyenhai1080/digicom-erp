import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,date,parse,writeGuard} from './commands.js';
import {sha} from './financial-documents.js';
const text=z.string().trim().max(500),purpose=z.string().trim().min(1).max(100);
const row=z.object({sourceKey:z.string().regex(/^[a-f0-9]{64}$/),sourceFile:text,sourceReferences:z.array(z.object({sheet:text,row:z.number().int().min(1)}).strict()).min(1).max(10),sourceData:z.record(z.string(),z.unknown()),transactionDate:date,direction:z.enum(['IN','OUT']),kind:z.enum(['FLOW','OPENING']),amount:z.string().regex(/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/),currency:z.enum(['VND','USD']),sender:text,recipient:text,description:text,purpose,projectLabel:text,nature:z.enum(['ACTUAL','INTERNAL','NON_EXPENSE','UNKNOWN'])}).strict();
const filter=z.object({page:z.coerce.number().int().min(1).default(1),year:z.string().regex(/^20\d{2}$/).optional(),month:z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),purpose:purpose.optional(),direction:z.enum(['IN','OUT']).optional()}).strict().refine(q=>!q.month||!!q.year,{message:'Chọn năm trước khi chọn tháng.'});
function dates(q:{year?:string;month?:string}){if(!q.year)return;const start=new Date(q.year+'-'+(q.month??'01')+'-01'),end=new Date(Date.UTC(Number(q.year)+(q.month?0:1),q.month?Number(q.month):0,1));return {gte:start,lt:end};}
export async function cashHistoryRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/cash-history/import',{bodyLimit:12*1024*1024,onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const b=parse(z.object({rows:z.array(row).min(1).max(3000),confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  if(!['PAYMENT_APPROVE','PAYMENT_POST'].every(p=>user.permissions.includes(p)))throw new CommandError(403,'Cần quyền duyệt và ghi nhận thanh toán.');
  if(new Set(b.rows.map(r=>r.sourceKey)).size!==b.rows.length)throw new CommandError(400,'Nguồn có mã dòng trùng.');
  for(const r of b.rows){const amount=new Prisma.Decimal(r.amount);if(r.kind==='FLOW'&&!amount.gt(0))throw new CommandError(400,'Thu/chi phải lớn hơn 0. Số dư chuyển kỳ phải dùng loại số dư.');}
  return prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+':cash-history-import'},0))`;
   const existing=await tx.cashHistory.findMany({where:{companyId:user.companyId,sourceKey:{in:b.rows.map(r=>r.sourceKey)}},select:{sourceKey:true,sourceDigest:true}}),known=new Map(existing.map(r=>[r.sourceKey,r.sourceDigest]));
   for(const r of b.rows)if(known.has(r.sourceKey)&&known.get(r.sourceKey)!==sha(JSON.stringify(r)))throw new CommandError(409,'Một dòng nguồn đã nhập có dữ liệu khác; cần đối chiếu trước khi thay đổi.');
   const fresh=b.rows.filter(r=>!known.has(r.sourceKey));if(fresh.length)await tx.cashHistory.createMany({data:fresh.map(r=>({...r,companyId:user.companyId,transactionDate:new Date(r.transactionDate),sourceDigest:sha(JSON.stringify(r)),sourceData:r.sourceData as Prisma.InputJsonValue,importedById:user.userId}))});
   await audit(tx,user,'CASH_HISTORY_IMPORT','CashHistory',user.companyId,null,{inserted:fresh.length,skipped:b.rows.length-fresh.length,files:[...new Set(b.rows.map(r=>r.sourceFile))]},'Nhập thu chi lịch sử để báo cáo; không cập nhật tài khoản, Invoice hay công nợ');return {inserted:fresh.length,skipped:b.rows.length-fresh.length,message:'Đã nhập '+fresh.length+' giao dịch lịch sử; bỏ qua '+(b.rows.length-fresh.length)+' dòng đã có. Số dư tài khoản giữ nguyên.'};
  },{timeout:30000});
 });
 app.get('/api/v1/cash-history',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(filter,req.query),companyId=req.auth!.companyId,transactionDate=dates(q),where={companyId,...(transactionDate?{transactionDate}:{}),...(q.purpose?{purpose:q.purpose}:{}),...(q.direction?{direction:q.direction}:{})};
  const [items,total,labels,years]=await prisma.$transaction([prisma.cashHistory.findMany({where,orderBy:[{transactionDate:'desc'},{sourceKey:'asc'}],skip:(q.page-1)*10,take:10}),prisma.cashHistory.count({where}),prisma.cashHistory.findMany({where:{companyId},distinct:['purpose'],select:{purpose:true},orderBy:{purpose:'asc'}}),prisma.cashHistory.findMany({where:{companyId},distinct:['transactionDate'],select:{transactionDate:true}})]);return {items,total,page:q.page,purposes:labels.map(r=>r.purpose),years:[...new Set(years.map(r=>r.transactionDate.getUTCFullYear()))].sort((a,b)=>b-a)};
 });
 app.get('/api/v1/cash-report',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(filter.safeExtend({year:z.string().regex(/^20\d{2}$/)}),req.query),companyId=req.auth!.companyId,range=dates(q)!,purposeWhere=q.purpose?{purpose:q.purpose}:{};
  const [history,current,receipts]=await prisma.$transaction([prisma.cashHistory.findMany({where:{companyId,transactionDate:range,kind:'FLOW',...purposeWhere}}),prisma.expense.findMany({where:{companyId,expenseDate:range,status:'POSTED',...purposeWhere}}),prisma.cashEntry.findMany({where:{companyId,entryDate:range,kind:'INVOICE_RECEIPT'}})]);
  const records=[...history.map(r=>({date:r.transactionDate,direction:r.direction,currency:r.currency,amount:r.amount,purpose:r.purpose,nature:r.nature})),...current.map(r=>({date:r.expenseDate,direction:r.direction,currency:r.currency,amount:r.amount,purpose:r.purpose,nature:r.nature})),...receipts.filter(()=>!q.purpose||q.purpose==='Thu Invoice').map(r=>({date:r.entryDate,direction:r.direction,currency:r.currency,amount:r.amount,purpose:'Thu Invoice',nature:'ACTUAL'}))].filter(r=>!q.direction||r.direction===q.direction);
  const buckets=new Map<string,{label:string;currency:string;incoming:Prisma.Decimal;outgoing:Prisma.Decimal;actualExpense:Prisma.Decimal;unclassified:Prisma.Decimal;count:number}>();
  const totals=new Map<string,{currency:string;incoming:Prisma.Decimal;outgoing:Prisma.Decimal;actualExpense:Prisma.Decimal;unclassified:Prisma.Decimal;count:number}>();
  const months=new Map<string,{period:string;currency:string;incoming:Prisma.Decimal;outgoing:Prisma.Decimal}>();
  for(const r of records){const key=r.purpose+'|'+r.currency,b=buckets.get(key)??{label:r.purpose,currency:r.currency,incoming:new Prisma.Decimal(0),outgoing:new Prisma.Decimal(0),actualExpense:new Prisma.Decimal(0),unclassified:new Prisma.Decimal(0),count:0},t=totals.get(r.currency)??{currency:r.currency,incoming:new Prisma.Decimal(0),outgoing:new Prisma.Decimal(0),actualExpense:new Prisma.Decimal(0),unclassified:new Prisma.Decimal(0),count:0},period=r.date.toISOString().slice(0,7),m=months.get(period+'|'+r.currency)??{period,currency:r.currency,incoming:new Prisma.Decimal(0),outgoing:new Prisma.Decimal(0)};
   for(const v of [b,t]){v.count++;if(r.direction==='IN')v.incoming=v.incoming.plus(r.amount);else{v.outgoing=v.outgoing.plus(r.amount);if(r.nature==='ACTUAL')v.actualExpense=v.actualExpense.plus(r.amount);if(r.nature==='UNKNOWN')v.unclassified=v.unclassified.plus(r.amount);}}if(r.direction==='IN')m.incoming=m.incoming.plus(r.amount);else m.outgoing=m.outgoing.plus(r.amount);buckets.set(key,b);totals.set(r.currency,t);months.set(period+'|'+r.currency,m);
  }
  const items=[...buckets.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.currency.localeCompare(b.currency));return {year:q.year,month:q.month,totals:[...totals.values()].map(t=>({...t,net:t.incoming.minus(t.outgoing)})),items:items.slice((q.page-1)*10,q.page*10),total:items.length,page:q.page,months:[...months.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.currency.localeCompare(b.currency))};
 });
}
