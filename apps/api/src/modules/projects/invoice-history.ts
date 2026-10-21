import type {FastifyInstance} from 'fastify';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {CommandError,parse} from './commands.js';

// Read an explicitly mounted evidence package; never import it into financial tables.
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const canonical=(v:unknown)=>JSON.stringify(sort(v)),digest=(v:unknown)=>sha(canonical(v));
const hex=/^[a-f0-9]{64}$/;
const address=z.object({sheet:z.literal('48_INVOICE_HEADER'),sheetId:z.number().int().nonnegative(),sourceRow:z.number().int().min(2),legacyId:z.string(),rowHash:z.string().regex(hex)}).strict();
const entrySchema=z.object({archiveId:z.string().regex(hex),source:address,invoiceNumber:z.string(),sourceStatus:z.string(),payloadPath:z.string(),payloadHash:z.string().regex(hex),pdf:z.object({fileId:z.string(),path:z.string(),size:z.number().int().min(1).max(64*1024*1024),sha256:z.string().regex(hex)}).strict()}).strict();
const indexSchema=z.object({format:z.literal('dgc-invoice-source-archive-v1'),snapshotHash:z.string().regex(hex),historyPlanHash:z.string().regex(hex),sourceManifestHash:z.string().regex(hex),postingAllowed:z.literal(false),operationalImportAllowed:z.literal(false),recomputeAmounts:z.literal(false),postHistoricalCash:z.literal(false),acceptance:z.literal(false),entries:z.array(entrySchema).max(10000),archiveHash:z.string().regex(hex)}).strict();
type Entry=z.infer<typeof entrySchema>;
type Config={root:string;hash:string;companyId:string};
function configuration():Config|null{
 const root=process.env.DGC_INVOICE_ARCHIVE_ROOT,hash=process.env.DGC_INVOICE_ARCHIVE_HASH,companyId=process.env.DGC_INVOICE_ARCHIVE_COMPANY_ID;
 if(!root&&!hash&&!companyId)return null;
 if(!root||!isAbsolute(root)||!hex.test(hash??'')||!z.uuid().safeParse(companyId).success)throw new CommandError(503,'Cấu hình kho Invoice lịch sử chưa đầy đủ.');
 return {root,hash:hash!,companyId:companyId!};
}
async function file(root:string,path:string,max:number){
 const base=await realpath(root);if((await lstat(root)).isSymbolicLink())throw Error('Symbolic archive root');let target=base;
 for(const part of path.split('/')){if(!part||part==='.'||part==='..'||part.includes('\\'))throw Error('Invalid path');target=resolve(target,part);if((await lstat(target)).isSymbolicLink())throw Error('Symbolic archive path');}
 const rel=relative(base,await realpath(target)),s=await lstat(target);
 if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel)||!s.isFile()||s.size>max)throw Error('Invalid evidence file');
 const bytes=await readFile(target);if(bytes.length!==s.size||bytes.length>max)throw Error('Evidence changed');return bytes;
}
async function index(c:Config){
 const result=indexSchema.parse(JSON.parse((await file(c.root,'archive.json',16*1024*1024)).toString('utf8'))),{archiveHash,...body}=result;
 if(archiveHash!==c.hash||digest(body)!==archiveHash)throw Error('Archive hash changed');
 const complete=JSON.parse((await file(c.root,'COMPLETE.json',4096)).toString('utf8'));
 if(canonical(complete)!==canonical({archiveHash,entries:result.entries.length}))throw Error('Incomplete archive');
 const seen=new Set<string>();for(const e of result.entries){
  if(seen.has(e.archiveId)||e.archiveId!==digest({snapshotHash:result.snapshotHash,source:e.source})||!['SUPERSEDED','CANCELLED','CANCELED'].includes(e.sourceStatus.trim().toUpperCase())||e.payloadPath!=='records/'+e.archiveId+'.json'||e.pdf.path!=='pdf/'+e.pdf.sha256+'.pdf')throw Error('Invalid evidence identity');seen.add(e.archiveId);
 }
 return result;
}
const value=(v:any)=>typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):null;
async function payload(c:Config,e:Entry){
 const p=JSON.parse((await file(c.root,e.payloadPath,16*1024*1024)).toString('utf8'));
 if(digest(p)!==e.payloadHash||canonical(p.source)!==canonical(e.source)||p.disposition!=='PRESERVE_HISTORY_ONLY'||p.restoreRoute!=='IMMUTABLE_SOURCE_HISTORY'||p.postingAllowed!==false||p.recomputeAmounts!==false||p.postHistoricalCash!==false||p.sourceStatus!==e.sourceStatus||value(p.capturedHeader?.values?.Invoice_Number)?.trim()!==e.invoiceNumber||!Array.isArray(p.capturedDetails))throw Error('Payload changed');
 return p;
}
const summary=(e:Entry,p:any)=>({id:e.archiveId,source:e.source,invoiceNumber:e.invoiceNumber,sourceStatus:e.sourceStatus,invoiceDate:value(p.capturedHeader.cells?.Invoice_Date?.formattedValue)??value(p.capturedHeader.values.Invoice_Date),currency:value(p.capturedHeader.values.Currency),payable:value(p.capturedHeader.values.Total_Payable_USD),integrity:p.integrity,issueCount:Array.isArray(p.issues)?p.issues.length:0});
async function read<T>(fn:()=>Promise<T>){try{return await fn();}catch(e){if(e instanceof CommandError)throw e;throw new CommandError(409,'Kho Invoice lịch sử không khớp bằng chứng đã chốt hoặc không đọc được. Cần kiểm tra lại kho.');}}
export async function invoiceHistoryRoutes(app:FastifyInstance,_config:AuthConfig){
 const guard=requirePermission('INVOICE_VIEW');
 const access:typeof guard=async(req,reply)=>{await guard(req,reply);if(reply.sent)return;if(req.auth!.companyCode!=='DGC')return reply.code(404).send({message:'Không tìm thấy chức năng.'});};
 const tenant=(companyId:string)=>{const c=configuration();if(c&&c.companyId!==companyId)throw new CommandError(404,'Không tìm thấy kho lịch sử của công ty.');return c;};
 app.get('/api/v1/invoice-history',{preHandler:access},async req=>{
  const q=parse(z.object({invoiceNumber:z.string().trim().max(200).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),req.query),c=tenant(req.auth!.companyId);
  if(!c)return {configured:false,readOnly:true,items:[],total:0,page:1,pages:1,pageSize:10};
  return read(async()=>{const a=await index(c),matches=a.entries.filter(e=>!q.invoiceNumber||e.invoiceNumber===q.invoiceNumber),pages=Math.max(1,Math.ceil(matches.length/10)),page=Math.min(q.page,pages),items=[];
   for(const e of matches.slice((page-1)*10,page*10))items.push(summary(e,await payload(c,e)));
   return {configured:true,readOnly:true,postingAllowed:false,archiveHash:a.archiveHash,snapshotHash:a.snapshotHash,items,total:matches.length,page,pages,pageSize:10};
  });
 });
 const id=(params:unknown)=>parse(z.object({id:z.string().regex(hex)}).strict(),params).id;
 async function selected(companyId:string,archiveId:string){const c=tenant(companyId);if(!c)throw new CommandError(404,'Chưa kết nối kho Invoice lịch sử.');const a=await index(c),e=a.entries.find(e=>e.archiveId===archiveId);if(!e)throw new CommandError(404,'Không tìm thấy Invoice lịch sử.');return {c,a,e,p:await payload(c,e)};}
 app.get('/api/v1/invoice-history/:id',{preHandler:access},async req=>{const archiveId=id(req.params);return read(async()=>{
  const {a,e,p}=await selected(req.auth!.companyId,archiveId),fields=['Invoice_Date','Due_Date','Revenue_Month','Currency','Partner_ID','Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD','Paid_Amount_USD','Outstanding_Amount_USD'];
  return {readOnly:true,postingAllowed:false,archiveHash:a.archiveHash,item:summary(e,p),header:Object.fromEntries(fields.map(f=>[f,value(p.capturedHeader.values[f])])),details:p.capturedDetails.map((r:any)=>({sourceRow:r.sourceRow,legacyId:r.legacyId,serviceId:value(r.values.Service_ID),description:value(r.values.Description),revenue:value(r.values.Revenue_USD),wht:value(r.values.WHT_USD),payable:value(r.values.Payable_USD)})),issues:(p.issues??[]).map((i:any)=>({code:value(i.code),field:value(i.field)})),revisionLinks:(p.revisionLinks??[]).map((l:any)=>({field:value(l.field),legacyId:value(l.legacyId),resolved:!!l.target})),pdfUrl:'/api/v1/invoice-history/'+e.archiveId+'/pdf'};
 });});
 app.get('/api/v1/invoice-history/:id/pdf',{preHandler:access},async(req,reply)=>{const archiveId=id(req.params);return read(async()=>{
  const {c,e}=await selected(req.auth!.companyId,archiveId),bytes=await file(c.root,e.pdf.path,64*1024*1024);
  if(bytes.length!==e.pdf.size||bytes.subarray(0,5).toString()!=='%PDF-'||sha(bytes)!==e.pdf.sha256)throw Error('PDF changed');
  return reply.header('Content-Disposition','inline; filename="historical-invoice.pdf"').header('X-Content-Type-Options','nosniff').type('application/pdf').send(bytes);
 });});
}
