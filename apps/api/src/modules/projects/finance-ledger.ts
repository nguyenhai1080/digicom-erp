import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,date,parse,writeGuard} from './commands.js';
import {financialPeriodLock} from './recon-finalize.js';
import {derivedBytes,sha} from './financial-documents.js';
import {assertManualRevenue} from './manual-revenue.js';
import {revenueAmounts,equivalents,reportingRates,nativeAmount,reportingRate} from './revenue-money.js';
import {dashboardSummary} from './dashboard-summary.js';

const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v);
const fixed=(v:Prisma.Decimal)=>v.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const sent=['ISSUED','OVERDUE','PARTIALLY_PAID','PAID'];
const idSchema=z.object({id:z.uuid()}).strict();
export const invoiceIssueConfirmation=z.union([
 z.object({digest:z.string().regex(/^[a-f0-9]{64}$/),confirmedSent:z.literal(true)}).strict(),
 z.object({digest:z.string().regex(/^[a-f0-9]{64}$/),confirmedHistorical:z.literal(true),historicalReason:z.string().trim().min(10).max(1000)}).strict(),
]);
const period=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const filters=z.object({period:period.optional(),partnerId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
function fail(message:string):never{throw new CommandError(409,message);}
const sums=(rows:any[],field:string)=>rows.reduce((sum:Prisma.Decimal,row:any)=>sum.plus(row[field]),D('0')) as Prisma.Decimal;

// DGC v61 issue plan, integrity guard and one-to-one AR: all service-mode
// drafts for the partner/month are issued together. Other modes cannot double bill.
async function issuePlan(tx:Prisma.TransactionClient,companyId:string,id:string){
 const selected=await tx.invoice.findFirst({where:{companyId,id}});
 if(!selected)throw new CommandError(404,'Không tìm thấy Invoice của công ty.');
 if(!selected.isCurrent||selected.status!=='DRAFT')fail('Chỉ phát hành Invoice nháp hiện hành.');
 const all=await tx.invoice.findMany({where:{companyId,partnerId:selected.partnerId,period:selected.period,currency:selected.currency,isCurrent:true},include:{partner:true,receivable:true,scopes:{include:{items:true}}},orderBy:{invoiceNumber:'asc'},take:101});
 if(all.length>500)fail('Kỳ vượt giới hạn 500 Invoice.');
 if(all.some(i=>sent.includes(i.status)&&i.invoiceMode!==selected.invoiceMode))fail('Kỳ này đã phát hành Invoice ở phương án khác; không ghi công nợ trùng.');
 const candidates=selected.invoiceMode==='CONSOLIDATED'?all.filter(i=>i.id===id):all.filter(i=>i.invoiceMode==='PER_SERVICE'&&i.status==='DRAFT');
 if(!candidates.some(i=>i.id===id))fail('Invoice không còn là bản nháp mới nhất.');
 const provenance:unknown[]=[];const billed=new Set<string>();
 for(const i of candidates){
  if(i.partner.companyId!==companyId||i.receivable||!i.paidAmount.isZero()||i.issuedAt||!['USD','VND'].includes(i.currency))fail('Invoice nháp có công nợ/payment hoặc thông tin phát hành không hợp lệ.');
  const snap=i.snapshot as any,lines=snap?.lines;
  if(snap?.invoiceDate!==i.invoiceDate.toISOString().slice(0,10)||snap?.dueDate!==i.dueDate.toISOString().slice(0,10))fail('Ngày Invoice hoặc hạn thanh toán không khớp bản PDF đã tạo.');
  if(!Array.isArray(lines)||!lines.length||lines.length>2000||!Array.isArray(snap.sourceRevenueIds)||!snap.sourceRevenueIds.length)fail('Invoice thiếu dòng chi tiết hoặc nguồn doanh thu.');
  if(!i.scopes.length||i.scopes.some(s=>!s.isCurrent||s.companyId!==companyId||s.partnerId!==i.partnerId||s.currency!==i.currency||s.status!=='INVOICE_READY'||s.items.some(v=>!v.isCurrent||v.companyId!==companyId)))fail('Phạm vi nguồn Invoice không còn hiệu lực.');
  const ids=i.scopes.flatMap(s=>s.items.map(v=>v.revenueId));
  if(new Set(ids).size!==ids.length||JSON.stringify([...ids].sort())!==JSON.stringify([...snap.sourceRevenueIds].sort()))fail('Nguồn Invoice không khớp phạm vi doanh thu.');
  for(const rid of ids){if(billed.has(rid))fail('Hai Invoice trong phương án cùng tính một nguồn doanh thu.');billed.add(rid);}
  const sourceIds=[...new Set([...ids,...lines.map((l:any)=>l.revenueId)])];
  if(sourceIds.length>2000||sourceIds.some(v=>typeof v!=='string'||!z.uuid().safeParse(v).success))fail('Tham chiếu doanh thu không hợp lệ.');
  const rows=await tx.revenue.findMany({where:{companyId,id:{in:sourceIds}},include:{reconciliation:true,service:true,contract:true}});
  if(rows.length!==sourceIds.length)fail('Không tìm thấy đủ doanh thu thuộc công ty.');
  for(const rv of rows){
   const j=rv.calculationJson as any,recon=rv.reconciliation;
   if(!rv.isCurrent||!['INVOICE_READY','INVOICED'].includes(rv.status)||!j?.dgc||!j.approvedById||!recon.isCurrent||recon.status!=='APPROVED'||recon.companyId!==companyId||rv.service.companyId!==companyId||rv.contract.companyId!==companyId||rv.partnerId!==i.partnerId||rv.currency!==i.currency||rv.periodStart.toISOString().slice(0,7)!==i.period)fail('Doanh thu/đối soát nguồn chưa duyệt, đã thay thế hoặc sai liên kết.');
   if(j.sourceKind==='MANUAL_PERIOD'){provenance.push(await assertManualRevenue(tx,companyId,rv));continue;}
   const u=await tx.outputReconUpload.findFirst({where:{companyId,id:j.uploadId,status:'APPROVED'},include:{attachment:true}}),f=(u?.extractionData as any)?.finalization;
   if(!u||!f?.documentId||f.reconciliationId!==recon.id||u.attachment.checksumSha256!==j.sourceChecksum||(recon.approvedSnapshot as any)?.sourceChecksum!==j.sourceChecksum)fail('Nguồn PDF đã chốt không khớp doanh thu.');
   const signed=await tx.document.findFirst({where:{companyId,id:f.documentId,status:'ACTIVE',entityId:u.id,documentType:'RECON_SIGNED'}});
   if(!signed)fail('PDF đối soát đã chốt không còn hiệu lực.');
   await derivedBytes(tx,companyId,signed.id,'RECON_SIGNED');
   provenance.push({id:rv.id,updatedAt:rv.updatedAt,calculation:j,reconUpdatedAt:recon.updatedAt,uploadUpdatedAt:u.updatedAt,signedId:signed.id});
  }
  for(const l of lines){
   const rv=rows.find(v=>v.id===l.revenueId);
   if(!rv||rv.serviceId!==l.serviceId||!['revenue','wht','payable'].every(f=>typeof l[f]==='string'&&(i.currency==='VND'?/^\d{1,16}(\.00)?$/:/^\d{1,16}\.\d{2}$/).test(l[f])))fail('Dòng Invoice âm, sai dịch vụ hoặc thiếu tiền.');
  }
  const headers=rows.filter(v=>ids.includes(v.id));
  if(headers.some(v=>(v.calculationJson as any).rowType!=='TOTAL'||(v.calculationJson as any).includeInMonthlyTotal!==true))fail('Invoice phải tính nguồn TOTAL; CHILD chỉ dùng chi tiết.');
  for(const [field,json,header] of [['revenue','invoiceRevenueUsd',i.revenueAmount],['wht','invoiceWhtUsd',i.whtAmount],['payable','invoicePayableUsd',i.payableAmount]] as const){
   const nativeField=field as 'revenue'|'wht'|'payable',expected=sums(headers.map(v=>revenueAmounts(v)),nativeField);
   if(header.lt(0)||sums(lines,field).minus(header).abs().gt('.02')||expected.minus(header).abs().gt('.02')||snap.totals?.[field]!==fixed(header))fail('Tổng Invoice/chi tiết/doanh thu không khớp (sai lệch tối đa 0,02 USD).');
  }
  if(!i.payableAmount.gt(0))fail('Invoice không có khoản phải thu dương.');
  const pdf=await tx.document.findFirst({where:{companyId,id:i.documentId,entityId:i.id,entityType:'Invoice',documentType:'INVOICE',status:'ACTIVE'}});
  if(!pdf)fail('PDF Invoice không còn hiệu lực.');await derivedBytes(tx,companyId,pdf.id,'INVOICE');
 }
 const digest=sha(JSON.stringify({all:all.map(i=>({id:i.id,status:i.status,updatedAt:i.updatedAt,ar:i.receivable,snapshot:i.snapshot,scopes:i.scopes})),provenance}));
 return {selected,candidates,digest};
}
export async function financeLedgerRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/dashboard/revenue',{preHandler:requirePermission('REVENUE_VIEW')},async request=>{
  const companyId=request.auth!.companyId;
  const rows=await prisma.revenue.findMany({where:{companyId,currency:{in:['USD','VND']},partner:{companyId},service:{companyId},contract:{companyId},isCurrent:true,status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'},calculationJson:{path:['dgc'],equals:true}},select:{currency:true,periodStart:true,serviceId:true,service:{select:{serviceName:true}},netAmount:true,calculationJson:true}});
  return dashboardSummary(rows,await reportingRates(prisma as any,companyId));
 });
 app.post('/api/v1/invoices/:id/issue-preview',{onRequest:writeGuard('INVOICE_ISSUE',config)},async request=>{
  const {id}=parse(idSchema,request.params);parse(z.object({}).strict(),request.body);
  return prisma.$transaction(async tx=>{const p=await issuePlan(tx,request.auth!.companyId,id);return {digest:p.digest,mode:p.selected.invoiceMode,items:p.candidates.map(i=>({id:i.id,invoiceNumber:i.invoiceNumber,payableAmount:fixed(i.payableAmount),dueDate:i.dueDate,currency:i.currency})),message:'Xác nhận Invoice đã gửi cho đối tác. Công nợ theo tiền tệ của từng Invoice.'};},{isolationLevel:'RepeatableRead',timeout:30000});
 });
 app.post('/api/v1/invoices/:id/issue',{onRequest:writeGuard('INVOICE_ISSUE',config)},async request=>{
  const {id}=parse(idSchema,request.params),body=parse(invoiceIssueConfirmation,request.body),user=request.auth!,historical='confirmedHistorical' in body;
  return prisma.$transaction(async tx=>{
   const inv=await tx.invoice.findFirst({where:{companyId:user.companyId,id}});if(!inv)throw new CommandError(404,'Không tìm thấy Invoice.');
   await financialPeriodLock(tx,user.companyId,inv.partnerId,inv.period);await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   const p=await issuePlan(tx,user.companyId,id);if(p.digest!==body.digest)fail('Nguồn hoặc Invoice đã thay đổi. Kiểm tra lại trước khi phát hành.');
   const now=new Date(),issued=[];
   for(const i of p.candidates){
    const ar=await tx.accountReceivable.create({data:{companyId:user.companyId,invoiceId:i.id,originalAmount:i.payableAmount,outstandingAmount:i.payableAmount}});
    await tx.invoice.update({where:{id:i.id},data:{status:'ISSUED',issuedAt:now,issuedById:user.userId}});
    await tx.invoiceScope.updateMany({where:{companyId:user.companyId,invoiceId:i.id,isCurrent:true},data:{status:'INVOICED'}});
    const sourceIds=i.scopes.flatMap(s=>s.items.map(v=>v.revenueId));
    await tx.revenue.updateMany({where:{companyId:user.companyId,id:{in:sourceIds}},data:{status:'INVOICED'}});
    if(await tx.accountReceivable.count({where:{companyId:user.companyId,invoiceId:i.id}})!==1)fail('Invoice phải có đúng một khoản phải thu.');
    await audit(tx,user,'INVOICE_ISSUE','Invoice',i.id,{status:'DRAFT'},{status:'ISSUED',issuedAt:now,receivableId:ar.id,originalAmount:fixed(ar.originalAmount),publicationMode:historical?'HISTORICAL':'SENT',...(historical?{historicalReason:body.historicalReason}:{})},historical?'Ghi nhận phát hành lịch sử và tạo phải thu: '+body.historicalReason:'Xác nhận đã gửi Invoice và tạo phải thu');
    issued.push({id:i.id,invoiceNumber:i.invoiceNumber,receivableId:ar.id});
   }
   return {items:issued,message:'Đã phát hành '+issued.length+' Invoice và ghi nhận '+issued.length+' khoản phải thu theo tiền tệ gốc.'};
  },{timeout:30000});
 });
 app.get('/api/v1/revenues',{preHandler:requirePermission('REVENUE_VIEW')},async request=>{
  const q=parse(filters.extend({details:z.enum(['true','false']).default('false'),serviceId:z.uuid().optional(),status:z.enum(['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']).optional()}).strict(),request.query),companyId=request.auth!.companyId;
  const start=q.period?new Date(q.period+'-01'):undefined;
  const where:Prisma.RevenueWhereInput={companyId,currency:{in:['USD','VND']},partner:{companyId},service:{companyId},contract:{companyId},isCurrent:true,status:q.status??{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'},...(start?{periodStart:start}:{}),...(q.partnerId?{partnerId:q.partnerId}:{}),...(q.serviceId?{serviceId:q.serviceId}:{}),calculationJson:{path:['dgc'],equals:true}};
  const totalsWhere={...where,AND:[{calculationJson:{path:['rowType'],equals:'TOTAL'}},{calculationJson:{path:['includeInMonthlyTotal'],equals:true}}]};
  return prisma.$transaction(async tx=>{
   const listWhere=q.details==='true'?where:totalsWhere;
   const [items,count,totals]=await Promise.all([tx.revenue.findMany({where:listWhere,include:{partner:{select:{legalName:true,partnerKey:true}},service:{select:{serviceName:true}},contract:{select:{contractCode:true}},reconciliation:{select:{reconCode:true}}},orderBy:[{periodStart:'desc'},{revenueCode:'asc'}],take:10,skip:(q.page-1)*10}),tx.revenue.count({where:listWhere}),tx.revenue.aggregate({where:{...totalsWhere,currency:'USD'},_sum:{netAmount:true}})]);
   const rates=await reportingRates(tx,companyId);
   const services=await tx.service.findMany({where:{companyId},select:{id:true,serviceKey:true,serviceName:true},orderBy:{serviceKey:'asc'}});
   return {services,items:items.map(v=>{const a=revenueAmounts(v),fxRate=reportingRate(v.periodStart.toISOString().slice(0,7),a.fxRate,rates);return {currency:v.currency,nativeRevenue:a.revenue,nativeWht:a.wht,nativePayable:a.payable,fxRate,equivalents:equivalents(a.revenue,v.currency,fxRate),payableEquivalents:equivalents(v.netAmount,v.currency,fxRate),id:v.id,revenueCode:v.revenueCode,period:v.periodStart.toISOString().slice(0,7),status:v.status,partner:v.partner.legalName,partnerKey:v.partner.partnerKey,service:v.service.serviceName,contract:v.contract.contractCode,reconciliation:v.reconciliation.reconCode,rowType:(v.calculationJson as any)?.rowType,invoiceRevenueUsd:(v.calculationJson as any)?.invoiceRevenueUsd,invoiceWhtUsd:(v.calculationJson as any)?.invoiceWhtUsd,invoicePayableUsd:(v.calculationJson as any)?.invoicePayableUsd,uploadId:(v.calculationJson as any)?.uploadId};}),total:count,page:q.page,monthlyPayableUsd:fixed(totals._sum.netAmount??D('0'))};
  },{isolationLevel:'RepeatableRead'});
 });
 app.get('/api/v1/receivables',{preHandler:requirePermission('AR_VIEW')},async request=>{
  const q=parse(filters.extend({asOf:date}).strict(),request.query),companyId=request.auth!.companyId;
  const where={companyId,outstandingAmount:{gt:0},invoice:{companyId,partner:{companyId},currency:{in:['USD','VND']},isCurrent:true,status:{in:sent},...(q.period?{period:q.period}:{}),...(q.partnerId?{partnerId:q.partnerId}:{})}};
  return prisma.$transaction(async tx=>{
   const [rows,total,s]=await Promise.all([tx.accountReceivable.findMany({where,include:{invoice:{include:{partner:{select:{legalName:true,partnerKey:true}}}}},orderBy:[{invoice:{period:'desc'}},{invoice:{invoiceNumber:'asc'}},{id:'asc'}],skip:(q.page-1)*10,take:10}),tx.accountReceivable.count({where}),tx.accountReceivable.aggregate({where:{...where,invoice:{...where.invoice,currency:'USD'}},_sum:{originalAmount:true,paidAmount:true,outstandingAmount:true}})]);
   const byCurrency=await Promise.all(['USD','VND'].map(async currency=>{const t=await tx.accountReceivable.aggregate({where:{...where,invoice:{...where.invoice,currency}},_sum:{originalAmount:true,paidAmount:true,outstandingAmount:true}});return {currency,original:nativeAmount(t._sum.originalAmount??D('0'),currency),paid:nativeAmount(t._sum.paidAmount??D('0'),currency),outstanding:nativeAmount(t._sum.outstandingAmount??D('0'),currency)};}));
   const partners=await tx.partner.findMany({where:{companyId},select:{id:true,partnerKey:true},orderBy:{partnerKey:'asc'},take:1000});
   return {partners,totalsByCurrency:byCurrency,items:rows.map(ar=>{const i=ar.invoice,days=ar.outstandingAmount.gt(0)?Math.max(0,Math.floor((new Date(q.asOf).getTime()-i.dueDate.getTime())/86400000)):0;return {id:ar.id,invoiceId:i.id,invoiceNumber:i.invoiceNumber,partner:i.partner.legalName,partnerKey:i.partner.partnerKey,period:i.period,invoiceDate:i.invoiceDate,dueDate:i.dueDate,currency:i.currency,originalAmount:fixed(ar.originalAmount),paidAmount:fixed(ar.paidAmount),outstandingAmount:fixed(ar.outstandingAmount),status:days>0&&ar.status==='OPEN'?'OVERDUE':ar.status,agingDays:days};}),total,page:q.page,asOf:q.asOf,totals:{original:fixed(s._sum.originalAmount??D('0')),paid:fixed(s._sum.paidAmount??D('0')),outstanding:fixed(s._sum.outstandingAmount??D('0'))}};
  },{isolationLevel:'RepeatableRead'});
 });
}
