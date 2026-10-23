import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,parse,writeGuard,timestamp,unchanged} from './commands.js';
import {sha,derivedBytes} from './financial-documents.js';
import {financialPeriodLock} from './recon-finalize.js';
import {sourceBytes} from './output-recon.js';
import {assertManualRevenue} from './manual-revenue.js';
import {calculateInputRecon} from './input-recon-math.js';

const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v);
function fail(s:string):never{throw new CommandError(409,s);}
export const inputDigest=(v:unknown)=>sha(JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value));
export function assertInputSnapshot(r:Prisma.InputReconciliationGetPayload<{}>){
 const s=r.sourceSnapshot as any;
 if(!s?.data||inputDigest(s)!==r.sourceDigest||Object.entries(s.data).some(([k,v])=>String((r as any)[k]?.toFixed?.()??(r as any)[k])!==String(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)?D(v).toFixed():v)))fail('Số liệu đối soát không khớp snapshot đã lưu.');
}
const period=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const id=(v:unknown)=>parse(z.object({id:z.uuid()}).strict(),v).id;
const includes={sourceRevenue:true,inputPartner:true,inputContract:true,outputPartner:true,outputContract:true,service:true,payable:true} as const;
export const inputReconDto=(r:Prisma.InputReconciliationGetPayload<{include:typeof includes}>)=>({...r,sourceSnapshot:undefined,inputPartnerKey:r.inputPartner.partnerKey,outputPartnerKey:r.outputPartner.partnerKey,serviceKey:r.service.serviceKey,serviceName:r.service.serviceName,inputContractCode:r.inputContract.contractCode,sourceRevenueCode:r.sourceRevenue.revenueCode});
export async function requireDgc(tx:Prisma.TransactionClient,companyId:string){if((await tx.company.findUniqueOrThrow({where:{id:companyId}})).companyCode!=='DGC')throw new CommandError(404,'Chức năng đối soát đầu vào dành cho DGC.');}

