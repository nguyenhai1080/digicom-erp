import {inputContractSources,inputContractCoverage} from './input-recon-coverage.js';
import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,parse,writeGuard,timestamp,unchanged} from './commands.js';
import {sha,derivedBytes} from './financial-documents.js';
import {financialPeriodLock} from './recon-finalize.js';
import {sourceBytes} from './output-recon.js';
import {assertManualRevenue} from './manual-revenue.js';
import {assertCapturedRevenue} from './captured-book-source.js';
import {calculateInputRecon} from './input-recon-math.js';

const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v);
function fail(s:string):never{throw new CommandError(409,s);}
export const inputDigest=(v:unknown)=>sha(JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value));
export function assertInputSnapshot(r:Prisma.InputReconciliationGetPayload<{}>){
 const s=r.sourceSnapshot as any;
 if(!s?.data||inputDigest(s)!==r.sourceDigest||Object.entries(s.data).some(([k,v])=>String((r as any)[k]?.toFixed?.()??(r as any)[k])!==String(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)?D(v).toFixed():v)))fail('Số liệu đối soát không khớp snapshot đã lưu.');
}
export function isCapturedInput(r:{sourceSnapshot:Prisma.JsonValue}){return (r.sourceSnapshot as any)?.sourceKind==='DGC_CAPTURED_BOOK_V1';}
export async function assertCapturedInputSource(tx:Prisma.TransactionClient,companyId:string,r:Prisma.InputReconciliationGetPayload<{}>){
 assertInputSnapshot(r);
 const snapshot=r.sourceSnapshot as any,s=snapshot?.source;
 if(!isCapturedInput(r)||r.companyId!==companyId||!s)fail('Không khớp hồ sơ đầu vào đã chuyển.');
 const link=await tx.dgcImportLink.findFirst({where:{companyId,targetModel:'inputReconciliation',targetId:r.id,snapshotHash:snapshot.snapshotHash,rowHash:s.rowHash,sheetId:s.sheetId,sourceRow:s.sourceRow}});
 if(!link||!await tx.auditLog.findFirst({where:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'}}))fail('Chưa có biên nhận chuyển đối soát đầu vào.');
}
const period=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const id=(v:unknown)=>parse(z.object({id:z.uuid()}).strict(),v).id;
const includes={sourceRevenue:true,inputPartner:true,inputContract:true,outputPartner:true,outputContract:true,service:true,payable:true} as const;
export const inputReconDto=(r:Prisma.InputReconciliationGetPayload<{include:typeof includes}>)=>({...r,sourceSnapshot:undefined,capturedHistory:isCapturedInput(r),sourceStatus:isCapturedInput(r)?(r.sourceSnapshot as any).sourceStatus:null,inputPartnerKey:r.inputPartner.partnerKey,outputPartnerKey:r.outputPartner.partnerKey,serviceKey:r.service.serviceKey,serviceName:r.service.serviceName,inputContractCode:r.inputContract.contractCode,sourceRevenueCode:r.sourceRevenue.revenueCode});
export async function requireDgc(tx:Prisma.TransactionClient,companyId:string){if((await tx.company.findUniqueOrThrow({where:{id:companyId}})).companyCode!=='DGC')throw new CommandError(404,'Chức năng đối soát đầu vào dành cho DGC.');}

export async function inputReconPlan(tx:Prisma.TransactionClient,companyId:string,revenueId:string){
 await requireDgc(tx,companyId);
 const rv=await tx.revenue.findFirst({where:{companyId,id:revenueId},include:{reconciliation:true,service:true,contract:true,partner:true}});
 if(!rv)throw new CommandError(404,'Không tìm thấy doanh thu của công ty.');
 const rec=rv.reconciliation,j=rv.calculationJson as any;
 if(!rv.isCurrent||!['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID'].includes(rv.status)||rec.status!=='APPROVED'||!rec.isCurrent||(!rec.approvedById&&j?.sourceKind!=='DGC_CAPTURED_BOOK_V1')||!j?.dgc||(!j.approvedById&&j.sourceKind!=='DGC_CAPTURED_BOOK_V1')||[rv.service,rv.contract,rv.partner,rec].some(x=>x.companyId!==companyId)||rv.contract.dgcDirection!=='Output'||rv.contract.partnerId!==rv.partnerId||rec.partnerId!==rv.partnerId||!['USD','VND'].includes(rv.currency))fail('Cần doanh thu đầu ra đã duyệt, còn hiệu lực và đúng liên kết công ty.');
 let base:string,provenance:unknown;
 if(j.sourceKind==='DGC_CAPTURED_BOOK_V1'){
  provenance=await assertCapturedRevenue(tx,companyId,rv);base=D(j.invoicePayableUsd).toFixed(2);
 }else if(j.sourceKind==='MANUAL_PERIOD'){
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
const batchSelection=z.object({revenueIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,'Không chọn nguồn trùng.')}).strict();
async function inputBatchPlan(tx:Prisma.TransactionClient,companyId:string,revenueIds:string[],expand=false){
 let plans:Awaited<ReturnType<typeof inputReconPlan>>[]=[];for(const revenueId of [...revenueIds].sort())plans.push(await inputReconPlan(tx,companyId,revenueId));
 if(new Set(plans.map(p=>[p.data.period,p.data.inputContractId,p.data.outputPartnerId].join('|'))).size!==1)fail('Chọn các dịch vụ cùng kỳ, hợp đồng đầu vào và đối tác đầu ra để lập một biên bản.');
 const seed=plans[0],coverage=await inputContractCoverage(tx,companyId,seed.data.inputContractId,seed.data.period,seed.data.outputPartnerId),sources=coverage.sources;
 if(expand){plans=[];for(const source of sources)plans.push(await inputReconPlan(tx,companyId,source.id));}
 else if(sources.length!==plans.length||sources.some(r=>!plans.some(p=>p.data.sourceRevenueId===r.id)))fail('Phải lập đủ dịch vụ và nguồn của hợp đồng/kỳ. Xem lại toàn bộ hợp đồng trước khi tạo.');
 if(plans.some(p=>p.existing&&(p.existing.sourceDigest!==p.sourceDigest||isCapturedInput(p.existing))))fail('Một nguồn đã có đối soát khác cơ sở tính; xem lại riêng bản đã tạo.');
 for(const p of plans)if(p.existing)assertInputSnapshot(p.existing);
 const first=plans[0];
 return {plans,excludedServices:coverage.excludedServices,digest:inputDigest(plans.map(p=>({revenueId:p.data.sourceRevenueId,digest:p.sourceDigest}))),period:first.data.period,outputPartnerId:first.data.outputPartnerId,inputContractId:first.data.inputContractId,inputPartnerId:first.data.inputPartnerId,inputContractCode:first.summary.inputContractCode,inputPartnerKey:first.summary.inputPartnerKey,currency:first.data.currency,payableAmount:plans.reduce((sum,p)=>sum.plus(p.data.payableAmount),D('0')).toFixed(2)};
}
export async function inputReconRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/input-recon/contract-preview',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{
  const b=parse(z.object({inputContractId:z.uuid(),period,outputPartnerId:z.uuid().optional()}).strict(),req.body),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{
   await requireDgc(tx,companyId);
   const contract=await tx.contract.findFirst({where:{companyId,id:b.inputContractId,dgcDirection:'Input'},include:{services:{where:{companyId}}}});if(!contract)throw new CommandError(404,'Không tìm thấy hợp đồng đầu vào.');
   const partners=await tx.revenue.findMany({where:{companyId,isCurrent:true,periodStart:new Date(b.period+'-01'),serviceId:{in:contract.services.map(s=>s.serviceId)},status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},...(b.outputPartnerId?{partnerId:b.outputPartnerId}:{})},distinct:['partnerId'],select:{partnerId:true},take:2});
   if(partners.length!==1)fail(partners.length?'Hợp đồng/kỳ có nhiều mạng đầu ra; cần chọn đúng đối tác đầu ra.':'Chưa có nguồn đã chốt cho hợp đồng/kỳ này.');
   const scope=await inputContractSources(tx,companyId,contract.id,b.period,partners[0].partnerId),plan=await inputBatchPlan(tx,companyId,scope.map(r=>r.id),true);
   return {...plan,plans:undefined,items:plan.plans.map(p=>({...p.data,...p.summary,existing:!!p.existing}))};
  },{isolationLevel:'RepeatableRead',timeout:60000});
 });
 app.get('/api/v1/input-recon/contracts',{preHandler:requirePermission('INPUT_RECON_VIEW')},async req=>{
  const companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const rows=await tx.contract.findMany({where:{companyId,dgcDirection:'Input',partner:{companyId}},include:{partner:true},orderBy:[{contractCode:'asc'},{id:'asc'}],take:1001});if(rows.length>1000)fail('Vượt giới hạn danh mục hợp đồng đầu vào.');const networks=await tx.revenue.findMany({where:{companyId,isCurrent:true,reconciliation:{companyId,status:'APPROVED'}},distinct:['partnerId'],select:{partner:{select:{id:true,partnerKey:true}}},take:1001});if(networks.length>1000)fail('Vượt giới hạn mạng đầu ra.');return {outputPartners:networks.map(r=>r.partner),items:rows.map(c=>({id:c.id,contractCode:c.contractCode,contractNumber:c.contractNumber,partnerKey:c.partner.partnerKey,status:c.status,currency:c.currency}))};});
 });
 for(const action of ['batch-preview','batch-generate'] as const)app.post('/api/v1/input-recon/'+action,{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async(req,reply)=>{
  const b=parse(action==='batch-preview'?batchSelection:batchSelection.extend({digest,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  const result=await prisma.$transaction(async tx=>{
   // All members must share the same period/output partner before the one existing scope lock.
   const before=await inputBatchPlan(tx,user.companyId,b.revenueIds,action==='batch-preview');
   if(action==='batch-preview')return {...before,plans:undefined,items:before.plans.map(p=>({...p.data,...p.summary,existing:!!p.existing}))};
   await lockInputSource(tx,user.companyId,b.revenueIds[0]);
   const plan=await inputBatchPlan(tx,user.companyId,b.revenueIds);
   if(!('digest'in b)||b.digest!==plan.digest)fail('Nguồn, hợp đồng hoặc tỷ giá đã thay đổi. Xem lại danh sách trước khi tạo.');
   const items=[];let created=0;
   for(const p of plan.plans){if(p.existing){items.push(p.existing);continue;}
    const item=await tx.inputReconciliation.create({data:{companyId:user.companyId,inputReconCode:await code(tx,user.companyId,'INPUT_RECON','IR'),...p.data,sourceDigest:p.sourceDigest,sourceSnapshot:JSON.parse(JSON.stringify(p.snapshot)),createdById:user.userId}});
    await audit(tx,user,'INPUT_RECON_GENERATE','InputReconciliation',item.id,null,item);items.push(item);created++;
   }
   return {items,created,existing:items.length-created,period:plan.period,inputContractId:plan.inputContractId,inputPartnerId:plan.inputPartnerId};
  },{isolationLevel:'ReadCommitted',timeout:60000});
  return reply.code('created'in result&&result.created?201:200).send(result);
 });
 app.get('/api/v1/input-recon/sources',{preHandler:requirePermission('INPUT_RECON_VIEW')},async req=>{
  const q=parse(z.object({period:period.optional(),inputContractId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where:Prisma.RevenueWhereInput={companyId,isCurrent:true,currency:{in:['USD','VND']},status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'},inputReconciliations:{none:{}},service:{contractServices:{some:{companyId,contract:{companyId,dgcDirection:'Input'},...(q.inputContractId?{contractId:q.inputContractId}:{})}}},...(q.period?{periodStart:new Date(q.period+'-01')}:{})};
   const [rows,total]=await Promise.all([tx.revenue.findMany({where,include:{partner:true,service:true},orderBy:[{periodStart:'desc'},{revenueCode:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.revenue.count({where})]);
   const items=[];for(const r of rows){try{const p=await inputReconPlan(tx,companyId,r.id);if((await inputContractCoverage(tx,companyId,p.data.inputContractId,p.data.period,p.data.outputPartnerId)).excludedSourceIds.includes(r.id))fail('Dòng tổng chỉ để tham chiếu; biên bản dùng các dịch vụ con, không cộng thêm dòng này.');if(q.inputContractId&&p.data.inputContractId!==q.inputContractId)fail('Nguồn thuộc hợp đồng đầu vào khác đang hiệu lực; chọn đúng hợp đồng để tạo.');items.push({id:r.id,...p.summary,...p.data,ready:true});}catch(e){if(!(e instanceof CommandError))throw e;items.push({id:r.id,period:r.periodStart.toISOString().slice(0,7),sourceRevenueCode:r.revenueCode,serviceKey:r.service.serviceKey,outputPartnerKey:r.partner.partnerKey,ready:false,message:e.message});}}
   return {items,total,page:q.page,limit:10};
  },{isolationLevel:'RepeatableRead',timeout:30000});
 });
 app.post('/api/v1/input-recon/preview',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{const b=parse(z.object({revenueId:z.uuid()}).strict(),req.body);return prisma.$transaction(async tx=>{const p=await inputReconPlan(tx,req.auth!.companyId,b.revenueId);return {...p.data,...p.summary,digest:p.sourceDigest,existing:p.existing?{id:p.existing.id,status:p.existing.status,updatedAt:p.existing.updatedAt}:null};},{isolationLevel:'RepeatableRead',timeout:30000});});
 app.post('/api/v1/input-recon/generate',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async(req,reply)=>{
  const b=parse(z.object({revenueId:z.uuid(),digest,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  const result=await prisma.$transaction(async tx=>{await lockInputSource(tx,user.companyId,b.revenueId);const p=await inputReconPlan(tx,user.companyId,b.revenueId);if(p.sourceDigest!==b.digest)fail('Nguồn, hợp đồng hoặc tỷ giá đã thay đổi. Xem lại trước khi tạo.');if(!(await inputContractSources(tx,user.companyId,p.data.inputContractId,p.data.period,p.data.outputPartnerId)).some(source=>source.id===p.data.sourceRevenueId)||(await inputContractSources(tx,user.companyId,p.data.inputContractId,p.data.period,p.data.outputPartnerId)).length>1)fail('Hợp đồng có nhiều dịch vụ/nguồn; dùng Lập đủ dịch vụ hợp đồng, không tạo nháp riêng từng dòng.');
   if(p.existing){if(p.existing.sourceDigest!==p.sourceDigest)fail('Đã có đối soát nhưng nguồn thay đổi; cần xem lại bản nháp.');return {item:p.existing,created:false};}
   const item=await tx.inputReconciliation.create({data:{companyId:user.companyId,inputReconCode:await code(tx,user.companyId,'INPUT_RECON','IR'),...p.data,sourceDigest:p.sourceDigest,sourceSnapshot:JSON.parse(JSON.stringify(p.snapshot)),createdById:user.userId}});
   await audit(tx,user,'INPUT_RECON_GENERATE','InputReconciliation',item.id,null,item);return {item,created:true};
  },{timeout:30000});return reply.code(result.created?201:200).send(result);
 });
 app.get('/api/v1/input-recon',{preHandler:requirePermission('INPUT_RECON_VIEW')},async req=>{const q=parse(z.object({period:period.optional(),inputContractId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where={companyId,...(q.period?{period:q.period}:{}),...(q.inputContractId?{inputContractId:q.inputContractId}:{})};const [rows,total]=await Promise.all([tx.inputReconciliation.findMany({where,include:includes,orderBy:[{period:'desc'},{inputReconCode:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.inputReconciliation.count({where})]);const scopes=new Map<string,string[]>();for(const row of rows){if(isCapturedInput(row))continue;const key=[row.inputContractId,row.period,row.outputPartnerId].join('|');if(!scopes.has(key)){try{scopes.set(key,(await inputContractCoverage(tx,companyId,row.inputContractId,row.period,row.outputPartnerId)).excludedServiceIds);}catch(e){if(!(e instanceof CommandError))throw e;scopes.set(key,[]);}}}return {items:rows.map(row=>({...inputReconDto(row),aggregateReference:(scopes.get([row.inputContractId,row.period,row.outputPartnerId].join('|'))??[]).includes(row.serviceId)})),total,page:q.page,limit:10};});});
 app.post('/api/v1/input-recon/:id/refresh',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,digest,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{const old=await tx.inputReconciliation.findFirst({where:{companyId:user.companyId,id:rid}});if(!old)throw new CommandError(404,'Không tìm thấy đối soát.');if(isCapturedInput(old))fail('Hồ sơ chuyển sổ giữ nguyên số liệu; không tính lại từ nguồn.');await lockInputSource(tx,user.companyId,old.sourceRevenueId);const r=await tx.inputReconciliation.findUniqueOrThrow({where:{id:rid},include:{payable:true}});unchanged(r,b.expectedUpdatedAt);if(!['DRAFT','GENERATED'].includes(r.status)||r.payable)fail('Bản đã duyệt/có AP không được tính lại.');const p=await inputReconPlan(tx,user.companyId,r.sourceRevenueId);if(p.sourceDigest!==b.digest)fail('Nguồn đã thay đổi; cần xem lại.');
   if(r.documentId){await tx.document.update({where:{id:r.documentId},data:{status:'SUPERSEDED'}});await tx.inputReconciliation.updateMany({where:{companyId:user.companyId,documentId:r.documentId,status:'GENERATED'},data:{documentId:null,status:'DRAFT'}});}
   const item=await tx.inputReconciliation.update({where:{id:rid},data:{...p.data,status:'DRAFT',documentId:null,sourceDigest:p.sourceDigest,sourceSnapshot:JSON.parse(JSON.stringify(p.snapshot))}});await audit(tx,user,'INPUT_RECON_REFRESH','InputReconciliation',rid,r,item,'Explicit draft recalculation after source review');return {item};
  },{timeout:30000});
 });
 app.post('/api/v1/input-recon/:id/approve',{onRequest:writeGuard('INPUT_RECON_APPROVE',config)},async req=>{
  const rid=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{await requireDgc(tx,user.companyId);const initial=await tx.inputReconciliation.findFirst({where:{companyId:user.companyId,id:rid}});if(!initial)throw new CommandError(404,'Không tìm thấy đối soát.');await lockInputSource(tx,user.companyId,initial.sourceRevenueId);const r=await tx.inputReconciliation.findUniqueOrThrow({where:{id:rid},include:{payable:true}});
   assertInputSnapshot(r);
   if(!isCapturedInput(r)&&!(await inputContractSources(tx,user.companyId,r.inputContractId,r.period,r.outputPartnerId)).some(source=>source.id===r.sourceRevenueId))fail('Đây là dòng tổng; chỉ duyệt công nợ theo các dịch vụ con để tránh tính trùng.');
   if(r.status==='APPROVED'){if(!r.payable||!r.payable.originalAmount.eq(r.payableAmount)||r.payable.currency!==r.currency||!r.payable.outstandingAmount.eq(r.payable.originalAmount.minus(r.payable.paidAmount)))fail('AP không khớp bản đã duyệt; cần đối chiếu.');return {item:r,payable:r.payable,created:false};}
   unchanged(r,b.expectedUpdatedAt);if(!['DRAFT','GENERATED'].includes(r.status)||r.payable)fail('Trạng thái đối soát không cho phép duyệt.');
   if(isCapturedInput(r)){await assertCapturedInputSource(tx,user.companyId,r);}else{const p=await inputReconPlan(tx,user.companyId,r.sourceRevenueId);if(p.sourceDigest!==r.sourceDigest)fail('Nguồn hoặc số liệu nháp đã thay đổi. Cần xem lại/cập nhật trước khi duyệt.');}
   const payable=await tx.accountPayable.create({data:{companyId:user.companyId,inputReconId:r.id,currency:r.currency,originalAmount:r.payableAmount,outstandingAmount:r.payableAmount}});
   const item=await tx.inputReconciliation.update({where:{id:r.id},data:{status:'APPROVED',approvedById:user.userId,approvedAt:new Date()}});await audit(tx,user,'INPUT_RECON_APPROVE','InputReconciliation',r.id,r,{item,payable});return {item,payable,created:true};
  },{timeout:30000});
 });
 app.get('/api/v1/payables',{preHandler:requirePermission('AP_VIEW')},async req=>{
  const q=parse(z.object({period:period.optional(),partnerId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),companyId=req.auth!.companyId;
  return prisma.$transaction(async tx=>{await requireDgc(tx,companyId);const where:Prisma.AccountPayableWhereInput={companyId,inputReconciliation:{companyId,status:'APPROVED',...(q.period?{period:q.period}:{}),...(q.partnerId?{inputPartnerId:q.partnerId}:{})}};const [rows,total,sums]=await Promise.all([tx.accountPayable.findMany({where,include:{inputReconciliation:{include:includes}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),tx.accountPayable.count({where}),tx.accountPayable.groupBy({by:['currency'],where,_sum:{originalAmount:true,paidAmount:true,outstandingAmount:true}})]);return {items:rows.map(r=>({...r,inputReconciliation:inputReconDto(r.inputReconciliation),dueDate:null})),total,page:q.page,limit:10,totalsByCurrency:sums.map(r=>({currency:r.currency,...r._sum}))};});
 });
}
