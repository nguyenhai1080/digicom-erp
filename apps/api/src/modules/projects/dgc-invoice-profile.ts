import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,parse,timestamp,writeGuard} from './commands.js';
import {sha} from './financial-documents.js';
const line=z.string().trim().min(1).max(250),optional=z.string().trim().max(250);
export const dgcInvoiceProfile=z.object({issuerName:line,address:z.string().trim().min(1).max(2000),phone:optional,fax:optional,email:z.email().max(250),website:optional,taxCode:optional,bank:z.object({beneficiary:line,account:line,bankName:line,bankAddress:line,swift:line}).strict(),signatureName:line,signatureTitle:line}).strict();
export type DgcInvoiceProfile=z.infer<typeof dgcInvoiceProfile>;
const configKey='DGC_INVOICE_PROFILE_V1';
export async function readDgcInvoiceProfile(tx:Prisma.TransactionClient,companyId:string){
 const row=await tx.configuration.findUnique({where:{companyId_configKey:{companyId,configKey}}});
 if(!row||row.isSecret||!row.configValue)throw new CommandError(409,'Chưa có cấu hình pháp nhân và thanh toán Invoice DGC. Cập nhật trong Tài sản công ty.');
 let parsed:{version:number;profile:DgcInvoiceProfile};
 try{parsed=z.object({version:z.number().int().positive(),profile:dgcInvoiceProfile}).strict().parse(JSON.parse(row.configValue));}catch{throw new CommandError(409,'Cấu hình Invoice DGC chưa hợp lệ.');}
 return {profile:parsed.profile,metadata:{id:row.id,version:parsed.version,checksum:sha(row.configValue)},updatedAt:row.updatedAt};
}
export async function dgcInvoiceProfileRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/company/invoice-profile',{preHandler:requirePermission('SYSTEM_CONFIG_EDIT')},async request=>{
  if(request.auth!.companyCode!=='DGC')throw new CommandError(409,'Cấu hình này dành cho DGC.');
  const row=await prisma.configuration.findUnique({where:{companyId_configKey:{companyId:request.auth!.companyId,configKey}}});
  return row?prisma.$transaction(tx=>readDgcInvoiceProfile(tx,request.auth!.companyId)):{profile:null,metadata:null,updatedAt:null};
 });
 app.post('/api/v1/company/invoice-profile',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async request=>{
  const b=parse(z.object({profile:dgcInvoiceProfile,expectedUpdatedAt:timestamp.nullable(),reason:z.string().trim().min(1).max(500)}).strict(),request.body),user=request.auth!;
  if(user.companyCode!=='DGC')throw new CommandError(409,'Cấu hình này dành cho DGC.');
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   const old=await tx.configuration.findUnique({where:{companyId_configKey:{companyId:user.companyId,configKey}}});
   if((old?.updatedAt.toISOString()??null)!==b.expectedUpdatedAt)throw new CommandError(409,'Cấu hình đã thay đổi. Tải lại trước khi lưu.');
   let version=1;if(old)version=(await readDgcInvoiceProfile(tx,user.companyId)).metadata.version+1;
   const configValue=JSON.stringify({version,profile:b.profile});
   const row=await tx.configuration.upsert({where:{companyId_configKey:{companyId:user.companyId,configKey}},create:{companyId:user.companyId,configKey,configValue,valueType:'JSON',isSecret:false},update:{configValue}});
   await audit(tx,user,'DGC_INVOICE_PROFILE','Configuration',row.id,old?{configValue:old.configValue}:null,{version,profile:b.profile},b.reason);
   return readDgcInvoiceProfile(tx,user.companyId);
  });
 });
}
