import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,code,CommandError,date,parse,writeGuard,timestamp} from './commands.js';
import {readSoaCutoff,DGC_SOA_CUTOFF_POLICY} from './soa-cutoff-review.js';
import {readDgcInvoiceProfile} from './dgc-invoice-profile.js';
import {asset,checkedFile,persistPdf,rollbackFiles,sha} from './financial-documents.js';
import {linkInvoiceDocuments} from './invoice-cancel.js';
import {financialPeriodLock} from './recon-finalize.js';
import {defaultSoaPlacements,soaPlacements,renderSoa,type SoaData,type SoaPictures} from './soa-pdf.js';
const selection=z.object({partnerId:z.uuid(),asOf:date,currency:z.enum(['USD','VND']).default('USD'),includePaid:z.boolean().default(true),placement:soaPlacements.default(defaultSoaPlacements)}).strict();
const confirmed=selection.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict();
const fail=(s:string):never=>{throw new CommandError(409,s);};
const rowFields={id:true,partnerId:true,statementNumber:true,asOf:true,currency:true,status:true,createdAt:true,updatedAt:true,documentId:true,partner:{select:{partnerKey:true,legalName:true}}} as const;
async function plan(tx:Prisma.TransactionClient,companyId:string,actorId:string,input:z.infer<typeof selection>){
 const ledger=await readSoaCutoff(tx,companyId,input.partnerId,input.asOf);
 const rows=ledger.rows.filter(r=>r.currency===input.currency&&(input.includePaid||new Prisma.Decimal(r.outstandingAtCutoff).gt('.005')));
 if(!rows.length)fail('Không có Invoice phù hợp để lập SOA.');if(rows.length>2000)fail('SOA vượt 2.000 Invoice.');
 const config=await readDgcInvoiceProfile(tx,companyId),pictures={} as SoaPictures,assets:Record<string,{id:string;checksum:string}>={};
 for(const [name,kind] of Object.entries({logo:'COMPANY_LOGO',stamp:'COMPANY_STAMP',signature:'SIGNATURE',title:'SIGNER_TITLE_NAME'})){
  const a=await asset(tx,companyId,kind);pictures[name as keyof SoaPictures]={bytes:a.bytes,mime:a.document.attachment.mimeType};assets[name]={id:a.document.id,checksum:sha(a.bytes)};
 }
 const seq=await tx.sequence.findUnique({where:{companyId_sequenceName:{companyId,sequenceName:'STATEMENT_OF_ACCOUNT'}}});
 const number=(seq?.prefix??'SOA')+'-'+((seq?.currentValue??0n)+1n).toString().padStart(seq?.padding??4,'0');
 const total=(k:'amount'|'paidAtCutoff'|'outstandingAtCutoff')=>rows.reduce((s,l)=>s.plus(l[k]),new Prisma.Decimal(0)).toFixed(2);
 const p=ledger.partner,data:SoaData={number,asOf:input.asOf,currency:input.currency,partner:{name:p.invoiceRecipient||p.legalName,address:p.billingAddress||p.registeredAddress||'',registration:p.registrationNumber||'',tax:p.taxCode||'',attn:p.contactName||''},lines:rows.map(r=>({id:r.id,invoiceNumber:r.invoiceNumber,invoiceDate:r.invoiceDate,description:r.description,amount:r.amount,paidAtCutoff:r.paidAtCutoff,outstandingAtCutoff:r.outstandingAtCutoff})),totals:{amount:total('amount'),paidAtCutoff:total('paidAtCutoff'),outstandingAtCutoff:total('outstandingAtCutoff')}};
 const digest=sha(JSON.stringify({companyId,actorId,input,data,source:ledger.sourceFingerprint,profile:config.metadata,assets,policy:DGC_SOA_CUTOFF_POLICY}));
 return {data,digest,pictures,profile:config.profile,rows,assets,profileMetadata:config.metadata};
}
let producing=false;
export async function soaRoutes(app:FastifyInstance,config:AuthConfig){
 const readGuard=async(req:FastifyRequest,reply:FastifyReply)=>{await requirePermission('AR_VIEW')(req,reply);if(reply.sent)return;if(req.auth!.companyCode!=='DGC')return reply.code(404).send({message:'Không tìm thấy chức năng.'});if(!['INVOICE_VIEW','INVOICE_PAYMENT_VIEW'].every(p=>req.auth!.permissions.includes(p)))return reply.code(403).send({message:'Cần quyền xem Invoice và lịch sử thu để xem SOA.'});};
 // The donor Manager/BOD SOA action maps to existing Invoice creation access.
 // No permissions or role memberships are changed automatically.
 const write=async(req:FastifyRequest,reply:FastifyReply)=>{await writeGuard('INVOICE_CREATE',config)(req,reply);if(!reply.sent)await readGuard(req,reply);};
 app.post('/api/v1/soa/preview',{onRequest:write},async req=>{const input=parse(selection,req.body);return prisma.$transaction(async tx=>{const p=await plan(tx,req.auth!.companyId,req.auth!.userId,input);return {data:p.data,digest:p.digest,cutoffPolicy:DGC_SOA_CUTOFF_POLICY};},{isolationLevel:'RepeatableRead',timeout:30000});});
 for(const action of ['pdf-preview','create'] as const)app.post('/api/v1/soa/'+action,{onRequest:write},async(req,reply)=>{
  const body=parse(action==='create'?confirmed.extend({requestId:z.uuid()}).strict():confirmed,req.body);
  const {digest,confirmed:_,...rest}=body,input=parse(selection,Object.fromEntries(Object.entries(rest).filter(([k])=>k!=='requestId'))),user=req.auth!,requestId='requestId'in body?String(body.requestId):null;
  const requestDigest=sha(JSON.stringify({actorId:user.userId,input,digest})),rollback:string[]=[];
  if(producing)throw new CommandError(429,'Đang lập SOA khác, thử lại sau.');producing=true;
  try{
   const result=await prisma.$transaction(async tx=>{
    if(action==='create'){
     const previous=await tx.statementOfAccount.findUnique({where:{companyId_requestId:{companyId:user.companyId,requestId:requestId!}},select:{...rowFields,requestDigest:true}});
     if(previous){if(previous.requestDigest!==requestDigest)fail('Mã yêu cầu đã dùng cho một SOA khác.');const {requestDigest:__,...item}=previous;return {item,replayed:true};}
    }
    const initial=await plan(tx,user.companyId,user.userId,input);
    if(action==='create'){
     const periods=[...new Set(initial.rows.map(r=>r.period))].sort();
     for(const period of periods)await financialPeriodLock(tx,user.companyId,input.partnerId,period);
     await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
     await tx.$queryRaw`SELECT id FROM invoices WHERE company_id=${user.companyId}::uuid AND id IN (${Prisma.join(initial.rows.map(r=>Prisma.sql`${r.id}::uuid`))}) ORDER BY id FOR UPDATE`;
    }
    const p=action==='create'?await plan(tx,user.companyId,user.userId,input):initial;
    if(p.digest!==digest)fail('Nguồn thu/Invoice, cấu hình hoặc vị trí ký đã thay đổi. Xem trước SOA lại.');
    if(action==='create'&&JSON.stringify(p.rows.map(r=>r.id))!==JSON.stringify(initial.rows.map(r=>r.id)))fail('Tập Invoice đã thay đổi. Xem trước lại.');
    if(action==='create'&&await code(tx,user.companyId,'STATEMENT_OF_ACCOUNT','SOA')!==p.data.number)fail('Số SOA vừa thay đổi. Xem trước lại.');
    const bytes=await renderSoa(p.data,p.profile,p.pictures,input.placement);
    if(action==='pdf-preview')return {bytes};
    const id=randomUUID(),document=await persistPdf(tx,user,'StatementOfAccount',id,'SOA',p.data.number+'.pdf',bytes,1,rollback);
    await tx.document.update({where:{id:document.id},data:{documentNumber:p.data.number,documentDate:new Date(input.asOf)}});
    await linkInvoiceDocuments(tx,user.companyId,p.rows.map(r=>r.id),document.id,'SOA');
    const snapshot={version:1,data:p.data,selection:input,cutoffPolicy:DGC_SOA_CUTOFF_POLICY,sourceDigest:p.digest,assets:p.assets,profile:p.profileMetadata};
    const item=await tx.statementOfAccount.create({data:{id,companyId:user.companyId,partnerId:input.partnerId,documentId:document.id,statementNumber:p.data.number,asOf:new Date(input.asOf),currency:input.currency,snapshot,requestId:requestId!,requestDigest},select:rowFields});
    await audit(tx,user,'SOA_CREATE','StatementOfAccount',id,null,snapshot);
    return {item,replayed:false};
   },{isolationLevel:action==='create'?'Serializable':'RepeatableRead',timeout:60000});
   if('bytes'in result)return reply.type('application/pdf').header('X-Content-Type-Options','nosniff').send(result.bytes);
   return reply.code(result.replayed?200:201).send(result);
  }catch(e){await rollbackFiles(rollback);throw e;}finally{producing=false;}
 });
 app.get('/api/v1/soa',{preHandler:readGuard},async req=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).default(1),partnerId:z.uuid().optional()}).strict(),req.query),where={companyId:req.auth!.companyId,...(q.partnerId?{partnerId:q.partnerId}:{})};
  return prisma.$transaction(async tx=>{const total=await tx.statementOfAccount.count({where}),pages=Math.max(1,Math.ceil(total/10)),page=Math.min(q.page,pages);return {total,pages,page,pageSize:10,items:await tx.statementOfAccount.findMany({where,select:rowFields,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*10,take:10})};},{isolationLevel:'RepeatableRead'});
 });
 app.get('/api/v1/soa/:id/download',{preHandler:readGuard},async(req,reply)=>{
  const id=parse(z.object({id:z.uuid()}).strict(),req.params).id,item=await prisma.statementOfAccount.findFirst({where:{id,companyId:req.auth!.companyId},include:{document:{include:{attachment:true}}}});
  if(!item)throw new CommandError(404,'Không tìm thấy SOA của công ty.');
  const d=item.document;if(d.companyId!==item.companyId||d.attachment.companyId!==item.companyId||d.entityType!=='StatementOfAccount'||d.entityId!==id||d.documentType!=='SOA')fail('PDF không khớp SOA.');
  const bytes=await checkedFile(d.attachment,`soa/${item.companyId}/${d.attachment.id}.pdf`);
  return reply.type('application/pdf').header('X-Content-Type-Options','nosniff').header('Content-Disposition','inline; filename="'+item.statementNumber+'.pdf"').send(bytes);
 });
 app.post('/api/v1/soa/:id/cancel',{onRequest:write},async req=>{
  const id=parse(z.object({id:z.uuid()}).strict(),req.params).id,b=parse(z.object({expectedUpdatedAt:timestamp,reason:z.string().trim().min(1).max(500),confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{
   const initial=await tx.statementOfAccount.findFirst({where:{id,companyId:user.companyId}});if(!initial)throw new CommandError(404,'Không tìm thấy SOA.');
   // Same lock order as create/cancel Invoice; retain the PDF and snapshot.
   const links=await tx.invoiceDocumentLink.findMany({where:{companyId:user.companyId,documentId:initial.documentId},include:{invoice:{select:{partnerId:true,period:true}}}});
   for(const period of [...new Set(links.map(l=>l.invoice.period))].sort())await financialPeriodLock(tx,user.companyId,initial.partnerId,period);
   await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   const current=await tx.statementOfAccount.findFirstOrThrow({where:{id,companyId:user.companyId}});
   if(current.status!=='DRAFT'||current.updatedAt.toISOString()!==b.expectedUpdatedAt)fail('SOA đã thay đổi hoặc đã hủy.');
   await tx.invoiceDocumentLink.deleteMany({where:{companyId:user.companyId,documentId:current.documentId,kind:'SOA'}});
   await tx.document.update({where:{id:current.documentId},data:{status:'CANCELLED'}});
   const item=await tx.statementOfAccount.update({where:{id},data:{status:'CANCELLED'},select:rowFields});
   await audit(tx,user,'SOA_CANCEL','StatementOfAccount',id,current,item,b.reason);return {item};
  },{isolationLevel:'Serializable',timeout:30000});
 });
}
