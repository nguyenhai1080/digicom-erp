import type {FastifyInstance} from 'fastify';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,code,CommandError,date,parse,timestamp,unchanged,writeGuard} from './commands.js';
import {evidence} from './expenses.js';
import {checkedFile,persistPdf,persistPaymentImage,rollbackFiles,sha} from './financial-documents.js';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
const id=(p:unknown)=>parse(z.object({id:z.uuid()}).strict(),p).id;
function permissions(u:Identity){if(!['PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST'].every(p=>u.permissions.includes(p)))throw new CommandError(403,'Cần quyền tạo, duyệt và ghi nhận thanh toán.');}
const body=z.object({requestId:z.uuid(),sourceAccountId:z.uuid(),destinationAccountId:z.uuid(),transferDate:date,amount:z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/),description:z.string().trim().min(1).max(500),reference:z.string().trim().max(200),note:z.string().trim().max(2000),confirmed:z.literal(true),file:z.object({filename:z.string().trim().min(1).max(200),base64:z.string().max(7*1024*1024)}).strict().optional()}).strict();
async function accounts(tx:Prisma.TransactionClient,companyId:string,sourceId:string,destinationId:string){
 if(sourceId===destinationId)throw new CommandError(400,'Tài khoản nguồn và tài khoản nhận phải khác nhau.');
 for(const accountId of [sourceId,destinationId].sort())await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${companyId}::uuid AND id=${accountId}::uuid FOR UPDATE`;
 const rows=await tx.cashAccount.findMany({where:{companyId,id:{in:[sourceId,destinationId]}}}),source=rows.find(a=>a.id===sourceId),destination=rows.find(a=>a.id===destinationId);
 if(!source||!destination||source.currency!==destination.currency||source.kind===destination.kind||![source.kind,destination.kind].every(k=>['BANK','CASH'].includes(k)))throw new CommandError(409,'Chọn một tài khoản ngân hàng và một quỹ cùng tiền tệ, thuộc công ty.');
 return {source,destination};
}
async function move(tx:Prisma.TransactionClient,user:Identity,t:{id:string;sourceAccountId:string;destinationAccountId:string;amount:Prisma.Decimal;transferCode:string;description:string;transferDate:Date},reverse=false){
 const {source,destination}=await accounts(tx,user.companyId,t.sourceAccountId,t.destinationAccountId);
 if(!reverse&&(source.status!=='ACTIVE'||destination.status!=='ACTIVE'||source.openingDate>t.transferDate||destination.openingDate>t.transferDate))throw new CommandError(409,'Tài khoản cần hoạt động và ngày chuyển phải từ ngày bắt đầu theo dõi của cả hai tài khoản.');
 const from=reverse?destination:source,to=reverse?source:destination;
 if(from.balance.lt(t.amount))throw new CommandError(409,reverse?'Quỹ/tài khoản nhận không đủ số dư để hủy giao dịch.':'Tài khoản nguồn không đủ số dư.');
 const outgoing=await tx.cashAccount.update({where:{id:from.id},data:{balance:{decrement:t.amount}}}),incoming=await tx.cashAccount.update({where:{id:to.id},data:{balance:{increment:t.amount}}});
 for(const [account,direction,kind] of [[outgoing,'OUT',reverse?'TRANSFER_VOID_OUT':'TRANSFER_OUT'],[incoming,'IN',reverse?'TRANSFER_VOID_IN':'TRANSFER_IN']] as const)await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:account.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:reverse?new Date(today()):t.transferDate,kind,direction,currency:account.currency,amount:t.amount,balanceAfter:account.balance,sourceId:t.id,description:(reverse?'Hủy chuyển tiền ':'Chuyển tiền ')+t.transferCode+' · '+from.accountCode+' → '+to.accountCode+' · '+t.description}});
 return {sourceBefore:source.balance,destinationBefore:destination.balance,fromAfter:outgoing.balance,toAfter:incoming.balance};
}
export async function cashTransferRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/cash-transfers',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(z.object({page:z.coerce.number().int().min(1).default(1),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),accountId:z.uuid().optional(),status:z.enum(['POSTED','VOIDED']).optional()}).strict(),req.query),companyId=req.auth!.companyId,start=q.period?new Date(q.period+'-01'):undefined,end=start?new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)):undefined;
  const where={companyId,...(start?{transferDate:{gte:start,lt:end}}:{}),...(q.status?{status:q.status}:{}),...(q.accountId?{OR:[{sourceAccountId:q.accountId},{destinationAccountId:q.accountId}]}:{})};
  const [items,total,refs]=await prisma.$transaction([prisma.cashTransfer.findMany({where,include:{source:{select:{accountCode:true}},destination:{select:{accountCode:true}}},orderBy:[{transferDate:'desc'},{createdAt:'desc'},{id:'asc'}],take:10,skip:(q.page-1)*10}),prisma.cashTransfer.count({where}),prisma.cashAccount.findMany({where:{companyId},select:{id:true,accountCode:true,name:true,kind:true,currency:true,balance:true,status:true},orderBy:{accountCode:'asc'},take:1000})]);return {items,total,page:q.page,accounts:refs};
 });
 app.post('/api/v1/cash-transfers',{bodyLimit:8*1024*1024,onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const b=parse(body,req.body),user=req.auth!;permissions(user);const value=new Prisma.Decimal(b.amount);if(!value.gt(0)||b.transferDate>today())throw new CommandError(400,'Số tiền phải lớn hơn 0 và ngày chuyển không được ở tương lai.');
  const digest=sha(JSON.stringify(b)),doc=await evidence(b.file),files:string[]=[];
  try{return await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+':cash-transfer:'+b.requestId},0))`;
   const old=await tx.cashTransfer.findUnique({where:{companyId_requestId:{companyId:user.companyId,requestId:b.requestId}}});if(old){if(old.requestDigest!==digest)throw new CommandError(409,'Mã yêu cầu đã được dùng cho giao dịch khác.');return {item:old,message:'Giao dịch đã được lưu; không ghi trùng.'};}
   const a=await accounts(tx,user.companyId,b.sourceAccountId,b.destinationAccountId);if(a.source.currency==='VND'&&!value.isInteger())throw new CommandError(400,'Số VND phải là số nguyên.');
   let item=await tx.cashTransfer.create({data:{companyId:user.companyId,transferCode:await code(tx,user.companyId,'CASH_TRANSFER','TRF'),requestId:b.requestId,requestDigest:digest,sourceAccountId:b.sourceAccountId,destinationAccountId:b.destinationAccountId,transferDate:new Date(b.transferDate),currency:a.source.currency,amount:value,description:b.description,reference:b.reference,note:b.note,createdById:user.userId}});
   const movements=await move(tx,user,item);
   if(doc){const filename=item.transferCode+'.'+doc.ext,d=doc.ext==='pdf'?await persistPdf(tx,user,'CashTransfer',item.id,'EXPENSE_EVIDENCE',filename,doc.bytes,1,files):await persistPaymentImage(tx,user,item.id,filename,doc.bytes,doc.ext,files,true);if(doc.ext!=='pdf')await tx.document.update({where:{id:d.id},data:{entityType:'CashTransfer'}});item=await tx.cashTransfer.update({where:{id:item.id},data:{documentId:d.id}});}
   await audit(tx,user,'CASH_TRANSFER_POST','CashTransfer',item.id,null,{...item,...movements},'Chuyển tiền nội bộ, cập nhật đồng thời hai số dư; không tính vào thu/chi.');return {item,message:'Đã ghi nhận chuyển tiền và cập nhật hai số dư.'};
  },{timeout:30000});}catch(e){await rollbackFiles(files);throw e;}
 });
 app.post('/api/v1/cash-transfers/:id/void',{onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const user=req.auth!;permissions(user);const transferId=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,reason:z.string().trim().min(3).max(500),confirmed:z.literal(true)}).strict(),req.body);
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM cash_transfers WHERE company_id=${user.companyId}::uuid AND id=${transferId}::uuid FOR UPDATE`;const old=await tx.cashTransfer.findFirst({where:{id:transferId,companyId:user.companyId}});if(!old)throw new CommandError(404,'Không tìm thấy giao dịch.');if(old.status==='VOIDED')return {message:'Giao dịch đã được hủy; không hoàn tiền lần nữa.'};unchanged(old,b.expectedUpdatedAt);const balances=await move(tx,user,old,true),item=await tx.cashTransfer.update({where:{id:old.id},data:{status:'VOIDED',voidReason:b.reason}});await audit(tx,user,'CASH_TRANSFER_VOID','CashTransfer',old.id,old,{...item,...balances},b.reason);return {message:'Đã hủy và hoàn lại hai số dư; giữ nguyên lịch sử.'};},{timeout:30000});
 });
 app.get('/api/v1/cash-transfers/:id/document',{preHandler:requirePermission('PAYMENT_VIEW')},async(req,reply)=>{const companyId=req.auth!.companyId,t=await prisma.cashTransfer.findFirst({where:{id:id(req.params),companyId}});if(!t?.documentId)throw new CommandError(404,'Không có chứng từ.');const doc=await prisma.document.findFirst({where:{id:t.documentId,companyId,entityType:'CashTransfer',entityId:t.id,status:'ACTIVE'},include:{attachment:true}});if(!doc||doc.attachment.companyId!==companyId)throw new CommandError(404,'Không có chứng từ.');const ext=doc.attachment.storedFilename.split('.').at(-1);if(!['pdf','png','jpg'].includes(ext??''))throw new CommandError(409,'Chứng từ không hợp lệ.');return reply.type(doc.attachment.mimeType!).header('Content-Disposition',`inline; filename="${t.transferCode}.${ext}"`).send(await checkedFile(doc.attachment,`expenses/${companyId}/${doc.attachment.id}.${ext}`,5*1024*1024));});
}
