import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac} from 'node:crypto';
import {prisma} from '@erp/db';
import {verifyCapturedBook,capturedFilesReady,installCapturedFiles,transferCapturedBook} from '@erp/db/dgc-captured-book';
import {capturedUploadRoot,receiveCapturedChunk} from './captured-book-upload.js';
import {resolve} from 'node:path';
import {z} from 'zod';
import {sameSecret,requirePermission,type AuthConfig} from '../auth/access.js';
import {CommandError,parse,writeGuard} from './commands.js';
import {storageRoot} from './financial-documents.js';
import {linkInvoiceDocuments} from './invoice-cancel.js';
const hex=/^[a-f0-9]{64}$/,selection=z.object({bundle:z.unknown(),bundleHash:z.string().regex(hex)}).strict();
class PreviewRollback extends Error{}
export async function capturedBookTransferRoutes(app:FastifyInstance,config:AuthConfig){
 async function target(req:FastifyRequest,write=true){
  const user=req.auth!;
  if(config.defaultCompanyCode!=='DGC'||user.companyCode!=='DGC'||write&&process.env.DGC_CAPTURED_BOOK_ENABLED!=='true')throw new CommandError(404,'Nhập sổ DGC chưa bật.');
  if(!await prisma.userRole.findFirst({where:{userId:user.userId,role:{companyId:user.companyId,code:'ADMIN',status:'ACTIVE'}}}))throw new CommandError(403,'Chỉ quản trị DGC được nhập sổ.');
  const u=new URL(process.env.DATABASE_URL!),database=decodeURIComponent(u.pathname.slice(1));
  if(database!=='dgc_erp_db'&&!(process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(database)))throw new CommandError(503,'Cần DB DGC riêng.');
  return {user,database};
 }
 const sign=(payload:string)=>createHmac('sha256',config.secret).update('dgc-captured-book:'+payload).digest('hex');
 async function execute(req:FastifyRequest,apply:boolean){
  const {user,database}=await target(req),pin=process.env.DGC_CAPTURED_BOOK_HASH;
  if(!hex.test(pin??''))throw new CommandError(503,'Chưa ghim gói sổ cần chuyển.');
  const input=parse(apply?selection.extend({previewToken:z.string().max(2000)}):selection,req.body) as {bundle:unknown;bundleHash:string;previewToken?:string};
  if(input.bundleHash!==pin)throw new CommandError(409,'Gói sổ khác bản được ghim.');
  if(apply){try{const [payload,sig,...extra]=input.previewToken!.split('.'),p=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8'));if(extra.length||!sig||!sameSecret(sig,sign(payload!))||p.companyId!==user.companyId||p.userId!==user.userId||p.hash!==pin||!Number.isSafeInteger(p.at)||Date.now()-p.at>15*60*1000||p.at>Date.now())throw Error();}catch{throw new CommandError(409,'Cần chạy preview chuyển đủ dữ liệu trước khi nhập.');}}
  let summary:any;
  try{
   verifyCapturedBook(input.bundle,pin!);await capturedFilesReady(input.bundle,pin!,user.companyId,storageRoot());
   await prisma.$transaction(async tx=>{summary=await transferCapturedBook(tx,input.bundle,{expectedBundleHash:pin!,expectedDatabase:database,companyId:user.companyId,operatorId:user.userId,registerDocuments:linkInvoiceDocuments,reason:'Owner-directed full captured-book carry-forward; no historical validity audit or cash posting'});if(!apply)throw new PreviewRollback();},{isolationLevel:'Serializable',timeout:120000,maxWait:10000});
  }catch(e){if(!(e instanceof PreviewRollback)){req.log.error({err:e},'DGC captured book transfer failed');throw new CommandError(409,'Dữ liệu chuyển, chứng từ hoặc DB chưa khớp. Lượt nhập không ghi dở dang.');}}
  if(apply)return {...summary,committed:true};
  const payload=Buffer.from(JSON.stringify({companyId:user.companyId,userId:user.userId,hash:pin,at:Date.now()})).toString('base64url');
  return {...summary,committed:false,rolledBack:true,previewToken:payload+'.'+sign(payload)};
 }
 const access={preHandler:writeGuard('SYSTEM_CONFIG_EDIT',config),bodyLimit:24*1024*1024};
 app.post('/api/v1/dgc-migration/book/prepare',access,async req=>{
  const {user}=await target(req),input=parse(selection,req.body),pin=process.env.DGC_CAPTURED_BOOK_HASH;
  try{verifyCapturedBook(input.bundle,pin!);if(input.bundleHash!==pin)throw Error();}catch{throw new CommandError(409,'Gói sổ khác bản được ghim.');}
  const bundle=input.bundle as any,unique=new Map<string,{sha256:string;size:number}>();for(const f of bundle.documents)unique.set(f.sha256,{sha256:f.sha256,size:f.size});
  const at=Date.now(),files=[...unique.values()].map(f=>{const payload=Buffer.from(JSON.stringify({...f,companyId:user.companyId,userId:user.userId,hash:pin,at})).toString('base64url');return {...f,token:payload+'.'+sign(payload)};});
  return {bundleHash:pin,counts:bundle.counts,files};
 });
 app.post('/api/v1/dgc-migration/book/file',{...access,bodyLimit:2*1024*1024},async req=>{
  const {user}=await target(req),b=parse(z.object({token:z.string().max(3000),offset:z.number().int().nonnegative(),base64:z.string().max(1500000)}).strict(),req.body);let file:any;
  try{const [payload,sig,...extra]=b.token.split('.');file=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8'));if(extra.length||!sig||!sameSecret(sig,sign(payload!))||file.companyId!==user.companyId||file.userId!==user.userId||file.hash!==process.env.DGC_CAPTURED_BOOK_HASH||!Number.isSafeInteger(file.at)||Date.now()-file.at>60*60*1000||file.at>Date.now())throw Error();}catch{throw new CommandError(409,'Phiên chuyển chứng từ không khớp hoặc đã hết hạn.');}
  return receiveCapturedChunk(capturedUploadRoot(storageRoot(),user.companyId,file.hash),file,b.offset,b.base64);
 });
 app.post('/api/v1/dgc-migration/book/install-files',access,async req=>{
  const {user}=await target(req),input=parse(selection,req.body),pin=process.env.DGC_CAPTURED_BOOK_HASH;if(input.bundleHash!==pin)throw new CommandError(409,'Gói chuyển khác bản ghim.');
  return installCapturedFiles(input.bundle,pin!,user.companyId,resolve(capturedUploadRoot(storageRoot(),user.companyId,pin!),'blobs'),storageRoot());
 });
 app.post('/api/v1/dgc-migration/book/preview',access,req=>execute(req,false));
 app.post('/api/v1/dgc-migration/book/apply',access,req=>execute(req,true));
 app.get('/api/v1/dgc-migration/book/status',{preHandler:requirePermission('SYSTEM_CONFIG_EDIT')},async req=>{
  const {user}=await target(req,false),receipt=await prisma.auditLog.findFirst({where:{companyId:user.companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'},orderBy:{createdAt:'desc'}});
  return {importEnabled:process.env.DGC_CAPTURED_BOOK_ENABLED==='true',imported:!!receipt,receipt:receipt?.newValue??null};
 });
}
