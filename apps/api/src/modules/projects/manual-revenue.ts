import {manualRevenueActions,manualRevenuePermission} from './manual-revenue-access.js';
import {reportingFxRoutes} from './reporting-fx.js';
import {randomUUID} from 'node:crypto';
import {mkdir,open,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import type {FastifyInstance} from 'fastify';
import {requirePermission,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,code,CommandError,parse,writeGuard,timestamp,unchanged} from './commands.js';
import {financialPeriodLock} from './recon-finalize.js';
import {checkedFile,rollbackFiles,sha,storageRoot} from './financial-documents.js';
import {D,equivalents,nativeAmount,reportingRates,reportingRate} from './revenue-money.js';
import {spreadsheetRows} from './revenue-import.js';

const period=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),amount=z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/),fx=z.string().regex(/^[1-9]\d{0,7}(\.\d{1,8})?$/);
const rowSchema=z.object({period,serviceId:z.uuid(),contractId:z.uuid(),currency:z.enum(['USD','VND']),amount,deduction:amount.default('0'),fxRate:fx.or(z.literal('')).nullish(),note:z.string().trim().max(2000).default('')}).strict();
const fileSchema=z.object({filename:z.string().trim().min(1).max(200),base64:z.string().max(7*1024*1024)}).strict();
type Entry=z.infer<typeof rowSchema>;
const id=(v:unknown)=>parse(z.object({id:z.uuid()}).strict(),v).id;
const dates=(p:string)=>{const start=new Date(p+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));return {start,end};};
function fail(message:string):never{throw new CommandError(409,message);}
function normalize(row:Entry){
 const a=D(row.amount),w=D(row.deduction);if(!a.gt(0)||w.gt(a)||row.currency==='VND'&&(!a.isInteger()||!w.isInteger()))fail('Số GST được hưởng phải dương; VND là số nguyên, khấu trừ không vượt doanh thu.');
 const rate=row.fxRate?D(row.fxRate).toFixed():null;
 return {...row,amount:nativeAmount(a,row.currency),deduction:nativeAmount(w,row.currency),payable:nativeAmount(a.minus(w),row.currency),fxRate:rate,...equivalents(a,row.currency,rate)};
}
export const normalizeManualRevenueInput=(value:unknown)=>normalize(parse(rowSchema,value));
async function binding(tx:Prisma.TransactionClient,companyId:string,partnerId:string,row:Entry){
 const {start,end}=dates(row.period),c=await tx.contract.findFirst({where:{companyId,id:row.contractId,partnerId,dgcDirection:'Output',status:'ACTIVE',AND:[{OR:[{effectiveDate:null},{effectiveDate:{lte:end}}]},{OR:[{expiryDate:null},{expiryDate:{gte:start}}]}]},include:{services:true}});
 const s=await tx.service.findFirst({where:{companyId,id:row.serviceId,status:'ACTIVE'}});
 const cs=c?.services.find(v=>v.serviceId===row.serviceId&&v.status==='ACTIVE'&&v.dgcStatus==='ACTIVE'&&(!v.effectiveFrom||v.effectiveFrom<=end)&&(!v.effectiveTo||v.effectiveTo>=start));
 if(!c||!s||!cs||!await tx.partner.findFirst({where:{companyId,id:partnerId,status:{in:['ACTIVE','PROSPECT']}}}))fail('Cần đối tác, dịch vụ và liên kết hợp đồng đầu ra Active đúng kỳ, thuộc cùng công ty.');
 if(await tx.serviceRelationship.findFirst({where:{companyId,childServiceId:s.id,effectiveFrom:{lte:end},OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]}}))fail('Nhập dịch vụ cha để tránh cộng trùng doanh thu dịch vụ con.');
 if(c.currency!==row.currency)fail('Tiền tệ nhập phải khớp hợp đồng.');
 return {c,s,cs,start,end};
}
async function fileBytes(file:z.infer<typeof fileSchema>){
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64))throw new CommandError(400,'Tệp không hợp lệ.');
 const bytes=Buffer.from(file.base64,'base64'),ext=file.filename.split('.').at(-1)?.toLowerCase();
 if(!bytes.length||bytes.length>5*1024*1024)throw new CommandError(422,'Tệp tối đa 5 MB.');
 try{if(ext==='pdf'){const d=await PDFDocument.load(bytes);if(d.isEncrypted||d.getPageCount()>30)throw new Error();}
 else if(['png','jpg','jpeg'].includes(ext??'')){const s=sharp(bytes,{limitInputPixels:20000000}),m=await s.metadata();if((m.pages??1)>1||!['png','jpeg'].includes(m.format??''))throw new Error();await s.stats();}
 else if(['csv','xlsx'].includes(ext??''))spreadsheetRows(bytes,file.filename);else throw new Error();
 }catch{throw new CommandError(422,'Chứng từ phải là PDF, PNG/JPEG hoặc bảng theo mẫu CSV/XLSX hợp lệ.');}
 return {bytes,ext:ext!};
}
async function persistSource(tx:Prisma.TransactionClient,user:Identity,file:z.infer<typeof fileSchema>,rollback:string[]){
 const {bytes,ext}=await fileBytes(file),aid=randomUUID(),relative=`manual-revenue/${user.companyId}/${aid}.${ext}`,path=resolve(storageRoot(),relative),temp=path+'.pending';
 await mkdir(resolve(storageRoot(),'manual-revenue',user.companyId),{recursive:true,mode:0o700});rollback.push(temp);const h=await open(temp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}await rename(temp,path);rollback.push(path);
 const mime:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 return tx.attachment.create({data:{id:aid,companyId:user.companyId,originalFilename:file.filename,storedFilename:aid+'.'+ext,storageProvider:'local',storagePath:relative,mimeType:mime[ext],fileSize:BigInt(bytes.length),checksumSha256:sha(bytes),uploadedById:user.userId}});
}
export async function assertManualRevenue(tx:Prisma.TransactionClient,companyId:string,rv:any){
 const j=rv.calculationJson as any,r=rv.reconciliation,p=r.validatedPayload as any,s=r.approvedSnapshot as any;
 if(j?.sourceKind!=='MANUAL_PERIOD'||r.sourceType!=='MANUAL_ENTRY'||r.companyId!==companyId||r.status!=='APPROVED'||!r.isCurrent||!r.approvedById||!p||s?.entryChecksum!==sha(JSON.stringify(p))||j.entryChecksum!==s.entryChecksum||j.nativeRevenue!==p.amount||j.nativeWht!==p.deduction||j.nativePayable!==p.payable||j.reportingFxRate!==p.fxRate||rv.currency!==p.currency||rv.serviceId!==p.serviceId||rv.contractId!==p.contractId||rv.partnerId!==r.partnerId||!rv.netAmount.eq(p.payable)||!rv.companyShareAmount.eq(p.amount)||!rv.whtAmount.eq(p.deduction))fail('Doanh thu nhập theo kỳ không khớp bản đã duyệt.');
 const item=await tx.reconciliationItem.findFirst({where:{companyId,id:rv.reconciliationItemId,reconciliationId:r.id,isCurrent:true}});
 if(!item||!item.companyShareAmount.eq(p.amount)||!item.whtAmount.eq(p.deduction)||!item.netRevenue.eq(p.payable))fail('Chi tiết doanh thu không khớp bản đã duyệt.');
 if(r.sourceAttachmentId){const a=await tx.attachment.findFirst({where:{companyId,id:r.sourceAttachmentId}});if(!a||a.checksumSha256!==r.sourceChecksum)fail('Chứng từ nguồn không khớp.');await checkedFile(a,`manual-revenue/${companyId}/${a.id}.${a.storedFilename.split('.').at(-1)}`,5*1024*1024);}
 return {id:rv.id,updatedAt:rv.updatedAt,reconUpdatedAt:r.updatedAt,snapshot:s};
}
export async function manualRevenueRoutes(app:FastifyInstance,config:AuthConfig){
 await reportingFxRoutes(app,config);
 app.get('/api/v1/manual-revenue/references',{preHandler:requirePermission('REVENUE_VIEW')},async req=>{const companyId=req.auth!.companyId;const [partners,services,contracts]=await Promise.all([prisma.partner.findMany({where:{companyId,status:{in:['ACTIVE','PROSPECT']}},select:{id:true,partnerKey:true,legalName:true},take:1000}),prisma.service.findMany({where:{companyId,status:'ACTIVE'},select:{id:true,serviceCode:true,serviceKey:true,serviceName:true},take:1000}),prisma.contract.findMany({where:{companyId,status:'ACTIVE',dgcDirection:'Output'},select:{id:true,partnerId:true,contractCode:true,contractNumber:true,currency:true,services:{select:{serviceId:true}}},take:1000})]);return {partners,services,contracts,actions:manualRevenueActions(req.auth!)};});
 app.post('/api/v1/manual-revenue/import-preview',{bodyLimit:8*1024*1024,onRequest:writeGuard(identity=>manualRevenuePermission(identity,'create'),config)},async req=>{
  const b=parse(z.object({partnerId:z.uuid(),file:fileSchema}).strict(),req.body),{bytes}=await fileBytes(b.file),rows=spreadsheetRows(bytes,b.file.filename),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{const mapped=[];for(const [i,r] of rows.entries()){const s=await tx.service.findFirst({where:{companyId,serviceCode:r.serviceCode}}),c=await tx.contract.findFirst({where:{companyId,partnerId:b.partnerId,contractCode:r.contractCode}});if(!s||!c)throw new CommandError(422,'Dòng '+(i+2)+': mã dịch vụ/hợp đồng không khớp danh mục.');const v=parse(rowSchema,{period:r.period,serviceId:s.id,contractId:c.id,currency:r.currency,amount:r.amount,deduction:r.deduction||'0',fxRate:r.fxRate,note:r.note});await binding(tx,companyId,b.partnerId,v);mapped.push(normalize(v));}return {rows:mapped,message:'Chỉ xem trước; chưa lưu hoặc ghi nhận doanh thu.'};},{timeout:30000});
 });
 app.post('/api/v1/manual-revenue/drafts',{bodyLimit:8*1024*1024,onRequest:writeGuard(identity=>manualRevenuePermission(identity,'create'),config)},async(req,reply)=>{
  const b=parse(z.object({partnerId:z.uuid(),rows:z.array(rowSchema).min(1).max(100),source:fileSchema.optional()}).strict(),req.body),user=req.auth!,rollback:string[]=[];
  try{const result=await prisma.$transaction(async tx=>{for(const p of [...new Set(b.rows.map(r=>r.period))].sort())await financialPeriodLock(tx,user.companyId,b.partnerId,p);await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;const a=b.source?await persistSource(tx,user,b.source,rollback):null,items=[];
   for(const raw of b.rows){const p=normalize(raw),v=await binding(tx,user.companyId,b.partnerId,raw);await financialPeriodLock(tx,user.companyId,b.partnerId,p.period);
    if(await tx.reconciliation.count({where:{companyId:user.companyId,partnerId:b.partnerId,contractId:p.contractId,periodStart:v.start,isCurrent:true,status:{notIn:['CANCELLED','REJECTED','SUPERSEDED']},OR:[{items:{some:{serviceId:p.serviceId}}},{validatedPayload:{path:['serviceId'],equals:p.serviceId}}]}}))fail('Dịch vụ/hợp đồng/kỳ đã có đối soát hoặc bản nhập; không tạo trùng.');
    const r=await tx.reconciliation.create({data:{companyId:user.companyId,reconCode:await code(tx,user.companyId,'MANUAL_REVENUE','MREV'),logicalGroupId:randomUUID(),partnerId:b.partnerId,contractId:p.contractId,periodStart:v.start,periodEnd:v.end,currency:p.currency,sourceType:'MANUAL_ENTRY',sourceAttachmentId:a?.id,sourceChecksum:a?.checksumSha256,validatedPayload:JSON.parse(JSON.stringify(p)),createdById:user.userId,status:'DRAFT'}});
    await audit(tx,user,'MANUAL_REVENUE_DRAFT','Reconciliation',r.id,null,{payload:p,sourceAttachmentId:a?.id});items.push({id:r.id,reconCode:r.reconCode});
   }return {items,message:'Đã lưu bản nháp. Có thể xem, sửa và duyệt để ghi nhận doanh thu.'};},{timeout:45000});return reply.code(201).send(result);}catch(e){await rollbackFiles(rollback);throw e;}
 });
 app.get('/api/v1/manual-revenue/drafts',{preHandler:requirePermission('REVENUE_VIEW')},async req=>{const q=parse(z.object({page:z.coerce.number().int().min(1).default(1),period:period.optional(),status:z.literal('unapproved').optional()}).strict(),req.query),where={companyId:req.auth!.companyId,sourceType:'MANUAL_ENTRY' as const,isCurrent:true,status:{in:(q.status?['DRAFT','PENDING_APPROVAL']:['DRAFT','PENDING_APPROVAL','APPROVED']) as any},...(q.period?{periodStart:dates(q.period).start}:{})};const [items,total]=await prisma.$transaction([prisma.reconciliation.findMany({where,include:{partner:{select:{legalName:true,partnerKey:true}},contract:{select:{contractCode:true}},sourceAttachment:{select:{originalFilename:true}}},orderBy:[{periodStart:'desc'},{reconCode:'asc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),prisma.reconciliation.count({where})]);const rates=await reportingRates(prisma as any,req.auth!.companyId);return {items:items.map(r=>({id:r.id,reconCode:r.reconCode,status:r.status,updatedAt:r.updatedAt,partner:r.partner.legalName,partnerKey:r.partner.partnerKey,contract:r.contract.contractCode,payload:r.validatedPayload,...(()=>{const p=r.validatedPayload as any,rate=reportingRate(p.period,p.fxRate,rates),net=equivalents(p.payable,p.currency,rate);return {payableUsd:net.usd,payableVnd:net.vnd,reportingRate:rate};})(),source:r.sourceAttachment?.originalFilename})),total,page:q.page};});
 app.post('/api/v1/manual-revenue/:id/edit',{onRequest:writeGuard(identity=>manualRevenuePermission(identity,'edit'),config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,amount,deduction:amount,note:z.string().trim().max(2000)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{
   const initial=await tx.reconciliation.findFirst({where:{companyId:user.companyId,id:rid,sourceType:'MANUAL_ENTRY'}});if(!initial)throw new CommandError(404,'Không tìm thấy bản nhập.');
   await financialPeriodLock(tx,user.companyId,initial.partnerId,initial.periodStart.toISOString().slice(0,7));await tx.$queryRaw`SELECT id FROM reconciliations WHERE id=${rid}::uuid FOR UPDATE`;
   const r=await tx.reconciliation.findFirstOrThrow({where:{companyId:user.companyId,id:rid}});unchanged(r,b.expectedUpdatedAt);if(!r.isCurrent||!['DRAFT','PENDING_APPROVAL'].includes(r.status))fail('Bản đã duyệt/đã hủy không được sửa số liệu.');
   const original=r.validatedPayload as any,p=normalize(parse(rowSchema,{...Object.fromEntries(Object.entries(original).filter(([k])=>['period','serviceId','contractId','currency','amount','deduction','fxRate','note'].includes(k))),amount:b.amount,deduction:b.deduction,note:b.note}));
   await binding(tx,user.companyId,r.partnerId,p);if(await tx.revenue.count({where:{companyId:user.companyId,reconciliationId:rid,isCurrent:true}}))fail('Bản đã ghi nhận doanh thu không được sửa.');
   const item=await tx.reconciliation.update({where:{id:rid},data:{validatedPayload:JSON.parse(JSON.stringify(p)),status:'DRAFT',validatedById:null,validatedAt:null}});
   await audit(tx,user,'MANUAL_REVENUE_EDIT','Reconciliation',rid,{status:r.status,payload:original},{status:'DRAFT',payload:p});return {message:'Đã lưu số liệu. Có thể duyệt trực tiếp để ghi nhận doanh thu.',updatedAt:item.updatedAt};
  },{timeout:30000});
 });
 for(const action of ['submit','approve','cancel'] as const)app.post('/api/v1/manual-revenue/:id/'+action,{onRequest:writeGuard(identity=>manualRevenuePermission(identity,action),config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{const initial=await tx.reconciliation.findFirst({where:{companyId:user.companyId,id:rid,sourceType:'MANUAL_ENTRY'}});if(!initial)throw new CommandError(404,'Không tìm thấy bản nhập.');await financialPeriodLock(tx,user.companyId,initial.partnerId,initial.periodStart.toISOString().slice(0,7));await tx.$queryRaw`SELECT id FROM reconciliations WHERE id=${rid}::uuid FOR UPDATE`;
   const r=await tx.reconciliation.findFirstOrThrow({where:{companyId:user.companyId,id:rid}});unchanged(r,b.expectedUpdatedAt);if(!r.isCurrent||!['DRAFT','PENDING_APPROVAL'].includes(r.status))fail('Bản đã duyệt/đã hủy không được thay đổi.');const p=normalize(parse(rowSchema,Object.fromEntries(Object.entries(r.validatedPayload as any).filter(([k])=>['period','serviceId','contractId','currency','amount','deduction','fxRate','note'].includes(k)))));
   if(action==='submit'&&r.status!=='DRAFT')fail('Trạng thái bản nhập không phù hợp.');
   if(action==='approve'){
    const v=await binding(tx,user.companyId,r.partnerId,p);if(r.sourceAttachmentId){const a=await tx.attachment.findFirstOrThrow({where:{companyId:user.companyId,id:r.sourceAttachmentId}});await checkedFile(a,`manual-revenue/${user.companyId}/${a.id}.${a.storedFilename.split('.').at(-1)}`,5*1024*1024);}
    if(await tx.revenue.count({where:{companyId:user.companyId,partnerId:r.partnerId,serviceId:p.serviceId,periodStart:v.start,isCurrent:true,status:{notIn:['CANCELLED','SUPERSEDED']},calculationJson:{path:['rowType'],equals:'TOTAL'}}}))fail('Dịch vụ/đối tác/kỳ đã có doanh thu tổng; không ghi nhận lần hai.');
    const checksum=sha(JSON.stringify(r.validatedPayload)),calc={dgc:true,sourceKind:'MANUAL_PERIOD',entryChecksum:checksum,approvedById:user.userId,rowType:'TOTAL',includeInMonthlyTotal:true,nativeRevenue:p.amount,nativeWht:p.deduction,nativePayable:p.payable,reportingFxRate:p.fxRate,...(p.currency==='USD'?{invoiceRevenueUsd:p.amount,invoiceWhtUsd:p.deduction,invoicePayableUsd:p.payable}:{}),uploadId:r.id,lineNo:1},scope=[r.partnerId,p.serviceId,p.period].join('|');
    const ri=await tx.reconciliationItem.create({data:{companyId:user.companyId,reconciliationId:r.id,contractServiceId:v.cs.id,serviceId:p.serviceId,lineNo:1,businessScopeKey:scope,periodStart:v.start,periodEnd:v.end,grossRevenue:p.amount,companyShareAmount:p.amount,whtAmount:p.deduction,netRevenue:p.payable,calculationJson:calc}});
    await tx.revenue.create({data:{companyId:user.companyId,revenueCode:await code(tx,user.companyId,'DGC_REVENUE','REV'),logicalGroupId:randomUUID(),reconciliationId:r.id,reconciliationItemId:ri.id,partnerId:r.partnerId,contractId:r.contractId,serviceId:p.serviceId,businessScopeKey:scope,periodStart:v.start,periodEnd:v.end,currency:p.currency,grossAmount:p.amount,partnerShareAmount:'0',companyShareAmount:p.amount,whtAmount:p.deduction,netAmount:p.payable,calculationJson:calc,status:'INVOICE_READY'}});
    await tx.reconciliation.update({where:{id:rid},data:{status:'APPROVED',approvedById:user.userId,approvedAt:new Date(),approvedSnapshot:{entryChecksum:checksum,payload:p},totalGrossRevenue:p.amount,totalCompanyShare:p.amount,totalWht:p.deduction,totalNetRevenue:p.payable}});
   }else await tx.reconciliation.update({where:{id:rid},data:{status:action==='submit'?'PENDING_APPROVAL':'CANCELLED',...(action==='cancel'?{isCurrent:false}:{validatedById:user.userId,validatedAt:new Date()})}});
   await audit(tx,user,'MANUAL_REVENUE_'+action.toUpperCase(),'Reconciliation',rid,{status:r.status},{status:action==='approve'?'APPROVED':action==='submit'?'PENDING_APPROVAL':'CANCELLED',payload:p});return {message:action==='approve'?'Đã duyệt và ghi nhận doanh thu theo tiền tệ gốc. Có thể tạo Invoice.':action==='submit'?'Đã gửi kiểm tra; chưa ghi nhận doanh thu.':'Đã hủy bản chưa duyệt.'};
  },{timeout:30000});
 });
 app.get('/api/v1/manual-revenue/:id/source',{preHandler:requirePermission('REVENUE_VIEW')},async(req,reply)=>{const r=await prisma.reconciliation.findFirst({where:{companyId:req.auth!.companyId,id:id(req.params),sourceType:'MANUAL_ENTRY',isCurrent:true,status:{not:'CANCELLED'}},include:{sourceAttachment:true}}),a=r?.sourceAttachment;if(!a||a.companyId!==req.auth!.companyId)throw new CommandError(404,'Không có chứng từ nguồn.');const bytes=await checkedFile(a,`manual-revenue/${a.companyId}/${a.id}.${a.storedFilename.split('.').at(-1)}`,5*1024*1024);return reply.type(a.mimeType!).header('Content-Disposition','attachment; filename="'+a.originalFilename.replace(/[^A-Za-z0-9_.-]/g,'_')+'"').send(bytes);});
 app.post('/api/v1/revenue-fx',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{const b=parse(z.object({period,rate:fx,source:z.string().trim().min(1).max(500),confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;return prisma.$transaction(async tx=>{const item=await tx.configuration.create({data:{companyId:user.companyId,configKey:'REVENUE_FX:'+b.period,configValue:JSON.stringify({rate:D(b.rate).toFixed(),source:b.source,approvedById:user.userId}),description:'Tỷ giá báo cáo VND/USD theo kỳ, không sửa số tiền gốc.'}});await audit(tx,user,'REPORTING_FX_CREATE','Configuration',item.id,null,b);return {message:'Đã lưu tỷ giá báo cáo theo kỳ. Tỷ giá này không thay đổi Invoice/công nợ gốc.'};});});
}
