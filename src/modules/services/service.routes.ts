import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@erp/db';
import { requirePermission, type AuthConfig } from '../auth/access.js';
import { audit, CommandError, date, parse, text, timestamp, unchanged, writeGuard } from '../projects/commands.js';

const categories = ['Basic','Application','Content','Utility','Other'] as const;
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const key = z.string().trim().min(1).max(100);
const profile = z.object({
  serviceName: text, dgcCategory: z.enum(categories).default('Other'),
  keyword: optionalText(500), description: optionalText(4000),
  status: z.enum(['ACTIVE','INACTIVE','SUSPENDED']).default('ACTIVE'),
  startDate: date.nullable().optional(), endDate: date.nullable().optional()
});
const idOf = (value: unknown) => parse(z.object({id:z.uuid()}).strict(), value).id;
function fields(body: z.infer<typeof profile>) {
  return {...body, keyword:body.keyword||null, description:body.description||null,
    startDate:body.startDate?new Date(body.startDate+'T00:00:00Z'):null,
    endDate:body.endDate?new Date(body.endDate+'T00:00:00Z'):null};
}
async function nextKey(tx: Prisma.TransactionClient, companyId:string) {
  for(let i=0;i<100;i++) {
    const seq=await tx.sequence.upsert({where:{companyId_sequenceName:{companyId,sequenceName:'SERVICE'}},
      create:{companyId,sequenceName:'SERVICE',prefix:'SVC',padding:4,currentValue:1},update:{currentValue:{increment:1}}});
    // DGC v61 uses SVC0001, without the separator used by Project codes.
    const candidate=seq.prefix+seq.currentValue.toString().padStart(seq.padding,'0');
    if(!await tx.service.findFirst({where:{companyId,OR:[{serviceKey:candidate},{serviceCode:candidate}]}}))return candidate;
  }
  throw new CommandError(409,'Chưa thể cấp mã dịch vụ tự động. Vui lòng nhập mã riêng.');
}
export async function serviceRoutes(app:FastifyInstance, config:AuthConfig) {
  app.addHook('onSend',async(_request,reply,payload)=>{reply.header('Cache-Control','no-store');return payload;});
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof CommandError)return reply.code(error.statusCode).send({message:error.message});
    if(error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2003','P2034','P2028'].includes(error.code))
      return reply.code(409).send({message:'Mã bị trùng, dữ liệu vừa thay đổi hoặc dịch vụ đã có liên kết. Tải lại và thử lại.'});
    request.log.error({err:error},'Service command failed');
    const status=typeof error==='object'&&error&&'statusCode'in error&&typeof error.statusCode==='number'?error.statusCode:500;
    return reply.code(status>=400&&status<500?status:500).send({message:'Không thể xử lý yêu cầu.'});
  });
  app.get('/api/v1/services',{preHandler:requirePermission('SERVICE_VIEW')},async request=>{
    const q=parse(z.object({search:z.string().trim().max(200).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),
      status:z.enum(['ACTIVE','INACTIVE','SUSPENDED','ARCHIVED']).optional()}).strict(),request.query);
    const where:Prisma.ServiceWhereInput={companyId:request.auth!.companyId,...(q.status?{status:q.status}:{}),
      ...(q.search?{OR:['serviceKey','serviceCode','serviceName','keyword'].map(k=>({[k]:{contains:q.search,mode:'insensitive'}}))}:{})};
    const [items,total]=await prisma.$transaction([
      prisma.service.findMany({where,take:50,skip:(q.page-1)*50,orderBy:[{serviceName:'asc'},{id:'asc'}]}),prisma.service.count({where})
    ]);return {items,total,page:q.page,limit:50};
  });
  app.get('/api/v1/services/:id',{preHandler:requirePermission('SERVICE_VIEW')},async request=>{
    const item=await prisma.service.findFirst({where:{id:idOf(request.params),companyId:request.auth!.companyId}});
    if(!item)throw new CommandError(404,'Không tìm thấy dịch vụ của công ty.');return {item};
  });
  app.post('/api/v1/services',{preHandler:writeGuard('SERVICE_CREATE',config)},async(request,reply)=>{
    const body=parse(profile.extend({serviceCode:key.optional(),serviceKey:key.optional()}).strict(),request.body);
    const {serviceCode,serviceKey,...rest}=body;const user=request.auth!;
    const item=await prisma.$transaction(async tx=>{
      const identity=serviceKey??serviceCode??await nextKey(tx,user.companyId);
      const item=await tx.service.create({data:{...fields(rest),companyId:user.companyId,serviceKey:identity,
        serviceCode:serviceCode??identity,category:'OTHER',createdBy:user.email,updatedBy:user.email}});
      await audit(tx,user,'SERVICE_CREATE','Service',item.id,null,item);return item;
    });return reply.code(201).send({item});
  });
  app.post('/api/v1/services/:id/update',{preHandler:writeGuard('SERVICE_EDIT',config)},async request=>{
    const body=parse(profile.extend({serviceCode:key.optional(),expectedUpdatedAt:timestamp,reason:text}).strict(),request.body);
    const {expectedUpdatedAt,reason,serviceCode,...rest}=body;const id=idOf(request.params);const user=request.auth!;
    const item=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM services WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.service.findFirst({where:{id,companyId:user.companyId}});
      if(!old)throw new CommandError(404,'Không tìm thấy dịch vụ của công ty.');unchanged(old,expectedUpdatedAt);
      if(old.status==='ARCHIVED')throw new CommandError(409,'Dịch vụ đã lưu trữ; không thể sửa hồ sơ.');
      const item=await tx.service.update({where:{id},data:{...fields(rest),serviceCode:serviceCode??old.serviceKey,updatedBy:user.email}});
      await audit(tx,user,'SERVICE_EDIT','Service',id,old,item,reason);return item;
    });return {item};
  });
  app.post('/api/v1/services/:id/delete',{preHandler:writeGuard('SERVICE_ARCHIVE',config)},async request=>{
    const body=parse(z.object({expectedUpdatedAt:timestamp,reason:text}).strict(),request.body);const id=idOf(request.params);const user=request.auth!;
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM services WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.service.findFirst({where:{id,companyId:user.companyId},include:{_count:{select:{partnerServices:true,contractItems:true,
        contractServices:true,quotationItems:true,parentRelationships:true,childRelationships:true,reconciliationItems:true,commercialTermSnapshots:true,revenues:true,outputReconUploads:true}}}});
      if(!old)throw new CommandError(404,'Không tìm thấy dịch vụ của công ty.');unchanged(old,body.expectedUpdatedAt);
      if(Object.values(old._count).some(n=>n>0))throw new CommandError(409,'Dịch vụ đã có liên kết nghiệp vụ. Chuyển sang Inactive hoặc Suspended thay vì xóa.');
      const {_count,...snapshot}=old;
      await tx.service.delete({where:{id}});await audit(tx,user,'SERVICE_DELETE','Service',id,snapshot,null,body.reason);
    });return {deleted:true};
  });
}
