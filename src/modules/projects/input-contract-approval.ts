import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import type {AuthConfig} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {assertInputSnapshot,inputDigest,inputReconPlan,isCapturedInput,requireDgc} from './input-recon.js';
import {inputContractCoverage} from './input-recon-coverage.js';
import {financialPeriodLock} from './recon-finalize.js';
import {derivedBytes} from './financial-documents.js';
const scope=z.object({period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),inputContractId:z.uuid(),outputPartnerId:z.uuid()}).strict();
type Scope=z.infer<typeof scope>;
const fail=(message:string):never=>{throw new CommandError(409,message);};
async function approvalPlan(tx:Prisma.TransactionClient,companyId:string,selection:Scope){
 await requireDgc(tx,companyId);
 const contract=await tx.contract.findFirst({where:{companyId,id:selection.inputContractId,dgcDirection:'Input'},include:{partner:true}});
 if(!contract||contract.partner.companyId!==companyId)throw new CommandError(404,'Không tìm thấy hợp đồng đầu vào của công ty.');
 const coverage=await inputContractCoverage(tx,companyId,contract.id,selection.period,selection.outputPartnerId),sourceIds=coverage.sources.map(s=>s.id);
 const all=await tx.inputReconciliation.findMany({where:{companyId,inputContractId:contract.id,period:selection.period,outputPartnerId:selection.outputPartnerId},include:{service:true,payable:true},orderBy:{id:'asc'},take:501});
 if(all.length>500)fail('Phạm vi đối soát vượt giới hạn kiểm tra.');
 const rows=all.filter(r=>!isCapturedInput(r)&&!coverage.excludedServiceIds.includes(r.serviceId));
 if(!rows.length||rows.some(r=>isCapturedInput(r)))fail('Duyệt theo hợp đồng chỉ áp dụng hồ sơ mới; hồ sơ đã chuyển giữ luồng riêng.');
 if(rows.length!==sourceIds.length||rows.some(r=>!sourceIds.includes(r.sourceRevenueId))||sourceIds.some(id=>!rows.some(r=>r.sourceRevenueId===id)))fail('Đối soát chưa đủ hoặc có nguồn ngoài hợp đồng/kỳ. Lập đủ và kiểm tra lại trước khi duyệt.');
 if(rows.some(r=>r.inputPartnerId!==contract.partnerId||r.service.companyId!==companyId)||new Set(rows.map(r=>r.currency)).size!==1)fail('Các dòng không cùng đối tác/tiền tệ hoặc sai công ty.');
 for(const r of rows){
  assertInputSnapshot(r);
  if(r.status==='APPROVED'){
   if(!r.payable||r.payable.companyId!==companyId||r.payable.currency!==r.currency||!r.payable.originalAmount.eq(r.payableAmount)||!r.payable.outstandingAmount.eq(r.payable.originalAmount.minus(r.payable.paidAmount)))fail('Công nợ đã duyệt không khớp '+r.inputReconCode+'. Không tạo thêm.');
  }else{
   if(r.status!=='GENERATED'||r.payable)fail('Cần lưu biên bản PDF cho đầy đủ dịch vụ trước khi duyệt hợp đồng.');
   const fresh=await inputReconPlan(tx,companyId,r.sourceRevenueId);if(fresh.sourceDigest!==r.sourceDigest)fail('Nguồn/hợp đồng/tỷ giá của '+r.inputReconCode+' đã thay đổi. Xem lại nháp và lưu lại biên bản trước khi duyệt.');
  }
 }
 const documentIds=[...new Set(rows.map(r=>r.documentId))];if(documentIds.length!==1||!documentIds[0])fail('Các dịch vụ phải dùng cùng một biên bản PDF đầy đủ đã lưu.');
 const {document,bytes}=await derivedBytes(tx,companyId,documentIds[0]!,'INPUT_RECON');
 if(document.status!=='ACTIVE'||document.entityType!=='InputReconStatement'||document.entityId!==contract.id||document.documentNumber!==selection.period||document.attachment.mimeType!=='application/pdf')fail('Biên bản PDF không còn hiệu lực hoặc không khớp hợp đồng/kỳ.');
 const receipt=await tx.auditLog.findFirst({where:{companyId,action:'INPUT_RECON_PDF',entityType:'Document',entityId:document.id},select:{newValue:true},orderBy:{createdAt:'desc'}}),snapshot=receipt?.newValue as any;
 if(snapshot?.data?.captured||!Array.isArray(snapshot?.rowIds)||!Array.isArray(snapshot?.sourceDigests)||snapshot.rowIds.length!==rows.length||new Set(snapshot.rowIds).size!==rows.length||rows.some(r=>{const i=snapshot.rowIds.indexOf(r.id);return i<0||snapshot.sourceDigests[i]!==r.sourceDigest;}))fail('Biên bản đã lưu chưa khớp đầy đủ dịch vụ hoặc nguồn hiện hành. Cần xem và lưu lại PDF.');
 const total=rows.reduce((s,r)=>s.plus(r.payableAmount),new Prisma.Decimal(0)).toFixed(2),currency=rows[0].currency;
 const result={...selection,inputPartnerId:contract.partnerId,inputPartnerKey:contract.partner.partnerKey,inputPartnerName:contract.partner.legalName,contractNumber:contract.contractNumber??contract.contractCode,currency,totalPayable:total,printedPayable:snapshot.data?.totals?.partnerAmount??null,document:{id:document.id,version:document.versionNo,checksum:document.attachment.checksumSha256,bytes:bytes.length,pdfUrl:'/api/v1/input-recon/'+rows[0].id+'/pdf'},excludedServices:coverage.excludedServices,items:rows.map(r=>({id:r.id,code:r.inputReconCode,service:r.service.serviceName,status:r.status,payableAmount:r.payableAmount.toFixed(2),payableId:r.payable?.id??null,updatedAt:r.updatedAt.toISOString(),sourceDigest:r.sourceDigest})),pendingCount:rows.filter(r=>r.status!=='APPROVED').length};
 return {rows,result,digest:inputDigest(result)};
}
export async function inputContractApprovalRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/input-recon/contract-approve-preview',{onRequest:writeGuard('INPUT_RECON_APPROVE',config)},async request=>{
  const b=parse(scope,request.body);const p=await prisma.$transaction(tx=>approvalPlan(tx,request.auth!.companyId,b),{isolationLevel:'RepeatableRead',timeout:30000});return {...p.result,digest:p.digest,requestId:randomUUID()};
 });
 app.post('/api/v1/input-recon/contract-approve',{onRequest:writeGuard('INPUT_RECON_APPROVE',config)},async request=>{
  const user=request.auth!,{digest,requestId,confirmed,...selection}=parse(scope.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.uuid(),confirmed:z.literal(true)}).strict(),request.body),requestDigest=inputDigest({selection,digest});
  return prisma.$transaction(async tx=>{
   await requireDgc(tx,user.companyId);await financialPeriodLock(tx,user.companyId,selection.outputPartnerId,selection.period);await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   const old=await tx.auditLog.findFirst({where:{companyId:user.companyId,action:'INPUT_RECON_CONTRACT_APPROVE',entityType:'InputReconContractApproval',entityId:requestId},select:{newValue:true}});
   if(old){const receipt=old.newValue as any;if(receipt?.requestDigest!==requestDigest)fail('Mã xác nhận đã dùng cho một nội dung khác.');return {...receipt.result,replayed:true};}
   const p=await approvalPlan(tx,user.companyId,selection);if(p.digest!==digest)fail('Biên bản, nguồn hoặc công nợ đã thay đổi. Kiểm tra lại trước khi duyệt.');
   const items=[];let created=0;
   for(const r of p.rows){if(r.status==='APPROVED'){items.push({id:r.id,payableId:r.payable!.id,created:false});continue;}
    const payable=await tx.accountPayable.create({data:{companyId:user.companyId,inputReconId:r.id,currency:r.currency,originalAmount:r.payableAmount,outstandingAmount:r.payableAmount}});
    const item=await tx.inputReconciliation.update({where:{id:r.id},data:{status:'APPROVED',approvedById:user.userId,approvedAt:new Date()}});
    await audit(tx,user,'INPUT_RECON_APPROVE','InputReconciliation',r.id,r,{item,payable,contractApprovalId:requestId});items.push({id:r.id,payableId:payable.id,created:true});created++;
   }
   const result={items,created,existing:items.length-created,documentId:p.result.document.id,totalPayable:p.result.totalPayable,currency:p.result.currency,message:`Đã duyệt hợp đồng: tạo ${created} khoản phải trả, giữ ${items.length-created} khoản đã có. Chưa phát sinh chi tiền.`};
   await audit(tx,user,'INPUT_RECON_CONTRACT_APPROVE','InputReconContractApproval',requestId,null,{requestDigest,scope:selection,document:p.result.document,sourceDigests:p.rows.map(r=>({id:r.id,digest:r.sourceDigest})),result});return {...result,replayed:false};
  },{timeout:60000});
 });
}
