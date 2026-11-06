import type {FastifyInstance} from 'fastify';
import {Prisma,prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission} from '../auth/access.js';
import {CommandError,parse} from './commands.js';
import {checkedFile} from './financial-documents.js';

// A reader for records already transferred, never an intake/recalculation path.
const source=z.object({sheetId:z.number().int().nonnegative(),sourceRow:z.number().int().min(2),rowHash:z.string().regex(/^[a-f0-9]{64}$/),legacyId:z.string(),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/).optional()});
const base=(companyId:string):Prisma.ReconciliationWhereInput=>({companyId,partner:{companyId},contract:{companyId},sourceType:'SYSTEM_IMPORT',ocrRawJson:{path:['sourceKind'],equals:'DGC_CAPTURED_BOOK_V1'}});
async function document(tx:Prisma.TransactionClient,companyId:string,raw:unknown){
 const j=raw as any,s=source.safeParse(j?.documentSource);
 if(!s.success)return null;
 // Base recon envelopes carry a preparation hash, not the physical source-row
 // snapshot. Resolve missing per-row snapshots from the completed transfer receipt.
 const receipt=await tx.auditLog.findFirst({where:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'},select:{newValue:true},orderBy:{createdAt:'desc'}});
 const transfer=receipt?.newValue as any,snapshotHash=s.data.snapshotHash??transfer?.sourceSnapshotHash;
 if(typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(snapshotHash)||![transfer?.sourceSnapshotHash,transfer?.sourceAppendixHash].includes(snapshotHash))return null;
 const links=await tx.dgcImportLink.findMany({where:{companyId,targetModel:'document',snapshotHash,sheetId:s.data.sheetId,sourceRow:s.data.sourceRow,rowHash:s.data.rowHash,legacyId:s.data.legacyId},select:{targetId:true},take:2});
 if(links.length!==1)return null;
 return tx.document.findFirst({where:{companyId,id:links[0].targetId,documentType:'DGC_SOURCE_RECON',entityType:'DGC_SOURCE_RECON',status:'ACTIVE',attachment:{companyId}},include:{attachment:true}});
}
export async function outputReconHistoryRoutes(app:FastifyInstance){
 const access=requirePermission('RECON_VIEW');
 app.get('/api/v1/output-recon/history',{preHandler:access},async req=>{
  if(req.auth!.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy danh sách.');
  const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),period:z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/).optional(),search:z.string().trim().max(200).optional(),includeArchived:z.enum(['true','false']).default('false')}).strict(),req.query),companyId=req.auth!.companyId;
  const where:Prisma.ReconciliationWhereInput={...base(companyId),...(q.includeArchived==='false'?{isCurrent:true}:{}),...(q.period?{periodStart:new Date(q.period+'-01')}:{}),...(q.search?{OR:[{ocrRawJson:{path:['documentSource','legacyId'],string_contains:q.search.toUpperCase()}},{reconCode:{contains:q.search,mode:'insensitive'}},{partner:{legalName:{contains:q.search,mode:'insensitive'}}},{partner:{partnerKey:{contains:q.search,mode:'insensitive'}}},{items:{some:{companyId,service:{companyId,OR:[{serviceKey:{contains:q.search,mode:'insensitive'}},{serviceName:{contains:q.search,mode:'insensitive'}}]}}}}]}:{})};
  return prisma.$transaction(async tx=>{
   const total=await tx.reconciliation.count({where}),pages=Math.max(1,Math.ceil(total/10)),page=Math.min(q.page,pages);
   const rows=await tx.reconciliation.findMany({
    where,orderBy:[{periodStart:'desc'},{reconCode:'asc'},{id:'asc'}],take:10,skip:(page-1)*10,
    include:{
     partner:{select:{partnerKey:true,legalName:true}},contract:{select:{contractCode:true}},
     items:{where:{companyId,service:{companyId}},select:{service:{select:{serviceKey:true,serviceName:true}}}}
    }
   });
   const items=await Promise.all(rows.map(async r=>{const j=r.ocrRawJson as any,d=await document(tx,companyId,j);return {id:r.id,code:source.safeParse(j?.documentSource).success?j.documentSource.legacyId:r.reconCode,period:r.periodStart.toISOString().slice(0,7),partner:r.partner,contract:r.contract.contractCode,services:[...new Map(r.items.map(i=>[i.service.serviceKey,i.service])).values()],status:r.status,isCurrent:r.isCurrent,hasPdf:!!d,filename:d?.attachment.originalFilename??null};}));
   return {items,total,page,pages,limit:10,readOnly:true};
  },{isolationLevel:'RepeatableRead'});
 });
 app.get('/api/v1/output-recon/history/:id/pdf',{preHandler:access},async(req,reply)=>{
  if(req.auth!.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy chứng từ.');
  const id=parse(z.object({id:z.uuid()}).strict(),req.params).id,companyId=req.auth!.companyId;
  const d=await prisma.$transaction(async tx=>{const r=await tx.reconciliation.findFirst({where:{...base(companyId),id},select:{ocrRawJson:true}});return r?document(tx,companyId,r.ocrRawJson):null;});
  if(!d)throw new CommandError(404,'Chưa có PDF gốc liên kết với đối soát này.');
  const bytes=await checkedFile(d.attachment,`dgc-history/${companyId}/${d.attachment.id}.pdf`,64*1024*1024);
  return reply.type('application/pdf').header('Content-Disposition','inline; filename="historical-reconciliation.pdf"').header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(bytes);
 });
}
