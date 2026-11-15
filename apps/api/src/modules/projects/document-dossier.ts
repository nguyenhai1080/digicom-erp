import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {Prisma,prisma} from '@erp/db';
import {PDFDocument} from 'pdf-lib';
import {z} from 'zod';
import {authenticate,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,CommandError,date,parse,writeGuard} from './commands.js';
import {checkedFile,derivedBytes,rollbackFiles,sha} from './financial-documents.js';
import {sourceBytes} from './output-recon.js';
import {capturedReconDocument} from './output-recon-history.js';
import {capturedSignedReconDocument} from './captured-recon-signed.js';
import {dossierBytes,dossierDisplay,dossierLabels,persistDossierPdf,type DossierKind} from './document-dossier-storage.js';
import {inputContractCoverage} from './input-recon-coverage.js';

export const dossierScope=z.object({direction:z.enum(['INPUT','OUTPUT']),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),partnerId:z.uuid(),contractId:z.uuid().optional()}).strict();
export type DossierScope=z.infer<typeof dossierScope>;
export type DossierFile={key:string;kind:DossierKind;label:string;reference:string;documentDate:string|null;version:number;folder:string;filename:string;size:number;checksum:string;current:boolean;documentStatus:string;sourceDocumentId?:string;documentId?:string;warning?:string;downloadUrl:string};
export type DossierEntry={file:DossierFile;read:()=>Promise<Buffer>};
export function dossierAccess(user:Identity){if(user.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy hồ sơ.');}
function allowed(user:Identity,kind:DossierKind){return user.permissions.includes(kind.startsWith('INPUT')?'INPUT_RECON_VIEW':kind.startsWith('OUTPUT_INVOICE')?'INVOICE_VIEW':'RECON_VIEW');}
const limit=(n:number)=>{if(n>500)throw new CommandError(409,'Phạm vi vượt 500 hồ sơ; chọn một hợp đồng hoặc kỳ nhỏ hơn.');};
export async function dossierCatalogue(tx:Prisma.TransactionClient,user:Identity,scope:DossierScope){
 dossierAccess(user);const companyId=user.companyId,partner=await tx.partner.findFirst({where:{companyId,id:scope.partnerId}});
 if(!partner)throw new CommandError(404,'Không tìm thấy đối tác của công ty.');
 const entries:DossierEntry[]=[],warnings:string[]=[];
 const add=(kind:DossierKind,d:any,reference:string,contract:string,current:boolean,read:()=>Promise<Buffer>,sourceDocumentId?:string,warning?:string,key='doc:'+d.id)=>{
  if(!allowed(user,kind)||entries.some(e=>e.file.key===key))return;
  if(d.companyId!==companyId||d.attachment.companyId!==companyId||d.attachment.mimeType!=='application/pdf')throw new CommandError(409,'Liên kết chứng từ không hợp lệ.');
  const checksum=d.attachment.checksumSha256??'',display=dossierDisplay(kind,scope.period,partner.partnerKey,contract,reference,d.versionNo??1,checksum);
  const file:DossierFile={key,kind,label:dossierLabels[kind],reference,documentDate:d.documentDate?.toISOString().slice(0,10)??null,version:d.versionNo??1,...display,size:Number(d.attachment.fileSize),checksum,current,documentStatus:d.status??'ACTIVE',sourceDocumentId,documentId:d.id,warning,downloadUrl:'/api/v1/document-dossier/pdf?'+new URLSearchParams({...scope,key})};entries.push({file,read});
 };
 if(scope.direction==='INPUT'){
  if(!user.permissions.includes('INPUT_RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát đầu vào.');
  const rows=await tx.inputReconciliation.findMany({where:{companyId,inputPartnerId:partner.id,period:scope.period,...(scope.contractId?{inputContractId:scope.contractId}:{})},include:{document:{include:{attachment:true}},inputContract:true},take:501});limit(rows.length);
  const contracts=await tx.contract.findMany({where:{companyId,partnerId:partner.id,dgcDirection:'Input',...(scope.contractId?{id:scope.contractId}:{})}});
  const originals=await tx.document.findMany({where:{companyId,entityType:'InputReconStatement',entityId:{in:contracts.map(c=>c.id)},documentType:'INPUT_RECON',documentNumber:scope.period},include:{attachment:true},take:501});limit(originals.length);
  for(const d of originals){const c=contracts.find(c=>c.id===d.entityId)!;add('INPUT_RECON_ORIGINAL',d,c.contractNumber??c.contractCode,c.contractCode,d.status==='ACTIVE'&&rows.some(r=>r.documentId===d.id),async()=>(await derivedBytes(tx,companyId,d.id,'INPUT_RECON')).bytes);}
  const receipts=await tx.inputDocumentReceipt.findMany({where:{companyId,inputPartnerId:partner.id,period:scope.period,...(scope.contractId?{inputContractId:scope.contractId}:{})},include:{document:{include:{attachment:true}},sourceDocument:{select:{status:true}},inputContract:true},orderBy:{createdAt:'desc'},take:501});limit(receipts.length);
  for(const r of receipts){const d=r.document,kind=r.kind as DossierKind;if(!['INPUT_RECON_SIGNED','INPUT_INVOICE_SIGNED'].includes(kind)||d.documentType!==kind||d.entityId!==r.inputContractId||d.entityType!=='InputReconStatement')throw new CommandError(409,'Hồ sơ nhập không khớp liên kết.');const current=d.status==='ACTIVE'&&r.sourceDocument.status==='ACTIVE'&&rows.some(v=>v.documentId===r.sourceDocumentId&&v.inputContractId===r.inputContractId&&v.outputPartnerId===r.outputPartnerId);add(kind,d,r.reference,r.inputContract.contractCode,current,()=>dossierBytes(d,r.period,r.inputPartnerId,r.inputContractId,kind),r.sourceDocumentId,current?'Chữ ký do người nhập xác nhận; hệ thống không xác minh chứng thư số.':'Bản cũ hoặc biên bản nguồn đã đổi; chỉ tra cứu, không gửi email.');}
 }else{
  if(!user.permissions.some(p=>['INVOICE_VIEW','RECON_VIEW'].includes(p)))throw new CommandError(403,'Cần quyền xem Invoice hoặc đối soát.');
  const invoices=user.permissions.includes('INVOICE_VIEW')?await tx.invoice.findMany({where:{companyId,partnerId:partner.id,period:scope.period,...(scope.contractId?{scopes:{some:{companyId,contractId:scope.contractId}}}:{})},include:{document:{include:{attachment:true}},scopes:{select:{contract:{select:{contractCode:true}}}}},take:501}):[];limit(invoices.length);
  for(const i of invoices){const d=i.document,current=i.isCurrent&&!['CANCELLED','SUPERSEDED'].includes(i.status),contract=[...new Set(i.scopes.map(s=>s.contract.contractCode))].sort().join('+')||'NhieuHopDong';
   if(d.documentType==='INVOICE'&&d.entityType==='Invoice'&&d.entityId===i.id)add('OUTPUT_INVOICE_SIGNED',d,i.invoiceNumber,contract,current&&d.status==='ACTIVE',async()=>(await derivedBytes(tx,companyId,d.id,'INVOICE')).bytes,undefined,i.status==='DRAFT'?'Invoice nháp, chưa phát hành.':undefined);
   const originals=await tx.document.findMany({where:{companyId,entityType:'Invoice',entityId:i.id,documentType:'OUTPUT_INVOICE_ORIGINAL'},include:{attachment:true},take:2});if(originals.length>1)throw new CommandError(409,'Có nhiều bản gốc Invoice cho cùng phiên bản.');
   if(!originals.length)warnings.push(i.invoiceNumber+': chưa lưu bản PDF chưa chèn dấu/chữ ký; không tự dựng lại từ cấu hình mới.');
   for(const original of originals)add('OUTPUT_INVOICE_ORIGINAL',original,i.invoiceNumber,contract,current&&original.status==='ACTIVE',()=>dossierBytes(original,i.period,i.partnerId,null,'OUTPUT_INVOICE_ORIGINAL'),undefined,i.status==='DRAFT'?'Invoice nháp; bản chưa chèn dấu/chữ ký.':'Bản chưa chèn dấu/chữ ký.');
  }
  if(user.permissions.includes('RECON_VIEW')){
   const uploads=await tx.outputReconUpload.findMany({where:{companyId,partnerId:partner.id,period:scope.period,status:{not:'CANCELLED'}},include:{attachment:true,service:true},take:501});limit(uploads.length);
   for(const u of uploads){const f=(u.extractionData as any)?.finalization,bindings=f?.reconciliationId?await tx.revenue.findMany({where:{companyId,reconciliationId:f.reconciliationId,partnerId:partner.id,periodStart:new Date(scope.period+'-01')},select:{contractId:true,contract:{select:{contractCode:true}}},take:501}):[];limit(bindings.length);if(scope.contractId&&!bindings.some(b=>b.contractId===scope.contractId))continue;
    const current=!['SUPERSEDED','REJECTED'].includes(u.status),contract=[...new Set(bindings.map(b=>b.contract.contractCode))].filter(Boolean).sort().join('+')||u.service.serviceKey;
    add('OUTPUT_RECON_ORIGINAL',{id:u.attachment.id,companyId,versionNo:1,attachment:u.attachment},u.uploadCode,contract,current,()=>sourceBytes(u),undefined,'Bản gốc do đối tác cung cấp.','upload:'+u.id);
    const signedVersions=await tx.document.findMany({where:{companyId,documentType:'RECON_SIGNED',entityType:'OutputReconUpload',entityId:u.id},include:{attachment:true},orderBy:{versionNo:'desc'},take:501});limit(signedVersions.length);for(const d of signedVersions)add('OUTPUT_RECON_SIGNED',d,u.uploadCode,contract,current&&u.status==='APPROVED'&&d.status==='ACTIVE'&&d.id===f?.documentId,async()=>(await derivedBytes(tx,companyId,d.id,'RECON_SIGNED')).bytes);
   }
   const captured=await tx.reconciliation.findMany({where:{companyId,partnerId:partner.id,periodStart:new Date(scope.period+'-01'),sourceType:'SYSTEM_IMPORT',...(scope.contractId?{contractId:scope.contractId}:{})},include:{contract:true},take:501});limit(captured.length);
   const currentSources=await tx.revenue.findMany({where:{companyId,partnerId:partner.id,isCurrent:true,reconciliationId:{in:captured.filter(r=>r.isCurrent).map(r=>r.id)}},select:{reconciliationId:true,calculationJson:true},take:5001});if(currentSources.length>5000)throw new CommandError(409,'Nguồn quá lớn.');
   const legacy=(r:any)=>String(r.calculationJson?.source?.legacyId??'').toUpperCase(),revenueIds=currentSources.map(legacy).filter(Boolean),selectedInvoiceIds=invoices.filter(i=>i.isCurrent).map(i=>String((i.snapshot as any)?.source?.legacyId??'').toUpperCase()).filter(Boolean),selectedReconIds=captured.filter(r=>r.isCurrent).map(r=>String((r.ocrRawJson as any)?.documentSource?.legacyId??'').toUpperCase()).filter(Boolean);
   for(const r of captured){if((r.ocrRawJson as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1')continue;const d=await capturedReconDocument(tx,companyId,r.ocrRawJson);if(d)add('OUTPUT_RECON_ORIGINAL',d,r.reconCode,r.contract.contractCode,r.isCurrent&&r.status==='APPROVED',()=>checkedFile(d.attachment,`dgc-history/${companyId}/${d.attachment.id}.pdf`,64*1024*1024));
    if(!r.isCurrent||r.status!=='APPROVED')continue;
    try{const s=await capturedSignedReconDocument(tx,companyId,{id:r.id,partnerId:partner.id,period:scope.period,raw:r.ocrRawJson,selectedReconIds,selectedInvoiceIds,selectedRevenueIds:revenueIds,revenueIds:currentSources.filter(v=>v.reconciliationId===r.id).map(legacy)}),signed=s.document;add('OUTPUT_RECON_SIGNED',signed,r.reconCode,r.contract.contractCode,true,()=>checkedFile(signed.attachment,`dgc-history/${companyId}/${signed.attachment.id}.pdf`,64*1024*1024));}catch(e){if(!(e instanceof CommandError))throw e;warnings.push(r.reconCode+': chưa tìm thấy duy nhất bản ký phù hợp; không dùng bản gốc thay thế.');}
   }
  }
 }
 return {entries,warnings:[...new Set(warnings)],partner};
}

async function inputSource(tx:Prisma.TransactionClient,companyId:string,id:string){
 const {document,bytes}=await derivedBytes(tx,companyId,id,'INPUT_RECON');if(document.status!=='ACTIVE'||document.entityType!=='InputReconStatement')throw new CommandError(409,'Chọn biên bản gốc đang hiệu lực.');
 const rows=await tx.inputReconciliation.findMany({where:{companyId,documentId:id},include:{inputContract:true,inputPartner:true},take:501});limit(rows.length);
 if(!rows.length||rows.some(r=>r.inputContractId!==document.entityId||r.period!==document.documentNumber||r.inputPartnerId!==rows[0].inputPartnerId||r.outputPartnerId!==rows[0].outputPartnerId))throw new CommandError(409,'Biên bản không cùng hợp đồng/kỳ/mạng.');
 const saved=await tx.auditLog.findFirst({where:{companyId,action:'INPUT_RECON_PDF',entityId:id},orderBy:{createdAt:'desc'}}),snapshot=saved?.newValue as any;
 if(!Array.isArray(snapshot?.rowIds)||!Array.isArray(snapshot?.sourceDigests)||snapshot.rowIds.length!==rows.length||rows.some(r=>{const i=snapshot.rowIds.indexOf(r.id);return i<0||snapshot.sourceDigests[i]!==r.sourceDigest;}))throw new CommandError(409,'Biên bản nguồn không khớp đủ hồ sơ đã lưu.');
 if(!snapshot.data?.captured){const r=rows[0],coverage=await inputContractCoverage(tx,companyId,r.inputContractId,r.period,r.outputPartnerId);if(coverage.sources.length!==rows.length||rows.some(row=>!coverage.sources.some(s=>s.id===row.sourceRevenueId)))throw new CommandError(409,'Biên bản chưa đủ nguồn chi tiết hợp đồng. Lập đủ biên bản trước khi nhận bản ký.');}
 return {document,bytes,row:rows[0]};
}
const upload=z.object({sourceDocumentId:z.uuid(),kind:z.enum(['INPUT_RECON_SIGNED','INPUT_INVOICE_SIGNED']),reference:z.string().trim().min(1).max(120).refine(v=>!/[\x00-\x1f]/.test(v)),documentDate:date.optional(),filename:z.string().trim().min(5).max(180).regex(/\.pdf$/i).refine(v=>!/[\x00-\x1f\x7f\\/:"<>|?*]/.test(v)),base64:z.string().min(8).max(22369624).regex(/^[A-Za-z0-9+/]+={0,2}$/),expectedPreviousDocumentId:z.uuid().nullable(),requestId:z.uuid(),confirmed:z.literal(true)}).strict();
export async function documentDossierRoutes(app:FastifyInstance,config:AuthConfig){
 app.addHook('onRequest',authenticate);
 app.get('/api/v1/document-dossier/references',async req=>{const user=req.auth!;dossierAccess(user);if(!user.permissions.some(p=>['INPUT_RECON_VIEW','INVOICE_VIEW','RECON_VIEW'].includes(p)))throw new CommandError(403,'Không có quyền xem chứng từ.');const [partners,contracts]=await Promise.all([prisma.partner.findMany({where:{companyId:user.companyId},select:{id:true,partnerKey:true,legalName:true},orderBy:{legalName:'asc'},take:501}),prisma.contract.findMany({where:{companyId:user.companyId,dgcDirection:{in:user.permissions.includes('INPUT_RECON_VIEW')?['Input','Output']:['Output']}},select:{id:true,contractCode:true,contractNumber:true,partnerId:true,dgcDirection:true},take:501})]);limit(partners.length);limit(contracts.length);return {partners,contracts};});
 app.get('/api/v1/document-dossier',async req=>{const scope=parse(dossierScope,req.query);return prisma.$transaction(async tx=>{const p=await dossierCatalogue(tx,req.auth!,scope);return {items:p.entries.map(e=>e.file),warnings:p.warnings};},{isolationLevel:'RepeatableRead',timeout:30000});});
 app.get('/api/v1/document-dossier/pdf',async(req,reply)=>{const {key,...scope}=parse(dossierScope.extend({key:z.string().regex(/^(doc|upload):[a-f0-9-]{36}$/)}).strict(),req.query);const result=await prisma.$transaction(async tx=>{const p=await dossierCatalogue(tx,req.auth!,scope),entry=p.entries.find(e=>e.file.key===key);if(!entry)throw new CommandError(404,'Không tìm thấy tệp trong phạm vi được xem.');return {bytes:await entry.read(),filename:entry.file.filename};},{timeout:30000});return reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`inline; filename="${result.filename}"`).type('application/pdf').send(result.bytes);});
 app.post('/api/v1/document-dossier/input-upload',{bodyLimit:23*1024*1024,onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async(req,reply)=>{
  const user=req.auth!;dossierAccess(user);if(!user.permissions.includes('INPUT_RECON_VIEW'))throw new CommandError(403,'Cần quyền xem đối soát đầu vào.');const b=parse(upload,req.body),bytes=Buffer.from(b.base64,'base64');
  if(!bytes.length||bytes.length>16*1024*1024||bytes.toString('base64')!==b.base64||!/^%PDF-[12]\.\d/.test(bytes.subarray(0,8).toString('ascii'))||!bytes.subarray(-2048).toString('ascii').includes('%%EOF'))throw new CommandError(422,'Chọn PDF hợp lệ tối đa 16 MB.');
  try{const pdf=await PDFDocument.load(bytes,{updateMetadata:false});if(pdf.isEncrypted||pdf.getPageCount()<1||pdf.getPageCount()>200)throw Error();}catch{throw new CommandError(422,'PDF bị khóa, lỗi hoặc vượt 200 trang.');}
  if(b.kind==='INPUT_INVOICE_SIGNED'&&!b.documentDate)throw new CommandError(400,'Nhập ngày Invoice đầu vào.');
  const {base64,requestId,...metadata}=b,requestDigest=sha(JSON.stringify({...metadata,checksum:sha(bytes)})),rollback:string[]=[];
  try{const result=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
   const previousRequest=await tx.inputDocumentReceipt.findUnique({where:{companyId_requestId:{companyId:user.companyId,requestId}},include:{document:true}});
   if(previousRequest){if(previousRequest.requestDigest!==requestDigest)throw new CommandError(409,'Mã nhập đã được dùng cho nội dung khác.');return {documentId:previousRequest.documentId,replayed:true};}
   const source=await inputSource(tx,user.companyId,b.sourceDocumentId),r=source.row;
   if(sha(bytes)===source.document.attachment.checksumSha256)throw new CommandError(409,'Tệp trùng bản gốc chưa ký; kiểm tra đúng bản đã ký.');
   const reference=b.kind==='INPUT_RECON_SIGNED'?r.inputContract.contractNumber??r.inputContract.contractCode:b.reference;
   const existing=await tx.inputDocumentReceipt.findMany({where:{companyId:user.companyId,kind:b.kind,inputPartnerId:r.inputPartnerId,...(b.kind==='INPUT_RECON_SIGNED'?{sourceDocumentId:b.sourceDocumentId}:{reference:{equals:reference,mode:'insensitive'},documentDate:{gte:new Date(b.documentDate!.slice(0,4)+'-01-01'),lt:new Date(String(Number(b.documentDate!.slice(0,4))+1)+'-01-01')}})},include:{document:{include:{attachment:true}}},orderBy:{createdAt:'desc'},take:501});limit(existing.length);
   if(existing.some(v=>v.period!==r.period||v.inputContractId!==r.inputContractId||v.outputPartnerId!==r.outputPartnerId))throw new CommandError(409,'Số Invoice đã có ở phạm vi khác. Kiểm tra hồ sơ trước khi nhập thêm.');
   const active=existing.filter(v=>v.document.status==='ACTIVE');if(active.length>1||(active[0]?.documentId??null)!==b.expectedPreviousDocumentId)throw new CommandError(409,'Phiên bản đã thay đổi. Tải lại danh sách và kiểm tra bản trước.');
   if(active[0]?.document.attachment.checksumSha256===sha(bytes))throw new CommandError(409,'Tệp này đã được lưu.');
   const version=Math.max(0,...existing.map(v=>v.document.versionNo))+1,filename=dossierDisplay(b.kind,r.period,r.inputPartner.partnerKey,r.inputContract.contractCode,reference,version,sha(bytes)).filename;
   const d=await persistDossierPdf(tx,user,{period:r.period,partnerId:r.inputPartnerId,contractId:r.inputContractId,kind:b.kind,entityId:r.inputContractId,reference,version,filename},bytes,rollback);
   if(b.documentDate)await tx.document.update({where:{id:d.id},data:{documentDate:new Date(b.documentDate)}});
   await tx.inputDocumentReceipt.create({data:{companyId:user.companyId,documentId:d.id,sourceDocumentId:source.document.id,inputContractId:r.inputContractId,inputPartnerId:r.inputPartnerId,outputPartnerId:r.outputPartnerId,period:r.period,kind:b.kind,reference,documentDate:b.documentDate?new Date(b.documentDate):null,requestId,requestDigest}});
   for(const old of active)await tx.document.update({where:{id:old.documentId},data:{status:'SUPERSEDED'}});
   await audit(tx,user,'DOSSIER_INPUT_RECEIVED','Document',d.id,null,{kind:b.kind,sourceDocumentId:source.document.id,period:r.period,contractId:r.inputContractId,reference,originalFilename:b.filename,checksum:sha(bytes),version,signatureAttestation:'OWNER_USER_CONFIRMED_NOT_CRYPTOGRAPHICALLY_VERIFIED',previousDocumentId:b.expectedPreviousDocumentId});
   return {documentId:d.id,filename,replayed:false};
  },{timeout:30000});return reply.code(result.replayed?200:201).send(result);}catch(e){await rollbackFiles(rollback);throw e;}
 });
}
