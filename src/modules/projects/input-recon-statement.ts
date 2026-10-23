import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,date,parse,writeGuard} from './commands.js';
import {assertInputSnapshot,inputDigest,inputReconPlan,requireDgc} from './input-recon.js';
import {derivedBytes,persistPdf,rollbackFiles} from './financial-documents.js';
import {readDgcInvoiceProfile} from './dgc-invoice-profile.js';
import {renderInputStatement,type InputStatement} from './input-recon-pdf.js';
import {usdWords} from './invoice-template.js';

const D=(v:string|Prisma.Decimal)=>new Prisma.Decimal(v),selection=z.object({period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),inputPartnerId:z.uuid(),inputContractId:z.uuid().optional(),reconDate:date,includeApproved:z.boolean().default(true)}).strict();
function fail(s:string):never{throw new CommandError(409,s);}
export function inputVndWords(value:string){
 let n=BigInt(D(value).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed(0));if(n===0n)return 'Không đồng chẵn';
 if(n<0||n>=1000000000000000000n)fail('Số tiền vượt phạm vi đọc bằng chữ.');
 const ones=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'],units=['','nghìn','triệu','tỷ','nghìn tỷ','triệu tỷ'],groups:number[]=[];
 while(n){groups.push(Number(n%1000n));n/=1000n;}
 const parts=[];for(let i=groups.length-1;i>=0;i--){const v=groups[i];if(!v)continue;const tr=Math.floor(v/100),ch=Math.floor(v%100/10),dv=v%10,s:string[]=[];if(tr||i<groups.length-1)s.push(ones[tr]+' trăm');if(ch>1){s.push(ones[ch]+' mươi');if(dv)s.push(dv===1?'mốt':dv===5?'lăm':ones[dv]);}else if(ch===1){s.push('mười');if(dv)s.push(dv===5?'lăm':ones[dv]);}else if(dv){if(tr||i<groups.length-1)s.push('lẻ');s.push(ones[dv]);}parts.push(s.join(' ')+(units[i]?' '+units[i]:''));}
 const words=parts.join(', ');return words.charAt(0).toUpperCase()+words.slice(1)+' đồng chẵn';
}
async function statementPlan(tx:Prisma.TransactionClient,companyId:string,body:z.infer<typeof selection>){
 await requireDgc(tx,companyId);
 const rows=await tx.inputReconciliation.findMany({where:{companyId,period:body.period,inputPartnerId:body.inputPartnerId,...(body.inputContractId?{inputContractId:body.inputContractId}:{}),status:{in:body.includeApproved?['DRAFT','GENERATED','APPROVED']:['DRAFT','GENERATED']}},include:{service:true,inputContract:true,inputPartner:true,outputPartner:true},orderBy:[{serviceId:'asc'},{inputReconCode:'asc'},{id:'asc'}],take:501});
 if(!rows.length||rows.length>500)fail('Cần từ 1 đến 500 dòng đối soát để lập biên bản.');
 if(new Set(rows.map(r=>r.inputContractId)).size!==1)fail('Có nhiều hợp đồng Input; chọn một hợp đồng để lập đúng một biên bản.');
 if(new Set(rows.map(r=>r.currency+'|'+r.fxRate.toFixed())).size!==1)fail('Các dòng khác tiền tệ hoặc tỷ giá; cần đối chiếu trước khi in.');
 const first=rows[0],currency=first.currency;
 const round=(d:Prisma.Decimal)=>d.toDecimalPlaces(currency==='VND'?0:2,Prisma.Decimal.ROUND_HALF_UP);
 const groups=new Map<string,InputStatement['lines'][number]>();
 for(const r of rows){
  assertInputSnapshot(r);
  if(r.status!=='APPROVED'&&(await inputReconPlan(tx,companyId,r.sourceRevenueId)).sourceDigest!==r.sourceDigest)fail('Nguồn nháp đã thay đổi. Cập nhật và xem lại trước khi tạo PDF.');
  if([r.service,r.inputContract,r.inputPartner,r.outputPartner].some(x=>x.companyId!==companyId))fail('Liên kết biên bản không cùng công ty.');
  const existing=groups.get(r.serviceId);if(existing&&!D(existing.shareRate).eq(r.shareRate))fail('Cùng dịch vụ có nhiều tỷ lệ; không gộp thành một tỷ lệ hiển thị.');
  const line=existing??{service:r.service.serviceName,baseUsd:'0',shareRate:r.shareRate.toFixed(),cooperation:'0',companyAmount:'0',partnerAmount:'0'};
  const cooperation=round(r.baseUsd.mul(r.fxRate)),partner=round(r.payableAmount);
  line.baseUsd=D(line.baseUsd).plus(r.baseUsd).toFixed(2);line.cooperation=D(line.cooperation).plus(cooperation).toFixed();line.partnerAmount=D(line.partnerAmount).plus(partner).toFixed();line.companyAmount=D(line.companyAmount).plus(cooperation.minus(partner)).toFixed();groups.set(r.serviceId,line);
 }
 const config=await readDgcInvoiceProfile(tx,companyId),lines=[...groups.values()],sum=(k:'baseUsd'|'cooperation'|'companyAmount'|'partnerAmount')=>lines.reduce((s,l)=>s.plus(l[k]),D('0')).toFixed(k==='baseUsd'||currency==='USD'?2:0);
 const totals={baseUsd:sum('baseUsd'),cooperation:sum('cooperation'),companyAmount:sum('companyAmount'),partnerAmount:sum('partnerAmount')};
 const toDate=new Date(Date.UTC(Number(body.period.slice(0,4)),Number(body.period.slice(5,7)),0)).toISOString().slice(0,10);
 const data:InputStatement={period:body.period,reconDate:body.reconDate,fromDate:body.period+'-01',toDate,issuer:config.profile.issuerName,partner:first.inputPartner.legalName,partnerKey:first.inputPartner.partnerKey,contractNumber:first.inputContract.contractNumber??first.inputContract.contractCode,outputPartners:[...new Set(rows.map(r=>r.outputPartner.partnerKey))],currency,fxRate:first.fxRate.toFixed(),lines,totals,amountInWords:currency==='VND'?inputVndWords(totals.partnerAmount):usdWords(totals.partnerAmount)};
 const latest=await tx.document.aggregate({where:{companyId,entityType:'InputReconStatement',entityId:first.inputContractId,documentType:'INPUT_RECON',documentNumber:body.period},_max:{versionNo:true}});
 const version=(latest._max.versionNo??0)+1;
 return {rows,data,version,digest:inputDigest({selection:body,data,profile:config.metadata,rows:rows.map(r=>({id:r.id,updatedAt:r.updatedAt,sourceDigest:r.sourceDigest})),version})};
}
let producing=false;
export async function inputStatementRoutes(app:FastifyInstance,config:AuthConfig){
 app.post('/api/v1/input-recon/statement-preview',{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async req=>{const b=parse(selection,req.body);return prisma.$transaction(async tx=>{const p=await statementPlan(tx,req.auth!.companyId,b);return {data:p.data,digest:p.digest,rowIds:p.rows.map(r=>r.id)};},{isolationLevel:'RepeatableRead',timeout:30000});});
 const confirmed=selection.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict();
 for(const action of ['statement-pdf-preview','statement-create'] as const)app.post('/api/v1/input-recon/'+action,{onRequest:writeGuard('INPUT_RECON_GENERATE',config)},async(req,reply)=>{
  if(producing)throw new CommandError(429,'Đang tạo biên bản khác. Thử lại sau.');producing=true;const rollback:string[]=[];
  try{const b=parse(confirmed,req.body),user=req.auth!,{digest:expected,confirmed:_,...input}=b;
   const result=await prisma.$transaction(async tx=>{
    if(action==='statement-create')await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
    const p=await statementPlan(tx,user.companyId,input);if(p.digest!==expected)fail('Nguồn hoặc biên bản đã thay đổi. Xem lại trước khi lưu.');
    const bytes=await renderInputStatement(p.data);if(action==='statement-pdf-preview')return {bytes};
    const filename='Input_Recon_'+p.data.partnerKey.replace(/[^A-Za-z0-9_-]/g,'_')+'_'+input.period+'_v'+p.version+'.pdf';
    const doc=await persistPdf(tx,user,'InputReconStatement',p.rows[0].inputContractId,'INPUT_RECON',filename,bytes,p.version,rollback);
    await tx.document.update({where:{id:doc.id},data:{documentNumber:input.period}});
    const oldIds=[...new Set(p.rows.flatMap(r=>r.documentId?[r.documentId]:[]))];
    await tx.inputReconciliation.updateMany({where:{companyId:user.companyId,id:{in:p.rows.map(r=>r.id)},status:{in:['DRAFT','GENERATED']}},data:{status:'GENERATED',documentId:doc.id}});
    await tx.inputReconciliation.updateMany({where:{companyId:user.companyId,id:{in:p.rows.map(r=>r.id)},status:'APPROVED'},data:{documentId:doc.id}});
    for(const id of oldIds)if(!await tx.inputReconciliation.count({where:{companyId:user.companyId,documentId:id}}))await tx.document.updateMany({where:{companyId:user.companyId,id},data:{status:'SUPERSEDED'}});
    await audit(tx,user,'INPUT_RECON_PDF','Document',doc.id,null,{data:p.data,rowIds:p.rows.map(r=>r.id),sourceDigests:p.rows.map(r=>r.sourceDigest),version:p.version});
    return {documentId:doc.id,version:p.version,filename};
   },{timeout:60000});
   return 'bytes'in result?reply.type('application/pdf').header('Cache-Control','no-store').send(result.bytes):reply.code(201).send(result);
  }catch(e){await rollbackFiles(rollback);throw e;}finally{producing=false;}
 });
 app.get('/api/v1/input-recon/:id/pdf',{preHandler:requirePermission('INPUT_RECON_VIEW')},async(req,reply)=>{
  const id=parse(z.object({id:z.uuid()}).strict(),req.params).id;
  const result=await prisma.$transaction(async tx=>{await requireDgc(tx,req.auth!.companyId);const r=await tx.inputReconciliation.findFirst({where:{companyId:req.auth!.companyId,id}});if(!r?.documentId)throw new CommandError(404,'Chưa có PDF đối soát.');const a=await derivedBytes(tx,r.companyId,r.documentId,'INPUT_RECON');if(a.document.entityType!=='InputReconStatement'||a.document.entityId!==r.inputContractId||a.document.documentNumber!==r.period)fail('PDF không khớp hợp đồng/kỳ đối soát.');return a;});
  return reply.type('application/pdf').header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(result.bytes);
 });
}
