import {assertReconDeletion} from './draft-deletion.js';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,readFile,unlink} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard,unchanged,timestamp} from './commands.js';
import {parseReconIdentity,matchReconIdentity} from './recon-identity.js';
import {readReconPdf,previewReconPage} from './recon-reader.js';
import {parseReconFinancial} from './recon-financial.js';
const MAX=5*1024*1024;
const month=z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
const selection=z.object({partnerId:z.uuid(),serviceId:z.uuid(),period:month});
const pdfInput=z.object({filename:z.string().trim().min(5).max(180).regex(/\.pdf$/i).refine(v=>!/[\x00-\x1f\x7f\\/:"<>|?*]/.test(v)),base64:z.string().min(8).max(Math.ceil(MAX/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/)});
function pdfBytes(base64:string){const data=Buffer.from(base64,'base64');if(data.length>MAX||data.toString('base64')!==base64||!/^%PDF-[12]\.\d/.test(data.subarray(0,8).toString('ascii'))||!data.subarray(-1024).toString('ascii').includes('%%EOF'))throw new CommandError(400,'Chọn PDF hợp lệ tối đa 5 MB.');return data;}
const checksum=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export function normalizeReconService(value:string){return value.trim().replace(/\s*[-–—]\s*/g,'-').replace(/\s+/g,'_').replace(/_*-_*/g,'-').replace(/__+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();}
function root(){
 if(process.env.STORAGE_PROVIDER&&process.env.STORAGE_PROVIDER!=='local')throw new CommandError(503,'Kho PDF cần lưu trữ local.');
 const path=process.env.STORAGE_ROOT??'./storage';
 if(process.env.NODE_ENV==='production'&&!isAbsolute(path))throw new CommandError(503,'Kho PDF chưa được cấu hình.');return resolve(path);
}
export async function preflight(tx:Prisma.TransactionClient,companyId:string,input:z.infer<typeof selection>){
 const s={partnerId:input.partnerId,serviceId:input.serviceId,period:input.period};
 const partner=await tx.partner.findFirst({where:{id:s.partnerId,companyId},select:{id:true,partnerKey:true,legalName:true}});
 const service=await tx.service.findFirst({where:{id:s.serviceId,companyId},select:{id:true,serviceKey:true,serviceName:true}});
 if(!partner||!service)throw new CommandError(404,'Không tìm thấy đối tác hoặc dịch vụ của công ty.');
 const start=new Date(s.period+'-01');const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
 const active={notIn:['SUPERSEDED','CANCELLED','REJECTED'] as ('SUPERSEDED'|'CANCELLED'|'REJECTED')[]};
 const uploads=await tx.outputReconUpload.findMany({where:{companyId,...s,status:active},select:{id:true,uploadCode:true,status:true,updatedAt:true},orderBy:{id:'asc'}});
 const reconciliations=await tx.reconciliation.findMany({where:{companyId,partnerId:s.partnerId,isCurrent:true,status:active,
  periodStart:{lte:end},periodEnd:{gte:start},OR:[{items:{some:{serviceId:s.serviceId}}},{items:{none:{}}}]},select:{id:true,reconCode:true,status:true,updatedAt:true},orderBy:{id:'asc'}});
 // Financial provenance is incomplete until native Invoice/Payment parity exists.
 // A current scope for this partner/period blocks intake, even with broken service links.
 const invoiceScopes=await tx.invoiceScope.findMany({where:{companyId,partnerId:s.partnerId,isCurrent:true,status:{notIn:['SUPERSEDED','CANCELLED']},
  periodStart:{lte:end},periodEnd:{gte:start}},select:{id:true,scopeCode:true,status:true,updatedAt:true},orderBy:{id:'asc'}});
 const contracts=await tx.contract.findMany({where:{companyId,partnerId:s.partnerId,dgcDirection:'Output',status:'ACTIVE',
  AND:[{OR:[{effectiveDate:null},{effectiveDate:{lte:end}}]},{OR:[{expiryDate:null},{expiryDate:{gte:start}}]}],
  services:{some:{serviceId:s.serviceId,dgcStatus:'ACTIVE'}}},select:{id:true,contractCode:true,contractNumber:true,contractName:true,updatedAt:true},orderBy:{id:'asc'}});
 const businessKey=[partner.partnerKey.trim().toUpperCase(),normalizeReconService(service.serviceKey),s.period].join('|');
 const snapshot={businessKey,uploads,reconciliations,invoiceScopes,contracts};
 const action=invoiceScopes.length?'BLOCK_FINANCIAL_DEPENDENCY':uploads.length||reconciliations.length?'CONFIRM_REPLACE':'ALLOW_INTAKE';
 return {...snapshot,partner,service,action,fingerprint:checksum(JSON.stringify(snapshot)),
  message:invoiceScopes.length?'Đã có hồ sơ Invoice trong kỳ này. Chưa thể xác minh toàn bộ payment; không nhận bản thay thế.':
  uploads.length||reconciliations.length?'Đã có PDF hoặc đối soát cùng đối tác, dịch vụ và kỳ. Bản mới chỉ được nhận để kiểm tra; lịch sử cũ được giữ nguyên.':
  'Có thể nhận PDF để kiểm tra. Nội dung, dịch vụ và kỳ trên PDF phải được xác minh trước khi chốt doanh thu.'};
}
const include={partner:{select:{partnerKey:true,legalName:true}},service:{select:{serviceKey:true,serviceName:true}},
 attachment:{select:{originalFilename:true,checksumSha256:true,fileSize:true}},createdBy:{select:{fullName:true}}} as const;
const dto=(item:any)=>{const {rawText,extractionData,...rest}=item;return {...rest,attachment:{...item.attachment,fileSize:Number(item.attachment.fileSize)}};};
export async function sourceBytes(item:{companyId:string;status?:string;attachment:any}){
 if(item.status==='CANCELLED')throw new CommandError(404,'PDF đã xóa.');
 const a=item.attachment,expected=`output-recon/${item.companyId}/${a.id}.pdf`;
 if(a.companyId!==item.companyId||a.storageProvider!=='local'||a.storagePath!==expected||a.storedFilename!==a.id+'.pdf')throw new CommandError(409,'Tệp không có đường dẫn kho hợp lệ.');
 let data:Buffer;try{const file=resolve(root(),expected),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX||BigInt(stat.size)!==a.fileSize)throw new Error('Invalid file');data=await readFile(file);}catch{throw new CommandError(409,'Tệp PDF không còn truy cập được.');}
 if(BigInt(data.length)!==a.fileSize||checksum(data)!==a.checksumSha256)throw new CommandError(409,'PDF đã thay đổi; không thể sử dụng.');return data;
}
export async function assessment(tx:Prisma.TransactionClient,item:{companyId:string;partnerId:string;serviceId:string;period:string},parsed:ReturnType<typeof parseReconIdentity>){
 const services=await tx.service.findMany({where:{companyId:item.companyId},select:{id:true,serviceKey:true,serviceCode:true,serviceName:true,keyword:true},take:1001});
 if(services.length>1000)throw new CommandError(409,'Danh mục vượt giới hạn kiểm tra dịch vụ.');
 const identity=matchReconIdentity(parsed,item,services),check=await preflight(tx,item.companyId,item);
 const key=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const contracts=check.contracts.filter(c=>!!parsed.agreementNo&&!!c.contractNumber&&key(c.contractNumber)===key(parsed.agreementNo));
 return {identity,contracts,contractState:contracts.length===1?'MATCHED':contracts.length>1?'AMBIGUOUS':'UNMATCHED',financialBlocked:check.action==='BLOCK_FINANCIAL_DEPENDENCY',financialMessage:check.action==='BLOCK_FINANCIAL_DEPENDENCY'?check.message:null};
}
export async function outputReconRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/output-recon/inspect',{bodyLimit:7*1024*1024,onRequest:writeGuard('RECON_UPLOAD',config)},async request=>{
  if(!request.auth!.permissions.includes('RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát để đọc PDF.');
  const body=parse(pdfInput.extend({partnerId:z.uuid()}).strict(),request.body),companyId=request.auth!.companyId;
  if(!await prisma.partner.findFirst({where:{companyId,id:body.partnerId},select:{id:true}}))throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
  const data=pdfBytes(body.base64),extracted=await readReconPdf(data),parsed=parseReconIdentity(extracted.text);
  const services=await prisma.service.findMany({where:{companyId},select:{id:true,serviceKey:true,serviceCode:true,serviceName:true,keyword:true},take:1001});
  if(services.length>1000)throw new CommandError(409,'Danh mục vượt giới hạn kiểm tra dịch vụ.');
  const matched=services.filter(s=>matchReconIdentity(parsed,{serviceId:s.id,period:parsed.period},services).state==='MATCHED');
  if(matched.length!==1||!parsed.period)return {sourceChecksum:checksum(data),parsed,selection:null,preflight:null,message:'Không xác định duy nhất dịch vụ/kỳ từ PDF. Kiểm tra bản gốc và danh mục trước khi upload.'};
  const selected={partnerId:body.partnerId,serviceId:matched[0].id,period:parsed.period};
  const check=await prisma.$transaction(tx=>preflight(tx,companyId,selected),{isolationLevel:'RepeatableRead'});
  return {sourceChecksum:checksum(data),parsed,selection:selected,preflight:check,message:check.message};
 });
 app.get('/api/v1/output-recon/references',{preHandler:requirePermission('RECON_VIEW')},async request=>{
  const companyId=request.auth!.companyId;const [partners,services]=await prisma.$transaction([
   prisma.partner.findMany({where:{companyId},select:{id:true,partnerKey:true,legalName:true},orderBy:{legalName:'asc'},take:1001}),
   prisma.service.findMany({where:{companyId},select:{id:true,serviceKey:true,serviceName:true},orderBy:{serviceName:'asc'},take:1001})]);
  if(partners.length>1000||services.length>1000)throw new CommandError(409,'Danh mục vượt giới hạn; cần bộ chọn tìm kiếm theo trang.');return {partners,services};
 });
 app.get('/api/v1/output-recon/preflight',{preHandler:requirePermission('RECON_UPLOAD')},async request=>{
  const s=parse(selection.strict(),request.query);return prisma.$transaction(tx=>preflight(tx,request.auth!.companyId,s),{isolationLevel:'RepeatableRead'});
 });
 app.get('/api/v1/output-recon/uploads',{preHandler:requirePermission('RECON_VIEW')},async request=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),period:month.optional(),search:z.string().trim().max(200).optional()}).strict(),request.query);
  const where:Prisma.OutputReconUploadWhereInput={companyId:request.auth!.companyId,status:{not:'CANCELLED'},...(q.period?{period:q.period}:{}),...(q.search?{OR:[{uploadCode:{contains:q.search,mode:'insensitive'}},{partner:{legalName:{contains:q.search,mode:'insensitive'}}},{partner:{partnerKey:{contains:q.search,mode:'insensitive'}}},{service:{serviceName:{contains:q.search,mode:'insensitive'}}}]}:{})};
  const [items,total]=await prisma.$transaction([prisma.outputReconUpload.findMany({where,include,take:10,skip:(q.page-1)*10,orderBy:[{createdAt:'desc'},{id:'asc'}]}),prisma.outputReconUpload.count({where})]);return {items:items.map(dto),total,page:q.page,limit:10};
 });
 app.post('/api/v1/output-recon/uploads',{bodyLimit:7*1024*1024,onRequest:writeGuard('RECON_UPLOAD',config)},async(request,reply)=>{
  if(!request.auth!.permissions.includes('RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát để nhận PDF.');
  const body=parse(selection.extend({filename:z.string().trim().min(5).max(180).regex(/\.pdf$/i).refine(v=>!/[\x00-\x1f\x7f\\/:"<>|?*]/.test(v)),
   base64:z.string().min(8).max(Math.ceil(MAX/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmNewVersion:z.boolean().default(false)}).strict(),request.body);
  const user=request.auth!,s={partnerId:body.partnerId,serviceId:body.serviceId,period:body.period};
  const data=Buffer.from(body.base64,'base64');if(data.length>MAX||data.toString('base64')!==body.base64||!/^%PDF-[12]\.\d/.test(data.subarray(0,8).toString('ascii'))||!data.subarray(-1024).toString('ascii').includes('%%EOF'))throw new CommandError(400,'Chọn PDF hợp lệ tối đa 5 MB.');
  const hash=checksum(data),attachmentId=randomUUID(),relative=`output-recon/${user.companyId}/${attachmentId}.pdf`,file=resolve(root(),relative);let created=false;
  try{
   const item=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+'|'+s.partnerId+'|'+s.serviceId+'|'+s.period},0))`;
    const check=await preflight(tx,user.companyId,s);
    if(check.fingerprint!==body.fingerprint)throw new CommandError(409,'Dữ liệu đối soát đã thay đổi. Kiểm tra lại trước khi tải PDF.');
    if(check.action==='BLOCK_FINANCIAL_DEPENDENCY')throw new CommandError(409,check.message);
    if(check.action==='CONFIRM_REPLACE'&&!body.confirmNewVersion)throw new CommandError(409,'Cần xác nhận nhận bản mới để kiểm tra, giữ nguyên lịch sử cũ.');
    if(await tx.outputReconUpload.findFirst({where:{companyId:user.companyId,...s,status:{not:'CANCELLED'},attachment:{checksumSha256:hash}}}))throw new CommandError(409,'PDF này đã được nhận cho cùng đối tác, dịch vụ và kỳ.');
    await mkdir(resolve(root(),'output-recon',user.companyId),{recursive:true,mode:0o700});const handle=await open(file,'wx',0o600);created=true;
    try{await handle.writeFile(data);}finally{await handle.close();}
    await tx.attachment.create({data:{id:attachmentId,companyId:user.companyId,originalFilename:body.filename,storedFilename:attachmentId+'.pdf',storageProvider:'local',storagePath:relative,mimeType:'application/pdf',fileSize:BigInt(data.length),checksumSha256:hash,uploadedById:user.userId}});
    const seq=await tx.sequence.upsert({where:{companyId_sequenceName:{companyId:user.companyId,sequenceName:'DGC_RECON_UPLOAD'}},create:{companyId:user.companyId,sequenceName:'DGC_RECON_UPLOAD',prefix:'RUP',padding:4,currentValue:1},update:{currentValue:{increment:1}}});
    const uploadCode=seq.prefix+seq.currentValue.toString().padStart(seq.padding,'0');
    const item=await tx.outputReconUpload.create({data:{companyId:user.companyId,...s,businessKey:check.businessKey,attachmentId,uploadCode,createdById:user.userId,
     replacementContext:{requested:body.confirmNewVersion,fingerprint:check.fingerprint,uploadIds:check.uploads.map(v=>v.id),reconciliationIds:check.reconciliations.map(v=>v.id),identityVerified:false}},include});
    const result=dto(item);await audit(tx,user,'RECON_UPLOAD','OutputReconUpload',item.id,null,result);return result;
   },{timeout:15000});return reply.code(201).send({item});
  }catch(error){if(created)try{await unlink(file);}catch(cleanupError){request.log.error({err:cleanupError,attachmentId},'Recon file rollback failed');}throw error;}
 });
 app.get('/api/v1/output-recon/uploads/:id',{preHandler:requirePermission('RECON_VIEW')},async request=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params);const item=await prisma.outputReconUpload.findFirst({where:{id,companyId:request.auth!.companyId},include});if(!item||item.status==='CANCELLED')throw new CommandError(404,'Không tìm thấy PDF đối soát của công ty.');
  const parsed=item.rawText?parseReconIdentity(item.rawText):null;
  const current=parsed?await prisma.$transaction(tx=>assessment(tx,item,parsed),{isolationLevel:'RepeatableRead'}):null;
  return {item:dto(item),rawText:item.rawText,extractionData:item.extractionData,parsed,assessment:current};
 });
 app.post('/api/v1/output-recon/uploads/:id/delete',{onRequest:writeGuard('RECON_CANCEL',config)},async request=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),body=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),request.body),user=request.auth!;
  return prisma.$transaction(async tx=>{
   const initial=await tx.outputReconUpload.findFirst({where:{id,companyId:user.companyId}});if(!initial)throw new CommandError(404,'Không tìm thấy PDF của công ty.');
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+'|FINANCE|'+initial.partnerId+'|'+initial.period},0))`;
   await tx.$queryRaw`SELECT id FROM output_recon_uploads WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const item=await tx.outputReconUpload.findFirstOrThrow({where:{id,companyId:user.companyId}});unchanged(item,body.expectedUpdatedAt);
   const linked=await tx.reconciliation.findFirst({where:{companyId:user.companyId,sourceAttachmentId:item.attachmentId}});
   const document=await tx.document.findFirst({where:{companyId:user.companyId,entityType:'OutputReconUpload',entityId:id}});
   assertReconDeletion(item.status,!!linked||!!document||!!(item.extractionData as any)?.finalization);
   await tx.outputReconUpload.update({where:{id},data:{status:'CANCELLED'}});
   await audit(tx,user,'RECON_DELETE_UNAPPROVED','OutputReconUpload',id,{uploadCode:item.uploadCode,status:item.status,attachmentId:item.attachmentId},{status:'CANCELLED'},'User confirmed; retain original file and extraction for audit');
   return {message:'Đã xóa PDF chưa duyệt khỏi danh sách. Có thể upload lại; lịch sử được lưu để kiểm tra.'};
  });
 });
 app.post('/api/v1/output-recon/uploads/:id/read',{onRequest:writeGuard('RECON_UPLOAD',config)},async request=>{
  if(!request.auth!.permissions.includes('RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát để đọc PDF.');
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),body=parse(z.object({expectedUpdatedAt:timestamp,forceOcr:z.boolean().default(false)}).strict(),request.body),user=request.auth!;
  const old=await prisma.outputReconUpload.findFirst({where:{id,companyId:user.companyId},include:{attachment:true}});if(!old)throw new CommandError(404,'Không tìm thấy PDF đối soát của công ty.');unchanged(old,body.expectedUpdatedAt);
  if(!['UPLOADED','OCR_EXTRACTED','UNDER_REVIEW'].includes(old.status))throw new CommandError(409,'Trạng thái PDF không cho phép đọc lại.');
  const extracted=await readReconPdf(await sourceBytes(old),body.forceOcr),parsed=parseReconIdentity(extracted.text);
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM output_recon_uploads WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const current=await tx.outputReconUpload.findFirstOrThrow({where:{id,companyId:user.companyId},include:{attachment:true}});unchanged(current,body.expectedUpdatedAt);if(!['UPLOADED','OCR_EXTRACTED','UNDER_REVIEW'].includes(current.status))throw new CommandError(409,'PDF đã đổi trạng thái; không đọc lại.');
   if(current.attachment.checksumSha256!==old.attachment.checksumSha256)throw new CommandError(409,'PDF đã thay đổi. Tải lại trước khi đọc.');await sourceBytes(current);
   const evaluated=await assessment(tx,current,parsed),{text,...metadata}=extracted;
   const extractionData={...metadata,sourceChecksum:current.attachment.checksumSha256,readById:user.userId,parsed,assessment:evaluated,financial:parseReconFinancial(text),identityVerified:false,financialDataVerified:false};
   const item=await tx.outputReconUpload.update({where:{id},data:{rawText:text,extractionData,readAt:new Date(),status:evaluated.identity.state==='MATCHED'?'OCR_EXTRACTED':'UNDER_REVIEW'},include});
   await audit(tx,user,'RECON_READ_PDF','OutputReconUpload',id,{status:current.status,readAt:current.readAt},{status:item.status,readAt:item.readAt,...extractionData});
   return {item:dto(item),rawText:text,extractionData,parsed,assessment:evaluated};
  },{timeout:15000});
 });
 app.get('/api/v1/output-recon/uploads/:id/download',{preHandler:requirePermission('RECON_VIEW')},async(request,reply)=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params);const companyId=request.auth!.companyId;
  const item=await prisma.outputReconUpload.findFirst({where:{id,companyId},include:{attachment:true}});if(!item||item.attachment.companyId!==companyId)throw new CommandError(404,'Không tìm thấy PDF đối soát của công ty.');
  const data=await sourceBytes(item);
  return reply.header('Content-Type','application/pdf').header('Content-Disposition',`attachment; filename="${item.uploadCode.replace(/[^A-Za-z0-9_-]/g,'_')}.pdf"`).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(data);
 });
 app.get('/api/v1/output-recon/uploads/:id/preview',{preHandler:requirePermission('RECON_VIEW')},async(request,reply)=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),{page}=parse(z.object({page:z.coerce.number().int().min(1).max(12).default(1)}).strict(),request.query);
  const item=await prisma.outputReconUpload.findFirst({where:{id,companyId:request.auth!.companyId},include:{attachment:true}});if(!item||item.status==='CANCELLED')throw new CommandError(404,'Không tìm thấy PDF đối soát của công ty.');
  return reply.header('Content-Type','image/png').header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(await previewReconPage(await sourceBytes(item),page));
 });
}
