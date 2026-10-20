import {assertDraftInvoiceDeletion} from './draft-deletion.js';
import {assertInvoiceUnused} from './invoice-cancel.js';
import {randomUUID} from 'node:crypto';
import {financialFilename,invoiceServices} from './document-filename.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,date,parse,writeGuard,unchanged,timestamp} from './commands.js';
import {financialPeriodLock} from './recon-finalize.js';
import {asset,checkedFile,derivedBytes,persistPdf,persistWorkbook,placementSchema,rollbackFiles,sha,type Placement} from './financial-documents.js';
import {usdWords,type InvoiceData,type InvoiceLine} from './invoice-template.js';
import {previewReconPage} from './recon-reader.js';
import {assertManualRevenue} from './manual-revenue.js';
import {revenueAmounts,nativeAmount} from './revenue-money.js';
import {invoiceParentLines} from './invoice-lines.js';
import {dgcInvoiceLines,dgcInvoiceNumber} from './dgc-invoice-lines.js';
import {dgcPlacementsSchema,type DgcPlacements} from './dgc-invoice-pdf.js';
import {invoiceResources,renderInvoice,invoiceWorkbook} from './invoice-rendering.js';

const input=z.object({partnerId:z.uuid(),currency:z.enum(['USD','VND']).default('USD'),period:z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/),invoiceMode:z.enum(['CONSOLIDATED','PER_SERVICE']),serviceId:z.uuid().optional(),invoiceDate:date,paymentTermDays:z.number().int().min(0).max(365).default(45)}).strict().refine(v=>v.invoiceMode==='PER_SERVICE'||!v.serviceId);
type Input=z.infer<typeof input>;
const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v),r=(d:Prisma.Decimal)=>d.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const total=(lines:InvoiceLine[],field:'revenue'|'wht'|'payable')=>r(lines.reduce((s,l)=>s.plus(l[field]),D('0')));
async function plan(tx:Prisma.TransactionClient,companyId:string,body:Input){
 const partner=await tx.partner.findFirst({where:{companyId,id:body.partnerId}}),company=await tx.company.findUniqueOrThrow({where:{id:companyId}});
 if(!partner)throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
 const paymentTermDays=company.companyCode==='DGC'?(body.paymentTermDays||45):body.paymentTermDays;
 const start=new Date(body.period+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)),due=new Date(body.invoiceDate+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+paymentTermDays);
 const rows=await tx.revenue.findMany({where:{companyId,partnerId:partner.id,isCurrent:true,status:{in:['INVOICE_READY','INVOICED']},currency:body.currency,periodStart:start,periodEnd:end,reconciliation:{companyId,isCurrent:true,status:'APPROVED'}},include:{service:true,contract:true,reconciliation:true},orderBy:[{service:{serviceKey:'asc'}},{revenueCode:'asc'}],take:2001});
 if(rows.length>2000)throw new CommandError(409,'Kỳ vượt giới hạn 2000 dòng.');
 if(rows.some(v=>v.service.companyId!==companyId||v.contract.companyId!==companyId||v.reconciliation.companyId!==companyId))throw new CommandError(409,'Liên kết doanh thu không thuộc cùng công ty.');
 const candidates=rows.filter(v=>{const j=v.calculationJson as any;return j?.dgc===true&&j?.approvedById&&revenueAmounts(v).payable&&D(revenueAmounts(v).payable).gt(0);});
 const headers=candidates.filter(v=>{const j=v.calculationJson as any;return j.rowType==='TOTAL'&&j.includeInMonthlyTotal===true&&(!body.serviceId||v.serviceId===body.serviceId);});
 if(!headers.length)throw new CommandError(409,'Chưa có doanh thu TOTAL đã chốt từ đối soát đang hiệu lực trong kỳ này.');
 const reconIds=[...new Set(candidates.map(v=>v.reconciliationId))],uploadIds=[...new Set(candidates.filter(v=>(v.calculationJson as any).sourceKind!=='MANUAL_PERIOD').map(v=>(v.calculationJson as any).uploadId as string))];
 const uploads=await tx.outputReconUpload.findMany({where:{companyId,id:{in:uploadIds},status:'APPROVED'},include:{attachment:true}});
 for(const h of headers){if((h.calculationJson as any)?.sourceKind==='MANUAL_PERIOD'){await assertManualRevenue(tx,companyId,h);continue;}const j=h.calculationJson as any,u=uploads.find(u=>u.id===j.uploadId),f=(u?.extractionData as any)?.finalization,snap=h.reconciliation.approvedSnapshot as any;
  if(!u||!f?.documentId||f.reconciliationId!==h.reconciliationId||snap?.uploadId!==u.id||snap?.sourceChecksum!==j.sourceChecksum||u.attachment.checksumSha256!==j.sourceChecksum)throw new CommandError(409,'Doanh thu không còn liên kết đầy đủ với PDF đã chốt.');
  if(!await tx.document.findFirst({where:{companyId,id:f.documentId,status:'ACTIVE',entityId:u.id,entityType:'OutputReconUpload',documentType:'RECON_SIGNED'}}))throw new CommandError(409,'Bản PDF đã chốt không còn hiệu lực.');
 }
 const resources=await invoiceResources(tx,company);
 const groupLines=new Map<string,InvoiceLine[]>();
 for(const h of headers){
  if(groupLines.has(h.serviceId))throw new CommandError(409,'Có nhiều dòng tổng cho cùng dịch vụ trong kỳ; kiểm tra nguồn trước khi tạo Invoice.');
  groupLines.set(h.serviceId,resources.kind==='DGC'?dgcInvoiceLines(h,candidates,body.period):invoiceParentLines([h],body.period));
 }
 const groups=body.invoiceMode==='CONSOLIDATED'?[{serviceId:null,lines:[...groupLines.values()].flat(),headers}]:headers.map(h=>({serviceId:h.serviceId,lines:groupLines.get(h.serviceId)!,headers:[h]}));
 if(groups.length>100)throw new CommandError(409,'Mỗi lần tạo tối đa 100 Invoice. Chọn phạm vi dịch vụ nhỏ hơn.');
 const month=body.invoiceDate.slice(0,7),sequenceName=company.companyCode+'_INVOICE_'+month,seq=await tx.sequence.findUnique({where:{companyId_sequenceName:{companyId,sequenceName}}});
 let sequenceBase=seq?.currentValue??0n;
 if(resources.kind==='DGC'){
  const suffix='/'+body.invoiceDate.slice(5,7)+'/'+body.invoiceDate.slice(0,4)+'/DGC-INV';
  const numbers=await tx.invoice.findMany({where:{companyId,invoiceNumber:{endsWith:suffix}},select:{invoiceNumber:true},take:10001});
  if(numbers.length>10000)throw new CommandError(409,'Lịch sử đánh số Invoice vượt giới hạn.');
  for(const v of numbers){const first=v.invoiceNumber.split('/')[0];if(/^\d+$/.test(first)&&BigInt(first)>sequenceBase)sequenceBase=BigInt(first);}
 }
 const numberOf=(n:bigint)=>resources.kind==='DGC'?dgcInvoiceNumber(body.invoiceDate,n):n.toString().padStart(4,'0')+'/'+body.invoiceDate.slice(5,7)+'/'+body.invoiceDate.slice(0,4)+'/GST/INV';
 const existing=await tx.invoice.findMany({where:{companyId,partnerId:partner.id,period:body.period,isCurrent:true,status:{notIn:['CANCELLED','SUPERSEDED']}},include:{scopes:{include:{items:true}}},take:501});if(existing.length>500)throw new CommandError(409,'Lịch sử Invoice vượt giới hạn.');
 const history=await tx.invoice.groupBy({by:['businessKey'],where:{companyId,partnerId:partner.id,period:body.period},_max:{revisionNo:true}});
 const invoices=groups.map((g,idx)=>{
  const businessKey=[partner.partnerKey.toUpperCase(),body.period,body.invoiceMode,g.serviceId??'ALL',...(body.currency==='USD'?[]:[body.currency])].join('|'),old=existing.find(v=>v.businessKey===businessKey);
  const headerIds=g.headers.map(h=>h.id),overlap=existing.filter(i=>i.id!==old?.id&&i.scopes.some(s=>s.items.some(si=>headerIds.includes(si.revenueId))));
  if(overlap.length)throw new CommandError(409,'Nguồn doanh thu đã có Invoice ở chế độ khác. Không tạo trùng.');
  if(old&&(old.paidAmount.gt(0)||old.status!=='DRAFT'))throw new CommandError(409,'Invoice đã phát hành/duyệt hoặc có payment. Chưa thể tạo lại khi chưa hoàn tất luồng AR/payment.');
  const invoiceNumber=numberOf(sequenceBase+BigInt(idx)+1n);
  const totals={revenue:total(g.lines,'revenue'),wht:total(g.lines,'wht'),payable:total(g.lines,'payable')};
  const data:InvoiceData={currency:body.currency,invoiceNumber,invoiceDate:body.invoiceDate,dueDate:due.toISOString().slice(0,10),period:body.period,paymentTermDays,companyName:company.companyName,companyCode:company.companyCode,partner:{name:partner.legalName,address:partner.billingAddress??partner.registeredAddress??'',registration:partner.registrationNumber??'',tax:partner.taxCode??'',attn:partner.invoiceRecipient??partner.contactName??'',email:partner.invoiceEmail??partner.email??'',phone:partner.phone??''},lines:g.lines,totals,amountInWords:body.currency==='VND'?usdWords(totals.payable).replace('US Dollars and Zero Cents Only','Vietnamese Dong Only'):usdWords(totals.payable),agreementNumbers:[...new Set(g.headers.map(h=>h.contract.contractNumber??h.contract.contractCode))]};
  return {nextRevision:(history.find(v=>v.businessKey===businessKey)?._max.revisionNo??0)+1,businessKey,serviceId:g.serviceId,fileServices:g.headers.map(h=>h.service.serviceName),data,headerIds,old:old?{id:old.id,revisionNo:old.revisionNo,updatedAt:old.updatedAt,status:old.status,paidAmount:old.paidAmount.toFixed(2)}:null};
 });
 const state={input:body,companyUpdatedAt:company.updatedAt,partnerUpdatedAt:partner.updatedAt,rows:candidates.map(v=>({id:v.id,updatedAt:v.updatedAt,status:v.status,reconciliationUpdatedAt:v.reconciliation.updatedAt,json:v.calculationJson,contractUpdatedAt:v.contract.updatedAt,serviceUpdatedAt:v.service.updatedAt})),uploads:uploads.map(v=>({id:v.id,updatedAt:v.updatedAt})),existing:existing.map(v=>({id:v.id,updatedAt:v.updatedAt,status:v.status,paidAmount:v.paidAmount.toFixed()})),resources:resources.metadata,sequenceBase:sequenceBase.toString(),invoices};
 return {invoices,digest:sha(JSON.stringify(state)),resources,sequenceName,sequenceBase,numberOf,rows,candidates,reconIds};
}
async function publicPlan(p:Awaited<ReturnType<typeof plan>>){
 const invoices:Record<string,unknown>[]=[];for(const i of p.invoices){
  let suggestedPlacement:Placement={page:1,x:.56,y:.77,width:.28},suggestedDgcPlacement:DgcPlacements|undefined;
  await renderInvoice(i.data,p.resources,{placement:suggestedPlacement},false,value=>{if('stamp' in value)suggestedDgcPlacement=value;else suggestedPlacement=value;});
  invoices.push({businessKey:i.businessKey,serviceId:i.serviceId,invoice:i.data,previousDraft:i.old,suggestedPlacement,suggestedDgcPlacement});
 }
 return {digest:p.digest,invoices,renderer:p.resources.kind,template:p.resources.metadata.template,signingAsset:p.resources.kind==='GST'?p.resources.metadata.signing:undefined,dgcSigningAssets:p.resources.kind==='DGC'?{stamp:p.resources.metadata.stamp,signature:p.resources.metadata.signature}:undefined,warnings:['Invoice được lưu ở trạng thái Nháp; chưa phát hành hoặc ghi nhận công nợ.']};
}
let producing=false;
export async function invoiceRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/invoices/signing-asset',{preHandler:requirePermission('INVOICE_VIEW')},async(request,reply)=>{
  const q=parse(z.object({kind:z.enum(['stamp','signature']).optional(),v:z.uuid().optional()}).strict(),request.query);
  const kind=request.auth!.companyCode==='DGC'?(q.kind==='stamp'?'COMPANY_STAMP':q.kind==='signature'?'SIGNATURE':null):'SIGNING_COMPOSITE';
  if(!kind)throw new CommandError(400,'Chọn dấu hoặc chữ ký DGC.');
  const a=await prisma.$transaction(tx=>asset(tx,request.auth!.companyId,kind,q.v));return reply.type(a.document.attachment.mimeType!).header('Cache-Control','no-store').send(a.bytes);
 });
 app.get('/api/v1/invoices/references',{preHandler:requirePermission('INVOICE_VIEW')},async request=>({canCancelUnpaid:request.auth!.companyCode==='DGC',canReviewOverdue:request.auth!.companyCode==='DGC',partners:await prisma.partner.findMany({where:{companyId:request.auth!.companyId},select:{id:true,partnerKey:true,legalName:true,paymentTermDays:true},orderBy:{legalName:'asc'},take:1000}),services:await prisma.service.findMany({where:{companyId:request.auth!.companyId,status:'ACTIVE'},select:{id:true,serviceKey:true,serviceName:true},orderBy:{serviceKey:'asc'},take:1000})}));
 app.get('/api/v1/invoices',{preHandler:requirePermission('INVOICE_VIEW')},async request=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(100).default(10),publication:z.enum(['issued','unissued']).optional(),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),partnerId:z.uuid().optional(),status:z.enum(['ISSUED','OVERDUE','PARTIALLY_PAID','PAID','SUPERSEDED']).optional(),asOf:z.iso.date().optional()}).strict(),request.query);
  const dgc=request.auth!.companyCode==='DGC',asOf=q.asOf?new Date(q.asOf+'T00:00:00Z'):null;
  if(dgc&&q.status==='OVERDUE'&&!asOf)throw new CommandError(400,'Chọn ngày chốt để lọc Invoice quá hạn.');
  const statusFilter:Prisma.InvoiceWhereInput|undefined=dgc&&q.status==='OVERDUE'?{status:'ISSUED',isCurrent:true,paidAmount:0,payableAmount:{gt:0},dueDate:{lt:asOf!}}:q.status?{status:q.status}:undefined;
  const where:Prisma.InvoiceWhereInput={companyId:request.auth!.companyId,status:{not:'CANCELLED'},...(q.period?{period:q.period}:{}),...(q.partnerId?{partnerId:q.partnerId}:{}),...(q.publication==='issued'?{OR:[{issuedAt:{not:null}},{status:{in:['ISSUED','OVERDUE','PARTIALLY_PAID','PAID']}}]}:q.publication==='unissued'?{issuedAt:null,status:{notIn:['CANCELLED','ISSUED','OVERDUE','PARTIALLY_PAID','PAID']}}:{}),...(statusFilter?{AND:[statusFilter]}:{})};
  const [items,total]=await prisma.$transaction([prisma.invoice.findMany({where,select:{id:true,invoiceNumber:true,invoiceDate:true,dueDate:true,period:true,invoiceMode:true,status:true,revisionNo:true,updatedAt:true,isCurrent:true,revenueAmount:true,whtAmount:true,payableAmount:true,paidAmount:true,currency:true,partner:{select:{legalName:true,partnerKey:true}}},orderBy:[{period:'desc'},{invoiceNumber:'asc'},{id:'asc'}],skip:(q.page-1)*q.limit,take:q.limit}),prisma.invoice.count({where})]);
  // Read-only display against an explicit calendar date. No company/reporting
  // timezone is inferred and no historical invoice/payment amount is changed.
  return {items:items.map(i=>({...i,...(dgc&&asOf?{displayStatus:i.isCurrent&&i.status==='ISSUED'&&i.paidAmount.isZero()&&i.payableAmount.gt(0)&&i.dueDate<asOf?'OVERDUE':i.status}:{})})),total,page:q.page,limit:q.limit,...(dgc&&q.asOf?{asOf:q.asOf}:{})};
 });
 app.post('/api/v1/invoices/:id/delete',{onRequest:writeGuard('INVOICE_CANCEL',config)},async request=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),body=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),request.body),user=request.auth!;
  return prisma.$transaction(async tx=>{
   const initial=await tx.invoice.findFirst({where:{id,companyId:user.companyId}});if(!initial)throw new CommandError(404,'Không tìm thấy Invoice của công ty.');
   await financialPeriodLock(tx,user.companyId,initial.partnerId,initial.period);
   await tx.$queryRaw`SELECT id FROM invoices WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
   const item=await tx.invoice.findFirstOrThrow({where:{id,companyId:user.companyId},include:{receivable:true}});unchanged(item,body.expectedUpdatedAt);assertDraftInvoiceDeletion(item);
   if(user.companyCode==='DGC')await assertInvoiceUnused(tx,user.companyId,id);
   await tx.invoiceScopeItem.updateMany({where:{companyId:user.companyId,scope:{invoiceId:id}},data:{isCurrent:false}});
   await tx.invoiceScope.updateMany({where:{companyId:user.companyId,invoiceId:id},data:{isCurrent:false,status:'CANCELLED'}});
   await tx.document.updateMany({where:{companyId:user.companyId,entityType:'Invoice',entityId:id},data:{status:'CANCELLED'}});
   await tx.invoice.update({where:{id},data:{status:'CANCELLED',isCurrent:false}});
   await audit(tx,user,'INVOICE_DELETE_DRAFT','Invoice',id,{invoiceNumber:item.invoiceNumber,status:item.status,documentId:item.documentId},{status:'CANCELLED',isCurrent:false},'User confirmed draft deletion; retain files and provenance for audit');
   return {message:'Đã xóa Invoice nháp và ngừng cung cấp PDF/Excel. Có thể tạo lại Invoice từ doanh thu đã chốt.'};
  });
 });
 app.post('/api/v1/invoices/preview',{onRequest:writeGuard('INVOICE_CREATE',config)},async request=>prisma.$transaction(async tx=>publicPlan(await plan(tx,request.auth!.companyId,parse(input,request.body))),{isolationLevel:'RepeatableRead',timeout:15000}));
 const confirm=input.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),placements:z.array(z.object({businessKey:z.string().max(300),placement:placementSchema,dgcPlacement:dgcPlacementsSchema.optional()}).strict()).min(1).max(100),confirmed:z.literal(true)}).strict();
 const parseConfirmation=(value:unknown)=>{const b=parse(confirm,value),{digest,placements,confirmed,...selection}=b;return {digest,placements,selection:parse(input,selection)};};
 app.post('/api/v1/invoices/preview-page',{onRequest:writeGuard('INVOICE_CREATE',config)},async(request,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo PDF khác. Thử lại sau vài giây.');producing=true;
  try{const b=parseConfirmation(request.body),bytes=await prisma.$transaction(async tx=>{const p=await plan(tx,request.auth!.companyId,b.selection);if(p.digest!==b.digest)throw new CommandError(409,'Nguồn Invoice đã thay đổi. Xem lại trước khi tạo.');if(b.placements.length!==1)throw new CommandError(400,'Chọn một Invoice để xem trang.');const v=b.placements[0],i=p.invoices.find(i=>i.businessKey===v.businessKey);if(!i)throw new CommandError(400,'Không tìm thấy nhóm Invoice.');return previewReconPage(await renderInvoice(i.data,p.resources,v,false),v.placement.page);},{timeout:45000});return reply.type('image/png').header('Cache-Control','no-store').send(bytes);}finally{producing=false;}
 });
 app.post('/api/v1/invoices/preview-pdf',{onRequest:writeGuard('INVOICE_CREATE',config)},async(request,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo PDF khác. Thử lại sau vài giây.');producing=true;
  try{const b=parseConfirmation(request.body),bytes=await prisma.$transaction(async tx=>{const p=await plan(tx,request.auth!.companyId,b.selection);if(p.digest!==b.digest)throw new CommandError(409,'Nguồn Invoice đã thay đổi. Xem lại trước khi tạo.');if(b.placements.length!==1)throw new CommandError(400,'Chọn một Invoice để xem PDF.');const i=p.invoices.find(i=>i.businessKey===b.placements[0].businessKey);if(!i)throw new CommandError(400,'Không tìm thấy nhóm Invoice.');return renderInvoice(i.data,p.resources,b.placements[0]);},{timeout:30000});return reply.type('application/pdf').header('Cache-Control','no-store').send(bytes);}finally{producing=false;}
 });
 app.post('/api/v1/invoices/create',{onRequest:writeGuard('INVOICE_CREATE',config)},async(request,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo PDF khác. Thử lại sau vài giây.');producing=true;const rollback:string[]=[];
  try{const b=parseConfirmation(request.body),user=request.auth!;
   const result=await prisma.$transaction(async tx=>{
    await financialPeriodLock(tx,user.companyId,b.selection.partnerId,b.selection.period);await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
    const p=await plan(tx,user.companyId,b.selection);if(p.digest!==b.digest)throw new CommandError(409,'Nguồn Invoice đã thay đổi. Xem lại trước khi chốt.');
    if(b.placements.length!==p.invoices.length||new Set(b.placements.map(v=>v.businessKey)).size!==p.invoices.length||p.invoices.some(i=>!b.placements.some(v=>v.businessKey===i.businessKey)))throw new CommandError(400,'Cần vị trí dấu/chữ ký cho từng Invoice.');
    const created=[];
    for(const [idx,i] of p.invoices.entries()){const positions=b.placements.find(v=>v.businessKey===i.businessKey)!,placement=positions.placement,id=randomUUID();
     const next=p.sequenceBase+BigInt(idx)+1n;
     const sequence=await tx.sequence.upsert({where:{companyId_sequenceName:{companyId:user.companyId,sequenceName:p.sequenceName}},create:{companyId:user.companyId,sequenceName:p.sequenceName,prefix:p.resources.kind,padding:p.resources.kind==='DGC'?2:4,currentValue:next},update:{currentValue:next}});
     const invoiceNumber=p.numberOf(sequence.currentValue);if(invoiceNumber!==i.data.invoiceNumber)throw new CommandError(409,'Số Invoice đã thay đổi. Xem lại trước khi tạo.');
     const pdf=await renderInvoice(i.data,p.resources,positions),version=i.nextRevision;
     const doc=await persistPdf(tx,user,'Invoice',id,'INVOICE',financialFilename('Invoice',i.fileServices,b.selection.period,invoiceNumber,version),pdf,version,rollback),ext=b.selection.currency==='VND'?'xlsx':p.resources.workbookExtension;
     const workbook=await persistWorkbook(tx,user,id,invoiceWorkbook(i.data,p.resources),financialFilename('Invoice',i.fileServices,b.selection.period,invoiceNumber,version,ext),ext,rollback);
     if(i.old){const previous=await tx.invoice.findFirstOrThrow({where:{id:i.old.id,companyId:user.companyId}});if(previous.paidAmount.gt(0)||previous.status!=='DRAFT')throw new CommandError(409,'Invoice cũ có payment hoặc đã chuyển trạng thái.');
      await tx.invoiceScopeItem.updateMany({where:{companyId:user.companyId,scope:{invoiceId:i.old.id}},data:{isCurrent:false}});await tx.invoiceScope.updateMany({where:{companyId:user.companyId,invoiceId:i.old.id},data:{isCurrent:false,status:'SUPERSEDED'}});await tx.invoice.update({where:{id:i.old.id},data:{isCurrent:false,status:'SUPERSEDED'}});await tx.document.updateMany({where:{companyId:user.companyId,entityType:'Invoice',entityId:i.old.id},data:{status:'SUPERSEDED'}});
     }
     const snapshot={...i.data,fileServices:i.fileServices,placement,templateId:p.resources.metadata.template.id,templateVersion:p.resources.metadata.template.version,templateChecksum:p.resources.metadata.template.checksum,resourceVersions:p.resources.metadata,...(p.resources.kind==='GST'?{signingAssetId:p.resources.metadata.signing.id,signingAssetVersion:p.resources.metadata.signing.version,signingAssetChecksum:p.resources.metadata.signing.checksum}:{dgcPlacement:positions.dgcPlacement,issuerProfile:p.resources.config.profile}),bank:p.resources.bank,layout:p.resources.layout,workbookDocumentId:workbook.id,sourceRevenueIds:i.headerIds,...(p.resources.kind==='DGC'?{sourceVersions:p.candidates.filter(r=>i.headerIds.includes(r.id)||i.data.lines.some(l=>l.revenueId===r.id)).map(r=>({id:r.id,updatedAt:r.updatedAt.toISOString(),reconciliationUpdatedAt:r.reconciliation.updatedAt.toISOString(),calculationChecksum:sha(JSON.stringify(r.calculationJson))}))}:{}),supersedesId:i.old?.id??null};
     await tx.invoice.create({data:{id,companyId:user.companyId,invoiceNumber,businessKey:i.businessKey,revisionNo:version,partnerId:b.selection.partnerId,period:b.selection.period,invoiceMode:b.selection.invoiceMode,currency:b.selection.currency,serviceId:i.serviceId,invoiceDate:new Date(i.data.invoiceDate),dueDate:new Date(i.data.dueDate),revenueAmount:i.data.totals.revenue,whtAmount:i.data.totals.wht,payableAmount:i.data.totals.payable,snapshot:JSON.parse(JSON.stringify(snapshot)),documentId:doc.id,createdById:user.userId}});
     const headers=p.candidates.filter(h=>i.headerIds.includes(h.id));
     for(const contractId of [...new Set(headers.map(h=>h.contractId))]){const group=headers.filter(h=>h.contractId===contractId),scope=await tx.invoiceScope.create({data:{companyId:user.companyId,invoiceId:id,scopeCode:await code(tx,user.companyId,'INVOICE_SCOPE','ISCOPE'),logicalGroupId:randomUUID(),partnerId:b.selection.partnerId,contractId,periodStart:group[0].periodStart,periodEnd:group[0].periodEnd,invoiceMode:b.selection.invoiceMode,currency:b.selection.currency,scopeKey:i.businessKey+'|'+contractId,totalAmount:r(group.reduce((s,h)=>s.plus(revenueAmounts(h).payable),D('0'))),status:'INVOICE_READY'}});
      for(const [idx,h] of group.entries())await tx.invoiceScopeItem.create({data:{companyId:user.companyId,scopeId:scope.id,revenueId:h.id,lineNo:idx+1,amount:revenueAmounts(h).payable}});
     }
     await audit(tx,user,'INVOICE_CREATE','Invoice',id,null,{invoiceNumber,status:'DRAFT',revisionNo:version,snapshot});created.push({id,invoiceNumber,status:'DRAFT',revisionNo:version});
    }return {items:created,message:'Đã tạo Invoice nháp cùng PDF và workbook. Chưa phát hành hoặc ghi công nợ.'};
   },{timeout:60000});return reply.code(201).send(result);
  }catch(e){try{await rollbackFiles(rollback);}catch(cleanup){request.log.error({err:cleanup},'Invoice file rollback failed');}throw e;}finally{producing=false;}
 });
 app.get('/api/v1/invoices/:id/download',{preHandler:requirePermission('INVOICE_VIEW')},async(request,reply)=>{
  const {id}=parse(z.object({id:z.uuid()}).strict(),request.params),q=parse(z.object({format:z.enum(['pdf','workbook']).default('pdf')}).strict(),request.query),companyId=request.auth!.companyId;
  const file=await prisma.$transaction(async tx=>{const i=await tx.invoice.findFirst({where:{companyId,id}});if(!i||i.status==='CANCELLED')throw new CommandError(404,'Không tìm thấy Invoice của công ty.');
   if(q.format==='pdf'){const d=await derivedBytes(tx,companyId,i.documentId,'INVOICE');return {bytes:d.bytes,mime:'application/pdf',name:financialFilename('Invoice',invoiceServices(i.snapshot),i.period,i.invoiceNumber,i.revisionNo)};}
   const d=await tx.document.findFirst({where:{companyId,id:(i.snapshot as any).workbookDocumentId,entityId:id,entityType:'Invoice',documentType:'INVOICE_WORKBOOK'},include:{attachment:true}});if(!d||d.attachment.companyId!==companyId)throw new CommandError(404,'Không tìm thấy workbook Invoice.');const ext=d.attachment.storedFilename.endsWith('.xlsm')?'xlsm':'xlsx';return {bytes:await checkedFile(d.attachment,`invoices/${companyId}/${d.attachment.id}.${ext}`,5*1024*1024),mime:d.attachment.mimeType!,name:financialFilename('Invoice',invoiceServices(i.snapshot),i.period,i.invoiceNumber,i.revisionNo,ext)};
  });return reply.type(file.mime).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',(q.format==='pdf'?'inline':'attachment')+'; filename="'+file.name+'"').send(file.bytes);
 });
}
