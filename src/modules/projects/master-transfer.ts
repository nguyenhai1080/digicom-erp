import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac} from 'node:crypto';
import {prisma} from '@erp/db';
import {compileMasterTransfer} from '@erp/db/dgc-master-transfer';
import {z} from 'zod';
import {sameSecret,type AuthConfig} from '../auth/access.js';
import {CommandError,parse,writeGuard} from './commands.js';
const hex=/^[a-f0-9]{64}$/;
const selection=z.object({bundle:z.unknown(),transferHash:z.string().regex(hex)}).strict();
class PreviewRollback extends Error{}
export async function masterTransferRoutes(app:FastifyInstance,config:AuthConfig){
 const access={preHandler:writeGuard('SYSTEM_CONFIG_EDIT',config),bodyLimit:2*1024*1024};
 async function target(req:FastifyRequest){
  const user=req.auth!;
  if(process.env.DGC_MASTER_TRANSFER_ENABLED!=='true'||config.defaultCompanyCode!=='DGC'||user.companyCode!=='DGC')throw new CommandError(404,'Chức năng nhập danh mục chưa bật.');
  if(!await prisma.userRole.findFirst({where:{userId:user.userId,role:{companyId:user.companyId,code:'ADMIN',status:'ACTIVE'}}}))throw new CommandError(403,'Chỉ quản trị DGC được nhập danh mục.');
  const pin=process.env.DGC_MASTER_TRANSFER_HASH;if(!hex.test(pin??''))throw new CommandError(503,'Chưa ghim gói danh mục đã duyệt.');
  let database:string,host:string;try{const u=new URL(process.env.DATABASE_URL??'');database=decodeURIComponent(u.pathname.slice(1));host=u.hostname;}catch{throw new CommandError(503,'DB đích chưa hợp lệ.');}
  if(database!=='dgc_erp_db'&&!(process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','[::1]'].includes(host)&&/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(database)))throw new CommandError(503,'Chức năng chỉ dành cho DB DGC riêng đã chốt.');
  return {pin:pin!,database,user};
 }
 function signature(payload:string){return createHmac('sha256',config.secret).update('dgc-master-preview:'+payload).digest('hex');}
 async function execute(req:FastifyRequest,apply:boolean){
  const {pin,database,user}=await target(req);
  const input=parse(apply?selection.extend({previewToken:z.string().max(2000),reason:z.string().trim().min(10).max(500)}):selection,req.body) as {bundle:unknown;transferHash:string;previewToken?:string;reason?:string};
  if(input.transferHash!==pin)throw new CommandError(409,'Gói danh mục khác bản được ghim trên host.');
  if(apply){
   try{const [payload,sig,...extra]=input.previewToken!.split('.'),proof=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8'));if(extra.length||!sig||!sameSecret(sig,signature(payload!))||proof.companyId!==user.companyId||proof.userId!==user.userId||proof.hash!==pin||!Number.isSafeInteger(proof.at)||Date.now()-proof.at>15*60*1000||proof.at>Date.now())throw Error();}catch{throw new CommandError(409,'Cần chạy kiểm tra lại trước khi nhập danh mục.');}
  }
  let plan:ReturnType<typeof compileMasterTransfer>;
  try{plan=compileMasterTransfer(input.bundle,{expectedDatabase:database,operatorEmail:user.email,expectedTransferHash:pin,commit:apply,reason:input.reason});}catch{throw new CommandError(409,'Gói danh mục không khớp bản đã duyệt.');}
  try{
   await prisma.$transaction(async tx=>{for(const sql of plan.statements)await tx.$executeRawUnsafe(sql);if(!apply)throw new PreviewRollback();},{isolationLevel:'Serializable',timeout:120000,maxWait:10000});
  }catch(e){if(!(e instanceof PreviewRollback))throw new CommandError(409,'Không thể nhập: DB, quyền, danh mục hoặc provenance đã thay đổi. Toàn bộ lượt nhập đã rollback.');}
  const summary={transferHash:pin,sourceSnapshotHash:plan.sourceSnapshotHash,counts:plan.counts,sourceRows:plan.sourceRows,financialPosting:false,committed:apply};
  if(apply)return summary;
  const payload=Buffer.from(JSON.stringify({companyId:user.companyId,userId:user.userId,hash:pin,at:Date.now()})).toString('base64url');return {...summary,previewToken:payload+'.'+signature(payload),rolledBack:true};
 }
 app.post('/api/v1/dgc-migration/masters/preview',access,req=>execute(req,false));
 app.post('/api/v1/dgc-migration/masters/apply',access,req=>execute(req,true));
}
