import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,date,parse,timestamp,unchanged,writeGuard} from './commands.js';

const metadata=z.object({name:z.string().trim().min(1).max(150),bankName:z.string().trim().max(150),accountNumber:z.string().trim().max(100),holderName:z.string().trim().max(150),note:z.string().trim().max(2000)});
const create=metadata.extend({accountCode:z.string().trim().regex(/^[A-Z0-9_-]{2,30}$/),kind:z.enum(['BANK','CASH']),currency:z.enum(['USD','VND']),openingDate:date,openingBalance:z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/),confirmed:z.literal(true)}).strict();
const id=(v:unknown)=>parse(z.object({id:z.uuid()}).strict(),v).id;
function bankFields(v:{kind:string;bankName:string;accountNumber:string;holderName:string}){if(v.kind==='BANK'&&(!v.bankName||!v.accountNumber||!v.holderName))throw new CommandError(400,'Cần tên ngân hàng, số tài khoản và chủ tài khoản.');}

export async function cashAccountRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/cash-accounts',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).default(1)}).strict(),req.query),companyId=req.auth!.companyId;
  const [items,total]=await prisma.$transaction([prisma.cashAccount.findMany({where:{companyId},orderBy:[{accountCode:'asc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),prisma.cashAccount.count({where:{companyId}})]);
  return {items,total,page:q.page};
 });
 app.post('/api/v1/cash-accounts',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{
  const b=parse(create,req.body),user=req.auth!;bankFields(b);
  if(b.currency==='VND'&&!new Prisma.Decimal(b.openingBalance).isInteger())throw new CommandError(400,'Số dư VND phải là số nguyên.');
  return prisma.$transaction(async tx=>{
   const item=await tx.cashAccount.create({data:{companyId:user.companyId,accountCode:b.accountCode,name:b.name,kind:b.kind,currency:b.currency,bankName:b.bankName,accountNumber:b.accountNumber,holderName:b.holderName,openingDate:new Date(b.openingDate),openingBalance:b.openingBalance,balance:b.openingBalance,note:b.note}});
   await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:item.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:item.openingDate,kind:'OPENING',direction:'IN',currency:item.currency,amount:item.openingBalance,balanceAfter:item.balance,sourceId:item.id,description:'Số dư đầu kỳ do người dùng xác nhận'}});
   await audit(tx,user,'CASH_ACCOUNT_CREATE','CashAccount',item.id,null,item,'Khai báo tài khoản/quỹ và số dư đầu kỳ; không cộng thanh toán lịch sử');
   return {item,message:'Đã khai báo tài khoản và số dư đầu kỳ.'};
  });
 });
 app.post('/api/v1/cash-accounts/:id/update',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{
  const accountId=id(req.params),b=parse(metadata.extend({status:z.enum(['ACTIVE','INACTIVE']),expectedUpdatedAt:timestamp,openingBalance:z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/).optional(),openingReason:z.string().trim().min(10).max(2000).optional(),confirmed:z.literal(true).optional()}).strict().refine(v=>v.openingBalance===undefined||v.confirmed===true&&!!v.openingReason),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${user.companyId}::uuid AND id=${accountId}::uuid FOR UPDATE`;
   const old=await tx.cashAccount.findFirst({where:{companyId:user.companyId,id:accountId}});if(!old)throw new CommandError(404,'Không tìm thấy tài khoản.');unchanged(old,b.expectedUpdatedAt);bankFields({...b,kind:old.kind});
   const {expectedUpdatedAt,openingBalance,openingReason,confirmed,...fields}=b;
   const next=openingBalance===undefined?old.openingBalance:new Prisma.Decimal(openingBalance),delta=next.minus(old.openingBalance);
   if(old.currency==='VND'&&!next.isInteger())throw new CommandError(400,'Số dư VND phải là số nguyên.');
   if(old.balance.plus(delta).lt(0))throw new CommandError(409,'Điều chỉnh làm số dư tài khoản âm.');
   const item=await tx.cashAccount.update({where:{id:old.id},data:{...fields,...(!delta.isZero()?{openingBalance:next,balance:{increment:delta}}:{})}});
   if(!delta.isZero()){
    await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:old.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:old.openingDate,kind:'OPENING_ADJUSTMENT',direction:delta.gt(0)?'IN':'OUT',currency:old.currency,amount:delta.abs(),balanceAfter:item.balance,sourceId:crypto.randomUUID(),description:'Điều chỉnh số dư đầu kỳ · '+openingReason}});
    await audit(tx,user,'CASH_OPENING_ADJUST','CashAccount',item.id,{openingBalance:old.openingBalance,balance:old.balance},{openingBalance:item.openingBalance,balance:item.balance,delta},openingReason!);
   }
   await audit(tx,user,'CASH_ACCOUNT_EDIT','CashAccount',item.id,old,item,'Cập nhật thông tin/trạng thái tài khoản');return {item,message:'Đã cập nhật tài khoản.'};
  });
 });
 app.get('/api/v1/cash-balances',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{const companyId=req.auth!.companyId;const [total,count]=await prisma.$transaction([prisma.cashAccount.aggregate({where:{companyId,currency:'VND'},_sum:{balance:true}}),prisma.cashAccount.count({where:{companyId,currency:'VND'}})]);const groups=await prisma.cashAccount.groupBy({by:['kind'],where:{companyId,currency:'VND'},_sum:{balance:true},orderBy:{kind:'asc'}});return {vnd:count?total._sum.balance?.toFixed(0)??'0':null,bank:groups.find(g=>g.kind==='BANK')?._sum?.balance?.toFixed(0)??null,cash:groups.find(g=>g.kind==='CASH')?._sum?.balance?.toFixed(0)??null};});
 app.get('/api/v1/cash-entries',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).default(1),accountId:z.uuid().optional(),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional()}).strict(),req.query),companyId=req.auth!.companyId;
  const start=q.period?new Date(q.period+'-01'):undefined,end=start?new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)):undefined;
  const where={companyId,...(q.accountId?{cashAccountId:q.accountId}:{}),...(start?{entryDate:{gte:start,lt:end}}:{})};
  const [items,total,accounts]=await prisma.$transaction([prisma.cashEntry.findMany({where,include:{account:{select:{accountCode:true,name:true}}},orderBy:[{entryDate:'desc'},{createdAt:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),prisma.cashEntry.count({where}),prisma.cashAccount.findMany({where:{companyId},select:{id:true,accountCode:true,name:true,currency:true,balance:true},orderBy:{accountCode:'asc'},take:1000})]);return {items,total,page:q.page,accounts};
 });
}
