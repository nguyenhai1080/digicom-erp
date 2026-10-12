import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@erp/db';
import { requirePermission, type AuthConfig } from '../auth/access.js';
import { audit, CommandError, currency, date, money, parse, text, timestamp, unchanged, writeGuard } from './commands.js';
const optionalText=(max=500)=>z.string().trim().max(max).nullable().optional();
const rate=z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/);
const statuses=['DRAFT','ACTIVE','EXPIRED','TERMINATED','SUSPENDED'] as const;
const profile=z.object({contractName:text,contractNumber:optionalText(100),partnerId:z.uuid(),
  dgcDirection:z.enum(['Input','Output','Other']).default('Output'),serviceIds:z.array(z.uuid()).max(100).default([]),
  signingDate:date.nullable().optional(),effectiveDate:date.nullable().optional(),expiryDate:date.nullable().optional(),
  currency:currency.default('MZN'),revenueShareRate:rate.default('0'),fixedFee:money.default('0'),taxRate:rate.default('0'),
  paymentTermDays:z.number().int().min(0).max(3650).default(0),billingCycle:z.string().trim().min(1).max(100).default('Monthly'),
  status:z.enum(statuses).default('DRAFT'),ownerEmail:z.email().max(254).nullable().optional(),
  attachmentUrl:z.url().max(2000).refine(v=>/^https?:\/\//i.test(v)).nullable().optional(),notes:optionalText(4000)});
const datesValid=(v:{effectiveDate?:string|null;expiryDate?:string|null})=>!v.effectiveDate||!v.expiryDate||v.effectiveDate<=v.expiryDate;
const idOf=(v:unknown)=>parse(z.object({id:z.uuid()}).strict(),v).id;
const include={partner:{select:{id:true,partnerKey:true,legalName:true}},services:{include:{service:{select:{id:true,serviceKey:true,serviceName:true}}}}} as const;
async function availableCode(tx:Prisma.TransactionClient,companyId:string){
  for(let i=0;i<100;i++){
    const seq=await tx.sequence.upsert({where:{companyId_sequenceName:{companyId,sequenceName:'DGC_CONTRACT'}},
      create:{companyId,sequenceName:'DGC_CONTRACT',prefix:'CTR',padding:4,currentValue:1},update:{currentValue:{increment:1}}});
    const code=seq.prefix+seq.currentValue.toString().padStart(seq.padding,'0');
    if(!await tx.contract.findFirst({where:{companyId,contractCode:code}}))return code;
  }throw new CommandError(409,'Chưa thể cấp mã hợp đồng.');
}
async function references(tx:Prisma.TransactionClient,companyId:string,body:z.infer<typeof profile>){
  if(!await tx.partner.findFirst({where:{id:body.partnerId,companyId}}))throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
  const ids=[...new Set(body.serviceIds)];
  if(await tx.service.count({where:{id:{in:ids},companyId}})!==ids.length)throw new CommandError(404,'Không tìm thấy dịch vụ của công ty.');
  return ids;
}
function fields(body:z.infer<typeof profile>,email:string){
  const {serviceIds,...rest}=body;
  return {...rest,contractNumber:body.contractNumber||null,notes:body.notes||null,ownerEmail:body.ownerEmail||email,
    signingDate:body.signingDate?new Date(body.signingDate):null,effectiveDate:body.effectiveDate?new Date(body.effectiveDate):null,
    expiryDate:body.expiryDate?new Date(body.expiryDate):null,attachmentUrl:body.attachmentUrl||null};
}
async function synchronize(tx:Prisma.TransactionClient,companyId:string,contractId:string,ids:string[],body:z.infer<typeof profile>){
  // DGC preserves links removed from the selection and maps Draft links to Active.
  const sourceStatus=body.status==='DRAFT'?'ACTIVE':body.status;
  const status=sourceStatus==='ACTIVE'?'ACTIVE':sourceStatus==='SUSPENDED'?'SUSPENDED':'INACTIVE';
  const existing=await tx.contractService.findMany({where:{companyId,contractId}});
  for(const serviceId of ids){
    const old=existing.find(row=>row.serviceId===serviceId);
    const data={revenueShareRate:body.revenueShareRate,fixedFee:body.fixedFee,currency:body.currency,
      effectiveFrom:body.effectiveDate?new Date(body.effectiveDate):null,effectiveTo:body.expiryDate?new Date(body.expiryDate):null,
      dgcStatus:sourceStatus,status:status as 'ACTIVE'|'SUSPENDED'|'INACTIVE'};
    if(old)await tx.contractService.update({where:{id:old.id},data});
    else await tx.contractService.create({data:{...data,companyId,contractId,serviceId,businessModel:'REVENUE_SHARE'}});
  }
  await tx.contractService.updateMany({where:{companyId,contractId,serviceId:{notIn:ids}},data:{status:'INACTIVE',dgcStatus:'INACTIVE'}});
}
export async function serviceContractRoutes(app:FastifyInstance,config:AuthConfig){
  app.post('/api/v1/service-contracts/:id/delete',{preHandler:[writeGuard('CONTRACT_EDIT',config),requirePermission('CONTRACT_TERMINATE')]},async request=>{
    const body=parse(z.object({expectedUpdatedAt:timestamp,reason:text}).strict(),request.body);const user=request.auth!;const id=idOf(request.params);
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM contracts WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.contract.findFirst({where:{id,companyId:user.companyId,dgcDirection:{not:null}},include:{_count:{select:{
        childContracts:true,parties:true,items:true,services:true,terms:true,projectLinks:true,activationConditions:true,billingSchedules:true,
        paymentSchedules:true,adjustments:true,reconciliations:true,commercialTermSnapshots:true,revenues:true,invoiceScopes:true}},adjustmentImpact:true}});
      if(!old)throw new CommandError(404,'Không tìm thấy hợp đồng dịch vụ của công ty.');unchanged(old,body.expectedUpdatedAt);
      if(Object.values(old._count).some(n=>n>0)||old.adjustmentImpact||old.sourceProjectId||old.sourceQuotationId||old.officialDocumentId)
        throw new CommandError(409,'Hợp đồng có liên kết nghiệp vụ hoặc dịch vụ, kể cả Inactive. Hãy đổi trạng thái Terminated thay vì xóa.');
      await tx.contract.delete({where:{id}});await audit(tx,user,'CONTRACT_DELETE','Contract',id,old,null,body.reason);
    });return {success:true};
  });
  app.get('/api/v1/service-contracts',{preHandler:requirePermission('CONTRACT_VIEW')},async request=>{
    const q=parse(z.object({search:z.string().trim().max(200).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(statuses).optional()}).strict(),request.query);
    const where:Prisma.ContractWhereInput={companyId:request.auth!.companyId,dgcDirection:{not:null},...(q.status?{status:q.status}:{}),
      ...(q.search?{OR:[{contractCode:{contains:q.search,mode:'insensitive'}},{contractNumber:{contains:q.search,mode:'insensitive'}},{contractName:{contains:q.search,mode:'insensitive'}},{partner:{legalName:{contains:q.search,mode:'insensitive'}}},{partner:{partnerKey:{contains:q.search,mode:'insensitive'}}}]}:{})};
    const [items,total]=await prisma.$transaction([prisma.contract.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),prisma.contract.count({where})]);
    return {items,total,page:q.page,limit:10};
  });
  app.get('/api/v1/service-contracts/references',{preHandler:requirePermission('CONTRACT_VIEW')},async request=>{
    const companyId=request.auth!.companyId;
    const [partners,services]=await prisma.$transaction([prisma.partner.findMany({where:{companyId},select:{id:true,partnerKey:true,legalName:true,status:true},orderBy:{legalName:'asc'},take:1001}),
      prisma.service.findMany({where:{companyId},select:{id:true,serviceKey:true,serviceName:true,status:true},orderBy:{serviceName:'asc'},take:1001})]);
    if(partners.length>1000||services.length>1000)throw new CommandError(409,'Danh mục vượt giới hạn biểu mẫu; cần tìm kiếm theo trang trước khi chọn.');
    return {partners,services};
  });
  app.get('/api/v1/service-contracts/:id',{preHandler:requirePermission('CONTRACT_VIEW')},async request=>{
    const item=await prisma.contract.findFirst({where:{id:idOf(request.params),companyId:request.auth!.companyId,dgcDirection:{not:null}},include});
    if(!item)throw new CommandError(404,'Không tìm thấy hợp đồng dịch vụ của công ty.');return {item};
  });
  app.post('/api/v1/service-contracts',{preHandler:writeGuard('CONTRACT_CREATE',config)},async(request,reply)=>{
    const body=parse(profile.extend({contractCode:z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}_.-]+$/u).optional()}).strict().refine(datesValid),request.body);const user=request.auth!;
    const item=await prisma.$transaction(async tx=>{
      const ids=await references(tx,user.companyId,body);const {contractCode,...input}=body;
      const row=await tx.contract.create({data:{...fields(input,user.email),companyId:user.companyId,contractCode:contractCode??await availableCode(tx,user.companyId),
        businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',ownerUserId:user.userId,createdBy:user.email,updatedBy:user.email}});
      await synchronize(tx,user.companyId,row.id,ids,body);
      const item=await tx.contract.findUniqueOrThrow({where:{id:row.id},include});await audit(tx,user,'CONTRACT_CREATE','Contract',row.id,null,item);return item;
    });return reply.code(201).send({item});
  });
  app.post('/api/v1/service-contracts/:id/update',{preHandler:writeGuard('CONTRACT_EDIT',config)},async request=>{
    const body=parse(profile.extend({expectedUpdatedAt:timestamp,reason:text}).strict().refine(datesValid),request.body);const user=request.auth!;const id=idOf(request.params);
    const item=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM contracts WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.contract.findFirst({where:{id,companyId:user.companyId,dgcDirection:{not:null}},include});
      if(!old)throw new CommandError(404,'Không tìm thấy hợp đồng dịch vụ của công ty.');unchanged(old,body.expectedUpdatedAt);
      const ids=await references(tx,user.companyId,body);const {expectedUpdatedAt,reason,...input}=body;
      await tx.contract.update({where:{id},data:{...fields(input,user.email),updatedBy:user.email}});await synchronize(tx,user.companyId,id,ids,body);
      const item=await tx.contract.findUniqueOrThrow({where:{id},include});await audit(tx,user,'CONTRACT_EDIT','Contract',id,old,item,reason);return item;
    });return {item};
  });
}
