import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac} from 'node:crypto';
import {prisma} from '@erp/db';
import {transferEvidence,invoiceEvidenceRows} from '@erp/db/dgc-evidence-transfer';
import {z} from 'zod';
import {sameSecret,requirePermission,type AuthConfig} from '../auth/access.js';
import {CommandError,parse,writeGuard} from './commands.js';
const hex=/^[a-f0-9]{64}$/,selection=z.object({bundle:z.unknown(),bundleHash:z.string().regex(hex)}).strict();
class PreviewRollback extends Error{}
export async function evidenceTransferRoutes(app:FastifyInstance,config:AuthConfig){
 const access={preHandler:writeGuard('SYSTEM_CONFIG_EDIT',config),bodyLimit:16*1024*1024};
 async function target(req:FastifyRequest,write=true){
  const user=req.auth!;if(config.defaultCompanyCode!=='DGC'||user.companyCode!=='DGC'||write&&process.env.DGC_EVIDENCE_TRANSFER_ENABLED!=='true')throw new CommandError(404,'Chuyển kho nguồn DGC chưa bật.');
  if(!await prisma.userRole.findFirst({where:{userId:user.userId,role:{companyId:user.companyId,code:'ADMIN',status:'ACTIVE'}}}))throw new CommandError(403,'Chỉ quản trị DGC được chuyển và đối chiếu kho nguồn.');
  const pin=process.env.DGC_EVIDENCE_BUNDLE_HASH;if(!hex.test(pin??''))throw new CommandError(503,'Chưa ghim gói nguồn DGC.');
  let database:string,host:string;try{const u=new URL(process.env.DATABASE_URL??'');database=decodeURIComponent(u.pathname.slice(1));host=u.hostname;}catch{throw new CommandError(503,'DB đích chưa hợp lệ.');}
  if(database!=='dgc_erp_db'&&!(process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','[::1]'].includes(host)&&/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(database)))throw new CommandError(503,'Chỉ dùng DB DGC riêng đã chốt.');
  return {pin:pin!,database,user};
 }
 const signature=(payload:string)=>createHmac('sha256',config.secret).update('dgc-source-evidence-preview:'+payload).digest('hex');
 async function execute(req:FastifyRequest,apply:boolean){
  const {pin,database,user}=await target(req),input=parse(apply?selection.extend({previewToken:z.string().max(2000),reason:z.string().trim().min(10).max(500)}):selection,req.body) as {bundle:unknown;bundleHash:string;previewToken?:string;reason?:string};
  if(input.bundleHash!==pin)throw new CommandError(409,'Gói nguồn khác bản ghim trên host.');
  if(apply){try{const [payload,sig,...extra]=input.previewToken!.split('.'),proof=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8'));if(extra.length||!sig||!sameSecret(sig,signature(payload!))||proof.companyId!==user.companyId||proof.userId!==user.userId||proof.hash!==pin||!Number.isSafeInteger(proof.at)||Date.now()-proof.at>15*60*1000||proof.at>Date.now())throw Error();}catch{throw new CommandError(409,'Cần kiểm tra lại trước khi lưu kho nguồn.');}}
  let summary:Awaited<ReturnType<typeof transferEvidence>>|undefined;
  try{await prisma.$transaction(async tx=>{summary=await transferEvidence(tx,input.bundle,{expectedBundleHash:pin,expectedDatabase:database,companyId:user.companyId,operatorId:user.userId,reason:apply?input.reason!:'Rollback preview of pinned DGC source evidence'});if(!apply)throw new PreviewRollback();},{isolationLevel:'Serializable',timeout:120000,maxWait:10000});}catch(e){if(!(e instanceof PreviewRollback))throw new CommandError(409,'Kho nguồn, danh mục hoặc provenance không khớp. Toàn bộ lượt chuyển đã rollback.');}
  if(!summary)throw new CommandError(409,'Chưa kiểm tra được kho nguồn.');if(apply)return {...summary,committed:true};
  const payload=Buffer.from(JSON.stringify({companyId:user.companyId,userId:user.userId,hash:pin,at:Date.now()})).toString('base64url');return {...summary,committed:false,rolledBack:true,previewToken:payload+'.'+signature(payload)};
 }
 app.post('/api/v1/dgc-migration/evidence/preview',access,req=>execute(req,false));
 app.post('/api/v1/dgc-migration/evidence/apply',access,req=>execute(req,true));
 app.get('/api/v1/dgc-migration/evidence/status',{preHandler:requirePermission('SYSTEM_CONFIG_EDIT')},async req=>{
  const {pin,user}=await target(req,false),receipts=await prisma.auditLog.findMany({where:{companyId:user.companyId,traceId:pin,action:'DGC_SOURCE_EVIDENCE_TRANSFER'}});
  if(!receipts.length)return {available:false,transferEnabled:process.env.DGC_EVIDENCE_TRANSFER_ENABLED==='true',financialRecordsCreated:0};
  const j=receipts[0]?.newValue as any;if(receipts.length!==1||j?.bundleHash!==pin||!hex.test(j?.sourceSnapshotHash??''))throw new CommandError(409,'Biên nhận kho nguồn không khớp.');
  const stored=await prisma.dgcImportSnapshot.findUnique({where:{companyId_snapshotHash:{companyId:user.companyId,snapshotHash:j.sourceSnapshotHash}}});
  if(!stored||stored.rowCount!==j.rows||await prisma.dgcImportRow.count({where:{companyId:user.companyId,snapshotHash:j.sourceSnapshotHash}})!==j.rows)throw new CommandError(409,'Kho nguồn chưa đầy đủ.');
  return {available:true,transferEnabled:process.env.DGC_EVIDENCE_TRANSFER_ENABLED==='true',sourceSnapshotHash:j.sourceSnapshotHash,sourceRows:j.rows,tables:j.tables,masterLinksVerified:j.masterLinksVerified,financialRecordsCreated:0,sourceValuesChanged:false};
 });
 app.get('/api/v1/dgc-migration/evidence/invoices',{preHandler:requirePermission('SYSTEM_CONFIG_EDIT')},async req=>{
  const {pin,user}=await target(req,false),query=parse(z.object({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(100).default('')}).strict(),req.query),receipts=await prisma.auditLog.findMany({where:{companyId:user.companyId,traceId:pin,action:'DGC_SOURCE_EVIDENCE_TRANSFER'}}),receipt=receipts[0]?.newValue as any;
  if(receipts.length!==1||receipt?.bundleHash!==pin||!hex.test(receipt?.sourceSnapshotHash??''))throw new CommandError(409,'Chưa có biên nhận kho nguồn đầy đủ.');
  const stored=await prisma.dgcImportRow.findMany({where:{companyId:user.companyId,snapshotHash:receipt.sourceSnapshotHash,sheetName:'48_INVOICE_HEADER'}});let rows:any[];try{rows=invoiceEvidenceRows(stored,receipt);}catch{throw new CommandError(409,'Bằng chứng Invoice nguồn không khớp.');}
  const sourceCount=rows.length,q=query.q.toLowerCase();rows=rows.filter(r=>!q||r.invoiceNumber.toLowerCase().includes(q)||r.partnerKey.toLowerCase().includes(q));const total=rows.length,totalPages=Math.max(1,Math.ceil(total/10)),page=Math.min(query.page,totalPages);
  return {items:rows.slice((page-1)*10,page*10),page,pageSize:10,total,totalPages,sourceCount,sourceOnly:true,financialLedgerImported:false};
 });
}
