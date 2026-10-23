import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@erp/db';
import { requirePermission, type AuthConfig } from '../auth/access.js';
import { audit, CommandError, text, timestamp, unchanged, writeGuard } from './commands.js';

const optionalText = (max = 500) => z.string().trim().max(max).nullable().optional();
const optionalEmail = z.union([z.email().max(254), z.literal('')]).nullable().optional();
const profile = z.object({
  legalName: text,
  partnerType: z.enum(['CUSTOMER','SUPPLIER','BOTH','OTHER']).default('OTHER'),
  partnerCategory: z.enum(['Telco','Content Provider','Aggregator','Vendor','Customer','Outsourcing','Other']).nullable().optional(),
  countryName: optionalText(100), paymentTermDays: z.number().int().min(0).max(3650).nullable().optional(),
  registrationNumber: optionalText(100), taxCode: optionalText(100), invoiceRecipient: optionalText(200),
  invoiceEmail: optionalEmail, email: optionalEmail, phone: optionalText(100), contactName: optionalText(200),
  status: z.enum(['ACTIVE','INACTIVE','BLACKLISTED','PROSPECT','SUSPENDED']).optional(),
  registeredAddress: optionalText(2000), billingAddress: optionalText(2000)
});
function parseProfile<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CommandError(400, 'Hồ sơ đối tác chưa hợp lệ. Kiểm tra tên, email, nhóm và số ngày thanh toán (0–3650).');
  return result.data;
}
const partnerCodeSchema=z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}_.-]+$/u);
function normalize(body: z.infer<typeof profile>, creating=false) {
  return {...body,partnerCategory:body.partnerCategory||'Other',countryName:body.countryName||(creating?'Mozambique':null),
    contactName:body.contactName||body.invoiceRecipient||null,invoiceRecipient:body.invoiceRecipient||body.contactName||null,
    email:body.email||body.invoiceEmail||null,invoiceEmail:body.invoiceEmail||body.email||null,
    billingAddress:body.billingAddress||body.registeredAddress||null,registeredAddress:body.registeredAddress||null,
    paymentTermDays:body.paymentTermDays??0,
    ...Object.fromEntries(['registrationNumber','taxCode','phone'].map(k=>[k,(body as Record<string,unknown>)[k]||null]))};
}
const idOf = (input: unknown) => parseProfile(z.object({ id: z.uuid() }).strict(), input).id;
async function availableCode(tx: Prisma.TransactionClient, companyId: string) {
  // Manual codes may already occupy a generated sequence value. Advance without overwriting.
  for (let i=0; i<100; i++) {
    const seq=await tx.sequence.upsert({where:{companyId_sequenceName:{companyId,sequenceName:'PARTNER'}},
      create:{companyId,sequenceName:'PARTNER',prefix:'PRT',padding:4,currentValue:1},update:{currentValue:{increment:1}}});
    const next=seq.prefix+seq.currentValue.toString().padStart(seq.padding,'0');
    if (!await tx.partner.findFirst({where:{companyId,OR:[{partnerKey:next},{partnerCode:next}]}})) return next;
  }
  throw new CommandError(409,'Chưa thể cấp mã tự động. Vui lòng nhập mã đối tác riêng.');
}
export async function partnerRoutes(app: FastifyInstance, config: AuthConfig) {
  app.get('/api/v1/partners', { preHandler: requirePermission('PARTNER_VIEW') }, async request => {
    const query = parseProfile(z.object({ search: z.string().trim().max(200).optional(), page: z.coerce.number().int().min(1).max(100000).optional(),
      status:z.enum(['ALL','ACTIVE','INACTIVE','PROSPECT','SUSPENDED','BLACKLISTED','ARCHIVED']).optional() }).strict(), request.query);
    const where: Prisma.PartnerWhereInput = {companyId:request.auth!.companyId,
      ...(query.status==='ALL'?{}:query.status?{status:query.status}:{status:{in:['ACTIVE','PROSPECT']}}),
      ...(query.search ? { OR:['legalName','partnerKey','partnerCode','taxCode','email','invoiceEmail'].map(key=>({[key]:{contains:query.search,mode:'insensitive'}})) } : {})};
    const limit=query.page ? 10 : 100;
    const [items,total] = await prisma.$transaction([
      prisma.partner.findMany({where,take:limit,skip:((query.page??1)-1)*limit,orderBy:[{legalName:'asc'},{id:'asc'}],
        select:{id:true,partnerKey:true,partnerCode:true,legalName:true,partnerType:true,partnerCategory:true,countryName:true,countryCode:true,taxCode:true,email:true,status:true}}),
      prisma.partner.count({where})
    ]);
    return {items,total,limit,page:query.page??1};
  });
  app.get('/api/v1/partners/:id', { preHandler: requirePermission('PARTNER_VIEW') }, async request => {
    const item=await prisma.partner.findFirst({where:{id:idOf(request.params),companyId:request.auth!.companyId}});
    if (!item) throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
    return {item};
  });
  app.post('/api/v1/partners', { preHandler: writeGuard('PARTNER_CREATE',config) }, async (request,reply) => {
    const body=parseProfile(profile.extend({partnerCode:partnerCodeSchema.optional(),partnerKey:partnerCodeSchema.optional()}).strict(),request.body);
    const {partnerCode,partnerKey,...fields}=body; const user=request.auth!;
    const item=await prisma.$transaction(async tx=>{
      const identity=partnerKey??partnerCode??await availableCode(tx,user.companyId);
      const item=await tx.partner.create({data:{...normalize(fields,true),status:fields.status??'ACTIVE',
        companyId:user.companyId,ownerUserId:user.userId,partnerKey:identity,partnerCode:partnerCode??identity,createdBy:user.email,updatedBy:user.email}});
      await audit(tx,user,'PARTNER_CREATE','Partner',item.id,null,item); return item;
    }); return reply.code(201).send({item});
  });
  app.post('/api/v1/partners/:id/update', { preHandler: writeGuard('PARTNER_EDIT',config) }, async request => {
    const body=parseProfile(profile.extend({partnerCode:partnerCodeSchema.optional(),expectedUpdatedAt:timestamp,reason:text}).strict(),request.body);
    const {expectedUpdatedAt,reason,partnerCode,...fields}=body; const user=request.auth!; const id=idOf(request.params);
    const item=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM partners WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.partner.findFirst({where:{id,companyId:user.companyId}});
      if (!old) throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
      unchanged(old,expectedUpdatedAt);
      if (old.status==='ARCHIVED') throw new CommandError(409,'Đối tác đã lưu trữ; không thể sửa hồ sơ.');
      const item=await tx.partner.update({where:{id},data:{...normalize(fields),status:fields.status??old.status,
        partnerCode:partnerCode??old.partnerCode,updatedBy:user.email}});
      await audit(tx,user,'PARTNER_EDIT','Partner',id,old,item,reason); return item;
    }); return {item};
  });
  app.post('/api/v1/partners/:id/delete',{preHandler:writeGuard('PARTNER_ARCHIVE',config)},async request=>{
    const body=parseProfile(z.object({expectedUpdatedAt:timestamp,reason:text}).strict(),request.body);const id=idOf(request.params);const user=request.auth!;
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM partners WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
      const old=await tx.partner.findFirst({where:{id,companyId:user.companyId},include:{_count:{select:{contacts:true,bankAccounts:true,partnerServices:true,
        contracts:true,contractParties:true,projects:true,quotations:true,reconciliations:true,revenues:true,invoiceScopes:true,outputReconUploads:true}}}});
      if(!old)throw new CommandError(404,'Không tìm thấy đối tác của công ty.');unchanged(old,body.expectedUpdatedAt);
      if(Object.values(old._count).some(n=>n>0))throw new CommandError(409,'Đối tác đã có liên kết nghiệp vụ hoặc hồ sơ liên quan. Chuyển sang Inactive thay vì xóa.');
      const {_count,...snapshot}=old;await tx.partner.delete({where:{id}});await audit(tx,user,'PARTNER_DELETE','Partner',id,snapshot,null,body.reason);
    });return {deleted:true};
  });
}
