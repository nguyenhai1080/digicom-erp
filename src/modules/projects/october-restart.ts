import type {FastifyInstance} from 'fastify';
import {Prisma,prisma} from '@erp/db';
import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {relative,resolve,isAbsolute} from 'node:path';
import {requirePermission,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {checkedFile,storageRoot} from './financial-documents.js';
import {financialPeriodLock} from './recon-finalize.js';

// One owner-authorized restart of the captured October book. This is not a
// general period purge, an importer, or permission to reset subsequent work.
const period='2026-10',key='DGC_PERIOD_RESTART:2026-10',action='DGC_OCTOBER_RESTART';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v,(_k,v)=>typeof v==='bigint'?v.toString():v));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(json(v))).digest('hex');
function fail(message:string):never{throw new CommandError(409,message);}
async function writer(tx:Prisma.TransactionClient,u:Identity){
 if(u.companyCode!=='DGC')throw new CommandError(404,'Chức năng chỉ dành cho DGC.');
 if(!['SYSTEM_CONFIG_EDIT','INVOICE_CANCEL','RECON_CANCEL'].every(p=>u.permissions.includes(p))||!await tx.userRole.findFirst({where:{userId:u.userId,role:{companyId:u.companyId,code:'ADMIN',status:'ACTIVE'}}}))throw new CommandError(403,'Cần quản trị viên DGC để mở lại kỳ nguồn.');
 const db=await tx.$queryRaw<{name:string}[]>`SELECT current_database() AS name`;
 const localTest=process.env.NODE_ENV==='test'&&['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL!).hostname)&&/^dgc_migration_staging_october_restart(?:_v\d+)?_synthetic$/.test(db[0]?.name??'');
 if(db[0]?.name!=='dgc_erp_db'&&!localTest)throw new CommandError(503,'Cần đúng DB DGC riêng để mở lại kỳ nguồn.');
}
async function stored(tx:Prisma.TransactionClient,companyId:string){
 const r=await tx.configuration.findUnique({where:{companyId_configKey:{companyId,configKey:key}}});
 if(!r)return null;
 const data=JSON.parse(r.configValue??'null');
 if(!data||data.format!=='dgc-period-restart-v1'||data.period!==period||data.companyId!==companyId||hash(data.graph)!==data.graphHash||!await tx.auditLog.findFirst({where:{companyId,entityId:r.id,action,traceId:data.archiveId}}))fail('Bản lưu kỳ không khớp biên nhận.');
 return {row:r,data};
}
async function plan(tx:Prisma.TransactionClient,u:Identity){
 await writer(tx,u);
 if(await stored(tx,u.companyId))fail('Kỳ 10/2026 đã mở lại; không lưu hoặc ẩn công việc mới lần nữa.');
 const companyId=u.companyId,start=new Date('2026-10-01'),end=new Date('2026-10-31');
 const transfer=await tx.auditLog.findFirst({where:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'},orderBy:{createdAt:'desc'}});
 if(!transfer)fail('Chưa có biên nhận chuyển sổ DGC.');
 const revenues=await tx.revenue.findMany({where:{companyId,isCurrent:true,periodStart:start},orderBy:{id:'asc'}});
 const invoices=await tx.invoice.findMany({where:{companyId,isCurrent:true,period},orderBy:{id:'asc'}});
 if(revenues.length!==8||invoices.length!==8)fail('Cần đúng 8 doanh thu và 8 Invoice nháp nguồn tháng 10/2026. Không tự xử lý khi phạm vi đã đổi.');
 if(revenues.some(r=>!r.periodEnd||r.periodEnd.getTime()!==end.getTime()||(r.calculationJson as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1'||!['INVOICE_READY','INVOICED'].includes(r.status)))fail('Phạm vi phải chỉ gồm doanh thu nguồn tháng 10 chưa thanh toán.');
 if(invoices.some(i=>i.status!=='DRAFT'||i.issuedAt||!i.paidAmount.isZero()||(i.snapshot as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1'))fail('Có Invoice đã phát hành/thu tiền hoặc công việc mới; không mở lại tự động.');
 const revenueIds=revenues.map(r=>r.id),invoiceIds=invoices.map(i=>i.id),reconIds=[...new Set(revenues.map(r=>r.reconciliationId))].sort();
 const reconciliations=await tx.reconciliation.findMany({where:{companyId,id:{in:reconIds}},orderBy:{id:'asc'}});
 if(await tx.reconciliation.count({where:{companyId,periodStart:start,isCurrent:true,id:{notIn:reconIds}}})||await tx.outputReconUpload.count({where:{companyId,period,status:{notIn:['CANCELLED','SUPERSEDED','REJECTED']}}}))fail('Đã có công việc đối soát mới trong kỳ; không mở lại tự động.');
 const reconItems=await tx.reconciliationItem.findMany({where:{companyId,reconciliationId:{in:reconIds}},orderBy:{id:'asc'}});
 const scopes=await tx.invoiceScope.findMany({where:{companyId,invoiceId:{in:invoiceIds}},orderBy:{id:'asc'}});
 const scopeItems=await tx.invoiceScopeItem.findMany({where:{companyId,OR:[{revenueId:{in:revenueIds}},{scopeId:{in:scopes.map(s=>s.id)}}]},orderBy:{id:'asc'}});
 if(reconciliations.length!==5||reconciliations.some(r=>!r.isCurrent||r.status!=='APPROVED'||r.periodStart.getTime()!==start.getTime()||r.periodEnd.getTime()!==end.getTime()||(r.ocrRawJson as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1'))fail('Đối soát nguồn không còn đúng phạm vi tháng 10.');
 if(await tx.revenue.count({where:{companyId,reconciliationId:{in:reconIds},id:{notIn:revenueIds}}})||reconItems.some(r=>!r.isCurrent||r.periodStart.getTime()!==start.getTime()||r.periodEnd.getTime()!==end.getTime())||scopes.some(s=>!s.isCurrent||s.periodStart.getTime()!==start.getTime()||s.periodEnd.getTime()!==end.getTime())||scopeItems.some(s=>s.isCurrent&&(!revenueIds.includes(s.revenueId)||!scopes.some(p=>p.id===s.scopeId))))fail('Có liên kết ngoài kỳ hoặc ngoài bộ hồ sơ được chọn.');
 const downstream={receivables:await tx.accountReceivable.count({where:{companyId,invoiceId:{in:invoiceIds}}}),payments:await tx.invoicePayment.count({where:{companyId,invoiceId:{in:invoiceIds}}}),inputRecons:await tx.inputReconciliation.count({where:{companyId,OR:[{sourceRevenueId:{in:revenueIds}},{period}]}}),documentLinks:await tx.invoiceDocumentLink.count({where:{companyId,invoiceId:{in:invoiceIds}}})};
 if(Object.values(downstream).some(Boolean))fail('Hồ sơ đã có công nợ, khoản thu, đối soát đầu vào hoặc tài liệu tham chiếu; không mở lại tự động.');
 const sources=reconciliations.map(r=>(r.ocrRawJson as any).documentSource);
 if(sources.some(s=>!s?.legacyId||!s.sheetId||!s.sourceRow||!s.rowHash||!s.snapshotHash))fail('Thiếu địa chỉ PDF nguồn để bảo toàn lịch sử.');
 const links=await tx.dgcImportLink.findMany({where:{companyId,targetModel:'document',OR:sources.map(s=>({sheetId:s.sheetId,sourceRow:s.sourceRow,rowHash:s.rowHash,snapshotHash:s.snapshotHash,legacyId:s.legacyId}))},orderBy:{targetId:'asc'}});
 if(links.length!==5)fail('Chưa đủ năm PDF đối soát nguồn trong kho DGC.');
 // Signed copies/packages remain attached to the original source identities.
 // Resolve by physical staged-row bindings, never by filename or guessed IDs.
 const revenueLegacy=revenues.map(r=>(r.calculationJson as any).source?.legacyId),reconLegacy=sources.map(s=>s.legacyId),invoiceLegacy=invoices.map(i=>(i.snapshot as any).source?.legacyId);
 const refs=await tx.dgcImportRow.findMany({where:{companyId,sheetName:'55_APPROVAL_PACKAGE',snapshotHash:{in:[...new Set(sources.map(s=>s.snapshotHash))]}},orderBy:[{snapshotHash:'asc'},{sourceRow:'asc'}]});
 const relatedReferences=refs.filter(r=>{const v=(r.payload as any)?.values??{};return [['Related_Revenue_IDs',revenueLegacy],['Related_Recon_Doc_IDs',reconLegacy],['Related_Invoice_IDs',invoiceLegacy]].some(([field,ids])=>String(v[field as string]??'').split(',').map(x=>x.trim()).some(x=>(ids as string[]).includes(x)));});
 const referenceLinks=relatedReferences.length?await tx.dgcImportLink.findMany({where:{companyId,targetModel:'document',OR:relatedReferences.map(r=>({snapshotHash:r.snapshotHash,sheetId:r.sheetId,sourceRow:r.sourceRow,rowHash:r.rowHash,legacyId:r.legacyId}))},orderBy:{targetId:'asc'}}):[];
 if(referenceLinks.length!==relatedReferences.length)fail('Thiếu PDF gói ký đã tham chiếu hồ sơ tháng 10.');
 const documentIds=[...new Set([...invoices.map(i=>i.documentId),...links.map(l=>l.targetId),...referenceLinks.map(l=>l.targetId)])];
 const documents=await tx.document.findMany({where:{companyId,OR:[{id:{in:documentIds}},{entityType:'Invoice',entityId:{in:invoiceIds}}]},include:{attachment:true},orderBy:{id:'asc'}});
 if(documentIds.some(id=>!documents.some(d=>d.id===id)))fail('Thiếu chứng từ của bộ hồ sơ cần lưu.');
 for(const d of documents){
  const a=d.attachment,rel=relative(storageRoot(),resolve(storageRoot(),a.storagePath));
  if(a.companyId!==companyId||!rel||rel.startsWith('..')||isAbsolute(rel)||!['invoices','dgc-history'].some(folder=>a.storagePath.startsWith(folder+'/'+companyId+'/')))fail('Kho chứng từ không thuộc bộ chuyển DGC.');
  await checkedFile(a,a.storagePath,64*1024*1024);
 }
 const graph=json({revenues,invoices,reconciliations,reconItems,scopes,scopeItems,documents,relatedReferences,downstream,sourceTransferId:transfer.id,sourceTransferHash:transfer.traceId});
 return {graph,digest:hash({companyId,userId:u.userId,graph}),counts:{revenues:revenues.length,invoices:invoices.length,reconciliations:reconciliations.length,documents:documents.length},invoiceIds,revenueIds,reconIds};
}
export async function octoberRestartRoutes(app:FastifyInstance,config:AuthConfig){
 app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','no-store');return payload;});
 const readAccess=requirePermission('INVOICE_VIEW');
 app.get('/api/v1/october-restart',{preHandler:readAccess},async req=>{
  const u=req.auth!;if(u.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy chức năng.');
  const saved=await prisma.$transaction(tx=>stored(tx,u.companyId));
  const canRestart=['SYSTEM_CONFIG_EDIT','INVOICE_CANCEL','RECON_CANCEL'].every(p=>u.permissions.includes(p))&&!!await prisma.userRole.findFirst({where:{userId:u.userId,role:{companyId:u.companyId,code:'ADMIN',status:'ACTIVE'}}});
  if(!saved)return {period,archived:false,canRestart};
  const {data}=saved,g=data.graph;
  return {period,archived:true,canRestart:false,archiveId:data.archiveId,archivedAt:data.archivedAt,reason:data.reason,counts:data.counts,
   invoices:g.invoices.map((i:any)=>({id:i.id,number:i.invoiceNumber,status:i.status,currency:i.currency,payable:i.payableAmount,documentId:i.documentId})),
   revenues:u.permissions.includes('REVENUE_VIEW')?g.revenues.map((r:any)=>({id:r.id,code:r.revenueCode,status:r.status,currency:r.currency,amount:r.netAmount})):[],
   documents:g.documents.filter((d:any)=>d.documentType==='INVOICE'||u.permissions.includes('RECON_VIEW')).map((d:any)=>({id:d.id,type:d.documentType,filename:d.attachment.originalFilename,sha256:d.attachment.checksumSha256,url:'/api/v1/october-restart/documents/'+d.id}))};
 });
 app.post('/api/v1/october-restart/preview',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{
  parse(z.object({period:z.literal(period)}).strict(),req.body);
  return prisma.$transaction(async tx=>{const p=await plan(tx,req.auth!);return {period,digest:p.digest,counts:p.counts,invoices:p.graph.invoices.map((i:any)=>({number:i.invoiceNumber,payable:i.payableAmount,currency:i.currency})),message:'Lưu nguyên hồ sơ tháng 10 vào lịch sử, ngừng nguồn hiện hành để nhập lại. Không sửa số tiền/PDF hoặc tạo công nợ, thu chi.'};},{isolationLevel:'RepeatableRead',timeout:45000});
 });
 app.post('/api/v1/october-restart/apply',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{
  const b=parse(z.object({period:z.literal(period),digest:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict(),req.body),u=req.auth!;
  return prisma.$transaction(async tx=>{
   await writer(tx,u);
   const partners=await tx.invoice.findMany({where:{companyId:u.companyId,period,isCurrent:true},select:{partnerId:true},distinct:['partnerId'],orderBy:{partnerId:'asc'}});
   for(const p of partners)await financialPeriodLock(tx,u.companyId,p.partnerId,period);
   await tx.$queryRaw`SELECT id FROM companies WHERE id=${u.companyId}::uuid FOR UPDATE`;
   const prior=await stored(tx,u.companyId);if(prior)return {archived:true,replayed:true,archiveId:prior.data.archiveId,counts:prior.data.counts};
   const p=await plan(tx,u);if(p.digest!==b.digest)fail('Hồ sơ đã thay đổi. Xem lại phạm vi trước khi lưu lịch sử.');
   const archiveId=randomUUID(),data={format:'dgc-period-restart-v1',archiveId,companyId:u.companyId,period,archivedAt:new Date().toISOString(),actorId:u.userId,reason:b.reason,counts:p.counts,graph:p.graph,graphHash:hash(p.graph)};
   const archive=await tx.configuration.create({data:{companyId:u.companyId,configKey:key,valueType:'JSON',isSecret:false,configValue:JSON.stringify(data)}});
   await tx.invoiceScopeItem.updateMany({where:{companyId:u.companyId,scopeId:{in:p.graph.scopes.map((s:any)=>s.id)}},data:{isCurrent:false}});
   await tx.invoiceScope.updateMany({where:{companyId:u.companyId,id:{in:p.graph.scopes.map((s:any)=>s.id)}},data:{isCurrent:false,status:'CANCELLED'}});
   await tx.invoice.updateMany({where:{companyId:u.companyId,id:{in:p.invoiceIds}},data:{isCurrent:false,status:'CANCELLED'}});
   await tx.revenue.updateMany({where:{companyId:u.companyId,id:{in:p.revenueIds}},data:{isCurrent:false,status:'SUPERSEDED'}});
   await tx.reconciliationItem.updateMany({where:{companyId:u.companyId,reconciliationId:{in:p.reconIds}},data:{isCurrent:false}});
   await tx.reconciliation.updateMany({where:{companyId:u.companyId,id:{in:p.reconIds}},data:{isCurrent:false,status:'SUPERSEDED'}});
   const receipt=await audit(tx,u,action,'Configuration',archive.id,null,{archiveId,period,counts:p.counts,graphHash:data.graphHash,filesRetained:true,amountsPreserved:true,noCashPosting:true},b.reason);
   await tx.auditLog.update({where:{id:receipt.id},data:{traceId:archiveId}});
   return {archived:true,replayed:false,archiveId,counts:p.counts};
  },{isolationLevel:'Serializable',timeout:60000});
 });
 app.get('/api/v1/october-restart/documents/:id',{preHandler:readAccess},async(req,reply)=>{
  const u=req.auth!,id=parse(z.object({id:z.uuid()}).strict(),req.params).id;
  if(u.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy chứng từ.');
  const saved=await prisma.$transaction(tx=>stored(tx,u.companyId)),d=saved?.data.graph.documents.find((d:any)=>d.id===id);
  if(!d||d.companyId!==u.companyId||d.attachment.companyId!==u.companyId)throw new CommandError(404,'Không tìm thấy chứng từ trong bản lưu.');
  if(d.documentType!=='INVOICE'&&!u.permissions.includes('RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát nguồn.');
  const bytes=await checkedFile({...d.attachment,fileSize:BigInt(d.attachment.fileSize)},d.attachment.storagePath,64*1024*1024);
  return reply.type('application/pdf').header('Content-Disposition','inline; filename="dgc-october-archive.pdf"').header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store').send(bytes);
 });
}