export async function inputReconPlan(tx:Prisma.TransactionClient,companyId:string,revenueId:string){
 await requireDgc(tx,companyId);
 const rv=await tx.revenue.findFirst({where:{companyId,id:revenueId},include:{reconciliation:true,service:true,contract:true,partner:true}});
 if(!rv)throw new CommandError(404,'Không tìm thấy doanh thu của công ty.');
 const rec=rv.reconciliation,j=rv.calculationJson as any;
 if(!rv.isCurrent||!['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID'].includes(rv.status)||rec.status!=='APPROVED'||!rec.isCurrent||!rec.approvedById||!j?.dgc||!j.approvedById||[rv.service,rv.contract,rv.partner,rec].some(x=>x.companyId!==companyId)||rv.contract.dgcDirection!=='Output'||rv.contract.partnerId!==rv.partnerId||rec.partnerId!==rv.partnerId||!['USD','VND'].includes(rv.currency))fail('Cần doanh thu đầu ra đã duyệt, còn hiệu lực và đúng liên kết công ty.');
 let base:string,provenance:unknown;
 if(j.sourceKind==='MANUAL_PERIOD'){
  await assertManualRevenue(tx,companyId,rv);
  if(rv.currency==='VND'&&(!j.reportingFxRate||!D(j.reportingFxRate).gt(0)))fail('Nguồn VND thiếu tỷ giá USD đã duyệt.');
  base=rv.currency==='USD'?rv.netAmount.toFixed(2):rv.netAmount.div(j.reportingFxRate).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
  provenance={kind:'MANUAL_PERIOD',entryChecksum:j.entryChecksum,payload:rec.validatedPayload};
 }else{
  const u=await tx.outputReconUpload.findFirst({where:{companyId,id:j.uploadId,status:'APPROVED'},include:{attachment:true}}),s=rec.approvedSnapshot as any,f=(u?.extractionData as any)?.financial,final=(u?.extractionData as any)?.finalization;
  const detail=s?.financial?.details?.find((d:any)=>d.lineNo===j.lineNo),binding=s?.bindings?.find((b:any)=>b.lineNo===j.lineNo);
  if(!u||rv.currency!=='USD'||!detail||binding?.serviceId!==rv.serviceId||binding?.contractId!==rv.contractId||final?.reconciliationId!==rec.id||!final.documentId||s.uploadId!==u.id||s.sourceChecksum!==j.sourceChecksum||u.attachment.checksumSha256!==j.sourceChecksum||inputDigest(f)!==inputDigest(s.financial)||!rv.netAmount.eq(detail.usd.partnerRevenue)||typeof j.invoicePayableUsd!=='string'||!D(j.invoicePayableUsd).eq(detail.usd.partnerRevenue))fail('Doanh thu không khớp PDF nguồn và bản đối soát đã duyệt.');
  if(!await tx.document.findFirst({where:{companyId,id:final.documentId,status:'ACTIVE',documentType:'RECON_SIGNED',entityType:'OutputReconUpload',entityId:u.id}}))fail('PDF đối soát đã chốt không còn hiệu lực.');
  await sourceBytes(u);await derivedBytes(tx,companyId,final.documentId,'RECON_SIGNED');
  base=D(j.invoicePayableUsd).toFixed(2);provenance={kind:'OUTPUT_PDF',uploadId:u.id,sourceChecksum:j.sourceChecksum,financial:s.financial,binding};
 }
 const p=rv.periodStart.toISOString().slice(0,7),start=new Date(p+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
 if(rv.periodStart.getTime()!==start.getTime()||rv.periodEnd.getTime()!==end.getTime())fail('Doanh thu phải thuộc đúng một kỳ tháng.');
 const contracts=await tx.contract.findMany({where:{companyId,dgcDirection:'Input',status:'ACTIVE',AND:[{OR:[{effectiveDate:null},{effectiveDate:{lte:end}}]},{OR:[{expiryDate:null},{expiryDate:{gte:start}}]}],services:{some:{companyId,serviceId:rv.serviceId,status:'ACTIVE',dgcStatus:'ACTIVE'}}},include:{partner:true,services:{where:{companyId,serviceId:rv.serviceId,status:'ACTIVE',dgcStatus:'ACTIVE'}}},take:1001});
 if(contracts.length>1000)fail('Vượt giới hạn hợp đồng cần kiểm tra.');
 const matches=contracts.flatMap(c=>c.services.filter(cs=>(!cs.effectiveFrom||cs.effectiveFrom<=end)&&(!cs.effectiveTo||cs.effectiveTo>=start)).map(cs=>({c,cs})));
 if(matches.length!==1)fail(matches.length?'Có nhiều hợp đồng/liên kết Input cùng hiệu lực; cần đối chiếu trước khi tính.':'Chưa có một hợp đồng Input Active cho đúng dịch vụ và kỳ.');
 const {c,cs}=matches[0];
 if(c.partner.companyId!==companyId||c.partner.status!=='ACTIVE'||!['USD','VND'].includes(c.currency??''))fail('Đối tác Input phải Active và hợp đồng dùng USD/VND.');
 const rate=cs.revenueShareRate?.gt(0)?cs.revenueShareRate:c.revenueShareRate;
 if(!rate)fail('Hợp đồng Input chưa có tỷ lệ chia sẻ hợp lệ.');
 const fx=c.currency==='USD'?null:await tx.configuration.findUnique({where:{companyId_configKey:{companyId,configKey:'REVENUE_FX:'+p}}});
 if(c.currency==='VND'&&(!fx||fx.isSecret||!fx.configValue))fail('Thiếu tỷ giá USD/VND chung đã xác nhận cho kỳ '+p+'.');
 let fxValue='1';if(fx){try{fxValue=JSON.parse(fx.configValue!).rate;if(typeof fxValue!=='string'||!/^\d{1,8}(\.\d{1,8})?$/.test(fxValue)||!D(fxValue).gt(0))throw Error();}catch{fail('Tỷ giá kỳ không hợp lệ.');}}
 const amounts=calculateInputRecon(base,rate.toFixed(),fxValue,c.taxRate?.toFixed()??'0',c.currency!);
 const data={period:p,sourceRevenueId:rv.id,serviceId:rv.serviceId,outputPartnerId:rv.partnerId,outputContractId:rv.contractId,inputPartnerId:c.partnerId,inputContractId:c.id,...amounts};
 // Invoice/payment lifecycle changes alone do not alter the financial source.
 const snapshot={data,provenance,inputContract:{id:c.id,status:c.status,currency:c.currency,partnerId:c.partnerId,effectiveDate:c.effectiveDate,expiryDate:c.expiryDate,taxRate:c.taxRate,revenueShareRate:c.revenueShareRate},contractService:{id:cs.id,status:cs.status,dgcStatus:cs.dgcStatus,effectiveFrom:cs.effectiveFrom,effectiveTo:cs.effectiveTo,revenueShareRate:cs.revenueShareRate},fx:fx?{id:fx.id,value:fx.configValue}:null};
 return {data,snapshot,sourceDigest:inputDigest(snapshot),summary:{sourceRevenueCode:rv.revenueCode,serviceKey:rv.service.serviceKey,serviceName:rv.service.serviceName,outputPartnerKey:rv.partner.partnerKey,inputPartnerKey:c.partner.partnerKey,inputContractCode:c.contractCode},existing:await tx.inputReconciliation.findUnique({where:{companyId_sourceRevenueId:{companyId,sourceRevenueId:rv.id}}})};
}
export async function lockInputSource(tx:Prisma.TransactionClient,companyId:string,revenueId:string){
 const rv=await tx.revenue.findFirst({where:{companyId,id:revenueId}});if(!rv)throw new CommandError(404,'Không tìm thấy nguồn doanh thu.');
 await financialPeriodLock(tx,companyId,rv.partnerId,rv.periodStart.toISOString().slice(0,7));
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
}
export async function inputReconRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/input-recon/sources',{preHandler:requirePermission('INPUT_RECON_VIEW')},async req=>{
  const q=parse(z.object({period:period.optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where:Prisma.RevenueWhereInput={companyId,isCurrent:true,currency:{in:['USD','VND']},status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'},inputReconciliations:{none:{}},...(q.period?{periodStart:new Date(q.period+'-01')}:{})};
   const [rows,total]=await Promise.all([tx.revenue.findMany({where,include:{partner:true,service:true},orderBy:[{periodStart:'desc'},{revenueCode:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.revenue.count({where})]);
   const items=[];for(const r of rows){try{const p=await inputReconPlan(tx,companyId,r.id);items.push({id:r.id,...p.summary,...p.data,ready:true});}catch(e){if(!(e instanceof CommandError))throw e;items.push({id:r.id,period:r.periodStart.toISOString().slice(0,7),sourceRevenueCode:r.revenueCode,serviceKey:r.service.serviceKey,outputPartnerKey:r.partner.partnerKey,ready:false,message:e.message});}}
   return {items,total,page:q.page,limit:10};
  },{isolationLevel:'RepeatableRead',timeout:30000});
 });
 app.post('/api/v1/input-recon/preview',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{const b=parse(z.object({revenueId:z.uuid()}).strict(),req.body);return prisma.$transaction(async tx=>{const p=await inputReconPlan(tx,req.auth!.companyId,b.revenueId);return {...p.data,...p.summary,digest:p.sourceDigest,existing:p.existing?{id:p.existing.id,status:p.existing.status,updatedAt:p.existing.updatedAt}:null};},{isolationLevel:'RepeatableRead',timeout:30000});});
 app.post('/api/v1/input-recon/generate',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async(req,reply)=>{
  const b=parse(z.object({revenueId:z.uuid(),digest,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  const result=await prisma.$transaction(async tx=>{await lockInputSource(tx,user.companyId,b.revenueId);const p=await inputReconPlan(tx,user.companyId,b.revenueId);if(p.sourceDigest!==b.digest)fail('Nguồn, hợp đồng hoặc tỷ giá đã thay đổi. Xem lại trước khi tạo.');
   if(p.existing){if(p.existing.sourceDigest!==p.sourceDigest)fail('Đã có đối soát nhưng nguồn thay đổi; cần xem lại bản nháp.');return {item:p.existing,created:false};}
   const item=await tx.inputReconciliation.create({data:{companyId:user.companyId,inputReconCode:await code(tx,user.companyId,'INPUT_RECON','IR'),...p.data,sourceDigest:p.sourceDigest,sourceSnapshot:JSON.parse(JSON.stringify(p.snapshot)),createdById:user.userId}});
   await audit(tx,user,'INPUT_RECON_GENERATE','InputReconciliation',item.id,null,item);return {item,created:true};
  },{timeout:30000});return reply.code(result.created?201:200).send(result);
 });
 app.get('/api/v1/input-recon',{preHandler:requirePermission('INPUT_RECON_VIEW')},async req=>{const q=parse(z.object({period:period.optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where={companyId,...(q.period?{period:q.period}:{})};const [rows,total]=await Promise.all([tx.inputReconciliation.findMany({where,include:includes,orderBy:[{period:'desc'},{inputReconCode:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.inputReconciliation.count({where})]);return {items:rows.map(inputReconDto),total,page:q.page,limit:10};});});
 app.post('/api/v1/input-recon/:id/refresh',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,digest,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{const old=await tx.inputReconciliation.findFirst({where:{companyId:user.companyId,id:rid}});if(!old)throw new CommandError(404,'Không tìm thấy đối soát.');await lockInputSource(tx,user.companyId,old.sourceRevenueId);const r=await tx.inputReconciliation.findUniqueOrThrow({where:{id:rid},include:{payable:true}});unchanged(r,b.expectedUpdatedAt);if(!['DRAFT','GENERATED'].includes(r.status)||r.payable)fail('Bản đã duyệt/có AP không được tính lại.');const p=await inputReconPlan(tx,user.companyId,r.sourceRevenueId);if(p.sourceDigest!==b.digest)fail('Nguồn đã thay đổi; cần xem lại.');
   if(r.documentId){await tx.document.update({where:{id:r.documentId},data:{status:'SUPERSEDED'}});await tx.inputReconciliation.updateMany({where:{companyId:user.companyId,documentId:r.documentId,status:'GENERATED'},data:{documentId:null,status:'DRAFT'}});}
   const item=await tx.inputReconciliation.update({where:{id:rid},data:{...p.data,status:'DRAFT',documentId:null,sourceDigest:p.sourceDigest,sourceSnapshot:JSON.parse(JSON.stringify(p.snapshot))}});await audit(tx,user,'INPUT_RECON_REFRESH','InputReconciliation',rid,r,item,'Explicit draft recalculation after source review');return {item};
  },{timeout:30000});
 });
 app.post('/api/v1/input-recon/:id/approve',{onRequest:writeGuard('INPUT_RECON_APPROVE',config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{await requireDgc(tx,user.companyId);const initial=await tx.inputReconciliation.findFirst({where:{companyId:user.companyId,id:rid}});if(!initial)throw new CommandError(404,'Không tìm thấy đối soát.');await lockInputSource(tx,user.companyId,initial.sourceRevenueId);const r=await tx.inputReconciliation.findUniqueOrThrow({where:{id:rid},include:{payable:true}});
   assertInputSnapshot(r);
   if(r.status==='APPROVED'){if(!r.payable||!r.payable.originalAmount.eq(r.payableAmount)||r.payable.currency!==r.currency||!r.payable.outstandingAmount.eq(r.payable.originalAmount.minus(r.payable.paidAmount)))fail('AP không khớp bản đã duyệt; cần đối chiếu.');return {item:r,payable:r.payable,created:false};}
   unchanged(r,b.expectedUpdatedAt);if(!['DRAFT','GENERATED'].includes(r.status)||r.payable)fail('Trạng thái đối soát không cho phép duyệt.');const p=await inputReconPlan(tx,user.companyId,r.sourceRevenueId);if(p.sourceDigest!==r.sourceDigest)fail('Nguồn hoặc số liệu nháp đã thay đổi. Cần xem lại/cập nhật trước khi duyệt.');
   const payable=await tx.accountPayable.create({data:{companyId:user.companyId,inputReconId:r.id,currency:r.currency,originalAmount:r.payableAmount,outstandingAmount:r.payableAmount}});
   const item=await tx.inputReconciliation.update({where:{id:r.id},data:{status:'APPROVED',approvedById:user.userId,approvedAt:new Date()}});await audit(tx,user,'INPUT_RECON_APPROVE','InputReconciliation',r.id,r,{item,payable});return {item,payable,created:true};
  },{timeout:30000});
 });
 app.get('/api/v1/payables',{preHandler:requirePermission('AP_VIEW')},async req=>{
  const q=parse(z.object({period:period.optional(),partnerId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where:Prisma.AccountPayableWhereInput={companyId,inputReconciliation:{companyId,status:'APPROVED',...(q.period?{period:q.period}:{}),...(q.partnerId?{inputPartnerId:q.partnerId}:{})}};const [rows,total,sums]=await Promise.all([tx.accountPayable.findMany({where,include:{inputReconciliation:{include:includes}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.accountPayable.count({where}),tx.accountPayable.groupBy({by:['currency'],where,_sum:{originalAmount:true,paidAmount:true,outstandingAmount:true}})]);return {items:rows.map(r=>({...r,inputReconciliation:inputReconDto(r.inputReconciliation),dueDate:null})),total,page:q.page,limit:10,totalsByCurrency:sums.map(r=>({currency:r.currency,...r._sum}))};});
 });
}
