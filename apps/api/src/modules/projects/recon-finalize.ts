import {randomUUID} from 'node:crypto';
import {financialFilename} from './document-filename.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,money,parse,timestamp,unchanged,writeGuard} from './commands.js';
import {assessment,sourceBytes,preflight} from './output-recon.js';
import {parseReconIdentity,normalizeService} from './recon-identity.js';
import {parseReconFinancial,correctFinancial,type Financial} from './recon-financial.js';
import {asset,derivedBytes,persistPdf,placementSchema,rollbackFiles,sha,stampPdf} from './financial-documents.js';

const idOf=(p:unknown)=>parse(z.object({id:z.uuid()}).strict(),p).id;
const include={attachment:true,partner:true,service:true} as const;
type Upload=Prisma.OutputReconUploadGetPayload<{include:typeof include}>;
const financial=(u:Upload):Financial=>((u.extractionData as any)?.financial??parseReconFinancial(u.rawText??''));
const stored=(u:Upload)=>({...u,rawText:undefined,attachment:{originalFilename:u.attachment.originalFilename,checksumSha256:u.attachment.checksumSha256,fileSize:Number(u.attachment.fileSize)}});
const key=(s:string)=>normalizeService(s).replace(/[^A-Z0-9]/g,'');
export async function financialPeriodLock(tx:Prisma.TransactionClient,companyId:string,partnerId:string,period:string){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId+'|FINANCE|'+partnerId+'|'+period},0))`;}
async function get(tx:Prisma.TransactionClient,companyId:string,id:string){const u=await tx.outputReconUpload.findFirst({where:{companyId,id},include});if(!u||u.status==='CANCELLED')throw new CommandError(404,'Không tìm thấy PDF đối soát của công ty.');return u;}
async function review(tx:Prisma.TransactionClient,u:Upload){
 const f=financial(u),a=await assessment(tx,u,parseReconIdentity(u.rawText??'')),errors=[...f.errors];
 if(f.sourcePartnerKey&&key(u.partner.partnerKey)!==f.sourcePartnerKey)errors.push('PDF DIGICOM phải được gắn với đối tác DIGICOM.');
 if(a.identity.state!=='MATCHED')errors.push(a.identity.message);
 if(a.contractState!=='MATCHED')errors.push('Cần một hợp đồng đầu ra Active trùng số, dịch vụ và kỳ PDF.');
 if(a.financialBlocked)errors.push(a.financialMessage!);
 const services=await tx.service.findMany({where:{companyId:u.companyId},select:{id:true,serviceKey:true,serviceCode:true,serviceName:true,keyword:true},take:1001});
 if(services.length>1000)throw new CommandError(409,'Danh mục dịch vụ vượt giới hạn kiểm tra.');
 const periodStart=new Date(u.period+'-01'),periodEnd=new Date(Date.UTC(periodStart.getUTCFullYear(),periodStart.getUTCMonth()+1,0));
 const contracts=await tx.contract.findMany({where:{companyId:u.companyId,partnerId:u.partnerId,dgcDirection:'Output',status:'ACTIVE',AND:[{OR:[{effectiveDate:null},{effectiveDate:{lte:periodEnd}}]},{OR:[{expiryDate:null},{expiryDate:{gte:periodStart}}]}]},include:{services:true},take:1001});
 if(contracts.length>1000)throw new CommandError(409,'Danh mục hợp đồng vượt giới hạn kiểm tra.');
 const bindings:{lineNo:number;serviceId:string;serviceKey:string;contractId:string;contractServiceId:string;contractCode:string;contractUpdatedAt:Date;contractServiceUpdatedAt:Date}[]=[];
 for(const d of f.details){
  const matches=services.filter(s=>[s.serviceKey,s.serviceCode,s.serviceName,s.keyword].some(v=>v&&key(v)===key(d.serviceName)));
  if(matches.length!==1){errors.push('Dịch vụ '+d.serviceName+' chưa khớp duy nhất danh mục.');continue;}
  const s=matches[0],header=contracts.find(c=>c.id===a.contracts[0]?.id);
  const effective=(cs:any)=>cs.dgcStatus==='ACTIVE'&&cs.status==='ACTIVE'&&(!cs.effectiveFrom||cs.effectiveFrom<=periodEnd)&&(!cs.effectiveTo||cs.effectiveTo>=periodStart);
  let candidates=contracts.flatMap(c=>c.services.filter(cs=>cs.serviceId===s.id&&effective(cs)).map(cs=>({c,cs})));
  if(header){const own=candidates.filter(v=>v.c.id===header.id);if(own.length)candidates=own;}
  // A configured parent-child relationship is required before inheriting the
  // parent's commercial mapping. Never invent a missing child contract.
  if(!candidates.length&&header&&d.rowType==='CHILD'&&await tx.serviceRelationship.findFirst({where:{companyId:u.companyId,parentServiceId:u.serviceId,childServiceId:s.id,effectiveFrom:{lte:periodEnd},OR:[{effectiveTo:null},{effectiveTo:{gte:periodStart}}]}})){
   candidates=header.services.filter(cs=>cs.serviceId===u.serviceId&&effective(cs)).map(cs=>({c:header,cs}));
  }
  if(candidates.length!==1){errors.push('Dịch vụ '+d.serviceName+' chưa có một liên kết hợp đồng Active hợp lệ.');continue;}
  if(f.nativeCurrency&&candidates[0].c.currency!==f.nativeCurrency){errors.push('Hợp đồng DIGICOM phải dùng tiền tệ VND.');continue;}
  bindings.push({lineNo:d.lineNo,serviceId:s.id,serviceKey:s.serviceKey,contractId:candidates[0].c.id,contractServiceId:candidates[0].cs.id,contractCode:candidates[0].c.contractCode,contractUpdatedAt:candidates[0].c.updatedAt,contractServiceUpdatedAt:candidates[0].cs.updatedAt});
 }
 const assets=await tx.document.findMany({where:{companyId:u.companyId,entityType:'CompanyAsset',entityId:u.companyId,documentType:'SIGNING_COMPOSITE',status:'ACTIVE'},select:{id:true,versionNo:true,attachment:{select:{mimeType:true,checksumSha256:true}}},take:2});
 if(assets.length!==1)errors.push('Chưa có ảnh dấu/chữ ký/chức danh GST đang hiệu lực.');
 const signingAsset=assets.length===1?{id:assets[0].id,version:assets[0].versionNo,mime:assets[0].attachment.mimeType,checksum:assets[0].attachment.checksumSha256}:null;
 const digest=sha(JSON.stringify({updatedAt:u.updatedAt,checksum:u.attachment.checksumSha256,financial:f,assessment:a,bindings,signingAsset}));
 return {item:stored(u),financial:f,assessment:a,bindings,signingAsset,digest,errors:[...new Set(errors)],canFinalize:errors.length===0&&['OCR_EXTRACTED','UNDER_REVIEW'].includes(u.status)};
}
let producing=false;
export async function reconFinalizeRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/output-recon/uploads/:id/financial',{preHandler:requirePermission('RECON_VIEW')},async request=>prisma.$transaction(async tx=>review(tx,await get(tx,request.auth!.companyId,idOf(request.params))),{isolationLevel:'RepeatableRead'}));
 app.get('/api/v1/output-recon/signing-asset',{preHandler:requirePermission('RECON_VIEW')},async(request,reply)=>{
  const a=await prisma.$transaction(tx=>asset(tx,request.auth!.companyId,'SIGNING_COMPOSITE'));
  return reply.type(a.document.attachment.mimeType!).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(a.bytes);
 });
 app.post('/api/v1/output-recon/uploads/:id/correct-financial',{onRequest:writeGuard('RECON_REVIEW',config)},async request=>{
  const id=idOf(request.params),body=parse(z.object({expectedUpdatedAt:timestamp,changes:z.array(z.object({lineNo:z.number().int().min(1).max(100),revenueMzn:money}).strict()).max(100),reason:z.string().trim().min(1).max(500)}).strict(),request.body),user=request.auth!;
  return prisma.$transaction(async tx=>{
   await financialPeriodLock(tx,user.companyId,(await get(tx,user.companyId,id)).partnerId,(await get(tx,user.companyId,id)).period);
   await tx.$queryRaw`SELECT id FROM output_recon_uploads WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const u=await get(tx,user.companyId,id);unchanged(u,body.expectedUpdatedAt);if(!['OCR_EXTRACTED','UNDER_REVIEW'].includes(u.status))throw new CommandError(409,'PDF đã chốt; không sửa số liệu.');
   const check=await preflight(tx,user.companyId,u);if(check.action==='BLOCK_FINANCIAL_DEPENDENCY')throw new CommandError(409,check.message);await sourceBytes(u);
   const old=financial(u),next=correctFinancial(old,body.changes,body.reason),metadata=u.extractionData as any;
   const updated=await tx.outputReconUpload.update({where:{id},data:{extractionData:{...metadata,financial:next,financialDataVerified:false}},include});
   await audit(tx,user,'RECON_CORRECT_FINANCIAL','OutputReconUpload',id,old,next,body.reason);return review(tx,updated);
  },{timeout:15000});
 });
 const confirmation=z.object({expectedUpdatedAt:timestamp,digest:z.string().regex(/^[a-f0-9]{64}$/),signingAssetId:z.uuid(),placement:placementSchema,confirmed:z.literal(true)}).strict();
 app.post('/api/v1/output-recon/uploads/:id/signed-preview',{onRequest:writeGuard('RECON_APPROVE',config)},async(request,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo PDF khác. Thử lại sau vài giây.');producing=true;
  try{const id=idOf(request.params),body=parse(confirmation,request.body),user=request.auth!;
   const bytes=await prisma.$transaction(async tx=>{const u=await get(tx,user.companyId,id);unchanged(u,body.expectedUpdatedAt);const v=await review(tx,u);
    if(v.digest!==body.digest||(!v.canFinalize&&u.status!=='APPROVED'))throw new CommandError(409,v.errors.join(' ')||'Hồ sơ đã thay đổi. Tải lại trước khi xem PDF.');
    const a=await asset(tx,user.companyId,'SIGNING_COMPOSITE',body.signingAssetId);return stampPdf(await sourceBytes(u),a.bytes,a.document.attachment.mimeType,body.placement);
   },{timeout:30000});return reply.type('application/pdf').header('Cache-Control','no-store').send(bytes);
  }finally{producing=false;}
 });
 app.post('/api/v1/output-recon/uploads/:id/finalize',{onRequest:writeGuard('RECON_APPROVE',config)},async(request,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo PDF khác. Thử lại sau vài giây.');producing=true;const rollback:string[]=[];
  try{const id=idOf(request.params),body=parse(confirmation,request.body),user=request.auth!;
   const result=await prisma.$transaction(async tx=>{
    const initial=await get(tx,user.companyId,id);await financialPeriodLock(tx,user.companyId,initial.partnerId,initial.period);
    await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM output_recon_uploads WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
    const u=await get(tx,user.companyId,id);unchanged(u,body.expectedUpdatedAt);const v=await review(tx,u);
    if(v.digest!==body.digest)throw new CommandError(409,'Số liệu, hợp đồng hoặc tài sản đã thay đổi. Xem lại trước khi chốt.');
    const placementOnly=u.status==='APPROVED';if(!placementOnly&&!v.canFinalize)throw new CommandError(409,v.errors.join(' ')||'PDF chưa đủ điều kiện chốt.');
    const a=await asset(tx,user.companyId,'SIGNING_COMPOSITE',body.signingAssetId),bytes=await stampPdf(await sourceBytes(u),a.bytes,a.document.attachment.mimeType,body.placement);
    const metadata=u.extractionData as any,oldFinal=metadata?.finalization;
    let reconciliationId:string|undefined=oldFinal?.reconciliationId;
    if(!placementOnly){
     const check=await preflight(tx,user.companyId,u);if(check.action==='BLOCK_FINANCIAL_DEPENDENCY')throw new CommandError(409,check.message);
     const previous=check.reconciliations;
     if(previous.length){const context=u.replacementContext as any;
      if(!context?.requested||previous.some(r=>!context.reconciliationIds?.includes(r.id)))throw new CommandError(409,'Có đối soát mới phát sinh; nhận bản thay thế với kiểm tra trùng trước.');
      const ids=previous.map(r=>r.id);
      if(await tx.revenue.findFirst({where:{reconciliationId:{in:ids},OR:[{invoiceScopeItems:{some:{isCurrent:true}}},{status:{in:['INVOICED','PAID','PARTIALLY_PAID']}}]}}))throw new CommandError(409,'Doanh thu cũ có Invoice/payment. Không thể thay thế.');
      await tx.revenue.updateMany({where:{companyId:user.companyId,reconciliationId:{in:ids},isCurrent:true},data:{isCurrent:false,status:'SUPERSEDED'}});
      await tx.reconciliationItem.updateMany({where:{companyId:user.companyId,reconciliationId:{in:ids},isCurrent:true},data:{isCurrent:false}});
      await tx.reconciliation.updateMany({where:{companyId:user.companyId,id:{in:ids}},data:{isCurrent:false,status:'SUPERSEDED'}});
      await tx.outputReconUpload.updateMany({where:{companyId:user.companyId,id:{in:check.uploads.filter(p=>p.id!==id&&p.status==='APPROVED').map(p=>p.id)}},data:{status:'SUPERSEDED'}});
     }
     const f=v.financial,start=new Date(u.period+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)),now=new Date();
     const amounts=f.nativeCurrency?f.native!:f.mzn!;
     const rec=await tx.reconciliation.create({data:{companyId:user.companyId,reconCode:await code(tx,user.companyId,'DGC_RECON','REC'),logicalGroupId:randomUUID(),partnerId:u.partnerId,contractId:v.assessment.contracts[0].id,periodStart:start,periodEnd:end,currency:f.nativeCurrency??'MZN',sourceType:'FILE_UPLOAD',sourceAttachmentId:u.attachmentId,sourceChecksum:u.attachment.checksumSha256,sourceReportedTotal:amounts.partnerRevenue,totalGrossRevenue:amounts.totalServiceRevenue,totalCompanyShare:amounts.remunerationProvider,totalWht:amounts.wht,totalNetRevenue:amounts.partnerRevenue,status:'APPROVED',validatedById:user.userId,validatedAt:now,approvedById:user.userId,approvedAt:now,createdById:user.userId,approvedSnapshot:JSON.parse(JSON.stringify({financial:f,bindings:v.bindings,uploadId:id,sourceChecksum:u.attachment.checksumSha256}))}});reconciliationId=rec.id;
     for(const d of f.details){const b=v.bindings.find(b=>b.lineNo===d.lineNo)!,scopeKey=[u.partnerId,b.serviceId].join('|');
      const native=f.nativeCurrency==='VND',payable=native?d.partnerRevenue:d.usd.partnerRevenue;
      const ri=await tx.reconciliationItem.create({data:{companyId:user.companyId,reconciliationId:rec.id,contractServiceId:b.contractServiceId,serviceId:b.serviceId,lineNo:d.lineNo,businessScopeKey:scopeKey,periodStart:start,periodEnd:end,grossRevenue:d.totalServiceRevenue,companyShareAmount:d.remunerationProvider,whtAmount:d.wht,netRevenue:d.partnerRevenue,calculationJson:JSON.parse(JSON.stringify({dgc:true,...d,uploadId:id}))}});
      await tx.revenue.create({data:{companyId:user.companyId,revenueCode:await code(tx,user.companyId,'DGC_REVENUE','REV'),logicalGroupId:randomUUID(),reconciliationId:rec.id,reconciliationItemId:ri.id,partnerId:u.partnerId,contractId:b.contractId,serviceId:b.serviceId,businessScopeKey:scopeKey,periodStart:start,periodEnd:end,currency:f.nativeCurrency??'USD',grossAmount:payable,partnerShareAmount:'0',companyShareAmount:payable,whtAmount:'0',netAmount:payable,status:'INVOICE_READY',calculationJson:{...(native?{nativeRevenue:d.remunerationProvider,nativeWht:d.wht,nativePayable:d.partnerRevenue,reportingFxRate:f.exchangeRate}:{}),dgc:true,rowType:d.rowType,includeInMonthlyTotal:d.rowType==='TOTAL',parentServiceId:d.rowType==='CHILD'?u.serviceId:null,invoiceRevenueUsd:d.usd.remunerationProvider,invoiceWhtUsd:d.usd.wht,invoicePayableUsd:d.usd.partnerRevenue,uploadId:id,lineNo:d.lineNo,sourceChecksum:u.attachment.checksumSha256,approvedById:user.userId,approvedAt:now.toISOString()}}});
     }
    }else if(!reconciliationId||!await tx.reconciliation.findFirst({where:{id:reconciliationId,companyId:user.companyId,isCurrent:true,status:'APPROVED'}}))throw new CommandError(409,'Đối soát nguồn đã bị thay thế. Không chèn lại dấu.');
    const version=(oldFinal?.documentVersion??0)+1,doc=await persistPdf(tx,user,'OutputReconUpload',id,'RECON_SIGNED',financialFilename('Reconciliation',[u.service.serviceName],u.period,u.uploadCode,version),bytes,version,rollback);
    if(oldFinal?.documentId)await tx.document.updateMany({where:{companyId:user.companyId,id:oldFinal.documentId},data:{status:'SUPERSEDED'}});
    const finalization={reconciliationId,documentId:doc.id,documentVersion:version,signingAssetId:a.document.id,signingAssetVersion:a.document.versionNo,signingAssetChecksum:a.document.attachment.checksumSha256,placement:body.placement,sourceChecksum:u.attachment.checksumSha256,approvedById:user.userId,approvedAt:new Date().toISOString(),placementOnly};
    const updated=await tx.outputReconUpload.update({where:{id},data:{status:'APPROVED',extractionData:{...metadata,financial:v.financial,identityVerified:true,financialDataVerified:true,finalization}},include});
    await audit(tx,user,placementOnly?'RECON_RESTAMP':'RECON_FINALIZE','OutputReconUpload',id,{status:u.status,finalization:oldFinal??null},{status:updated.status,finalization,financial:v.financial});
    return {item:stored(updated),finalization,message:placementOnly?'Đã lưu bản PDF mới; số liệu đã chốt được giữ nguyên.':'Đã chốt đối soát, doanh thu và lưu PDF có dấu/chữ ký. Có thể tạo Invoice.'};
   },{timeout:30000});return reply.code(201).send(result);
  }catch(e){try{await rollbackFiles(rollback);}catch(cleanup){request.log.error({err:cleanup},'Financial file rollback failed');}throw e;}finally{producing=false;}
 });
 app.get('/api/v1/output-recon/uploads/:id/signed-download',{preHandler:requirePermission('RECON_VIEW')},async(request,reply)=>{
  const bytes=await prisma.$transaction(async tx=>{const u=await get(tx,request.auth!.companyId,idOf(request.params)),f=(u.extractionData as any)?.finalization;if(!f?.documentId)throw new CommandError(404,'Chưa có PDF đã chốt.');return {...await derivedBytes(tx,u.companyId,f.documentId,'RECON_SIGNED'),filename:financialFilename('Reconciliation',[u.service.serviceName],u.period,u.uploadCode,f.documentVersion??1)};});
  return reply.type('application/pdf').header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="${bytes.filename}"`).header('X-Content-Type-Options','nosniff').send(bytes.bytes);
 });
}
