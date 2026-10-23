import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,Prisma} from '@erp/db';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {requirePermission,type AuthConfig,type Identity} from '../auth/access.js';
import {audit,code,CommandError,date,parse,timestamp,unchanged,writeGuard} from './commands.js';
import {checkedFile,persistPdf,persistPaymentImage,rollbackFiles,sha} from './financial-documents.js';

const categories=['OFFICE','SALARY','RENT','UTILITIES','TRAVEL','MARKETING','EQUIPMENT','SERVICES','OTHER'] as const;
const file=z.object({filename:z.string().trim().min(1).max(200),base64:z.string().max(7*1024*1024)}).strict();
const fields=z.object({direction:z.enum(['IN','OUT']),purpose:z.string().trim().min(1).max(100),projectLabel:z.string().trim().max(100),nature:z.enum(['ACTUAL','INTERNAL','NON_EXPENSE','UNKNOWN']),cashAccountId:z.uuid(),expenseDate:date,category:z.enum(categories),description:z.string().trim().min(1).max(500),payee:z.string().trim().max(200),reference:z.string().trim().max(200),currency:z.enum(['VND','USD']),amount:z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/),note:z.string().trim().max(2000),file:file.optional()}).strict();
const query=z.object({page:z.coerce.number().int().min(1).default(1),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),accountId:z.uuid().optional(),category:z.enum(categories).optional(),status:z.enum(['DRAFT','POSTED','VOIDED']).optional()}).strict();
const id=(p:unknown)=>parse(z.object({id:z.uuid()}).strict(),p).id;
function scope(companyId:string,q:z.infer<typeof query>){const start=q.period?new Date(q.period+'-01'):undefined,end=start?new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)):undefined;return {companyId,...(q.accountId?{cashAccountId:q.accountId}:{}),...(q.category?{category:q.category}:{}),...(start?{expenseDate:{gte:start,lt:end}}:{})};}
function approvePermission(user:Identity){if(!['PAYMENT_APPROVE','PAYMENT_POST'].every(p=>user.permissions.includes(p)))throw new CommandError(403,'Cần quyền duyệt và ghi nhận thanh toán.');}
function amount(b:z.infer<typeof fields>){const v=new Prisma.Decimal(b.amount);if(!v.gt(0)||b.currency==='VND'&&!v.isInteger())throw new CommandError(400,'Số tiền phải lớn hơn 0; VND phải là số nguyên.');return v;}
async function account(tx:Prisma.TransactionClient,companyId:string,b:{cashAccountId:string;currency:string;expenseDate:string|Date},lock=false){
 if(lock)await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${companyId}::uuid AND id=${b.cashAccountId}::uuid FOR UPDATE`;
 const a=await tx.cashAccount.findFirst({where:{companyId,id:b.cashAccountId,status:'ACTIVE',currency:b.currency}});
 if(!a)throw new CommandError(409,'Chọn tài khoản/quỹ đang hoạt động, đúng tiền tệ và thuộc công ty.');
 if(a.openingDate>new Date(b.expenseDate))throw new CommandError(409,'Ngày chi phải từ ngày bắt đầu theo dõi số dư tài khoản.');return a;
}
export async function evidence(v:z.infer<typeof file>|undefined){
 if(!v)return;
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(v.base64))throw new CommandError(400,'Chứng từ không hợp lệ.');
 const bytes=Buffer.from(v.base64,'base64');if(bytes.length>5*1024*1024)throw new CommandError(400,'Chứng từ tối đa 5 MB.');let ext:'pdf'|'png'|'jpg'='pdf';
 if(bytes.subarray(0,5).equals(Buffer.from('%PDF-'))){try{const doc=await PDFDocument.load(bytes);if(doc.isEncrypted||doc.getPageCount()>30)throw Error();}catch{throw new CommandError(400,'PDF chứng từ bị lỗi hoặc khóa.');}}
 else{try{const image=sharp(bytes,{limitInputPixels:20000000}),m=await image.metadata();if(!['png','jpeg'].includes(m.format??'')||(m.pages??1)>1)throw Error();await image.stats();ext=m.format==='png'?'png':'jpg';}catch{throw new CommandError(400,'Chứng từ phải là PDF, PNG hoặc JPEG hợp lệ.');}}
 return {bytes,ext};
}
async function attach(tx:Prisma.TransactionClient,user:Identity,expenseId:string,expenseCode:string,v:Awaited<ReturnType<typeof evidence>>,files:string[]){if(!v)return;const name=expenseCode+'.'+v.ext;return v.ext==='pdf'?persistPdf(tx,user,'Expense',expenseId,'EXPENSE_EVIDENCE',name,v.bytes,1,files):persistPaymentImage(tx,user,expenseId,name,v.bytes,v.ext,files,true);}
async function postExpense(tx:Prisma.TransactionClient,user:Identity,e:Prisma.ExpenseGetPayload<{}>){
 if(e.expenseDate>new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})))throw new CommandError(409,'Ngày ghi nhận không được nằm trong tương lai.');const a=await account(tx,user.companyId,e,true);if(e.direction==='OUT'&&a.balance.lt(e.amount))throw new CommandError(409,'Số dư tài khoản/quỹ không đủ để ghi nhận khoản chi.');
 const updated=await tx.cashAccount.update({where:{id:a.id},data:{balance:e.direction==='OUT'?{decrement:e.amount}:{increment:e.amount}}});
 await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:a.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:e.expenseDate,kind:e.direction==='OUT'?'EXPENSE':'MANUAL_RECEIPT',direction:e.direction,currency:e.currency,amount:e.amount,balanceAfter:updated.balance,sourceId:e.id,description:e.expenseCode+' · '+e.description}});
 return tx.expense.update({where:{id:e.id},data:{status:'POSTED',postedById:user.userId,postedAt:new Date()}});
}
export async function expenseRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/expenses',{preHandler:requirePermission('PAYMENT_VIEW')},async req=>{
  const q=parse(query,req.query),companyId=req.auth!.companyId,where={...scope(companyId,q),...(q.status?{status:q.status}:{})};
  const [items,total,accounts]=await prisma.$transaction([prisma.expense.findMany({where,include:{account:{select:{accountCode:true,name:true}}},orderBy:[{expenseDate:'desc'},{createdAt:'desc'},{id:'asc'}],skip:(q.page-1)*10,take:10}),prisma.expense.count({where}),prisma.cashAccount.findMany({where:{companyId,status:'ACTIVE'},select:{id:true,accountCode:true,name:true,currency:true,balance:true,openingDate:true},orderBy:{accountCode:'asc'},take:1000})]);return {items,total,page:q.page,accounts};
 });
 app.post('/api/v1/expenses',{bodyLimit:8*1024*1024,onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const b=parse(fields.extend({requestId:z.uuid(),post:z.boolean(),confirmed:z.boolean()}).strict(),req.body),user=req.auth!,value=amount(b),digest=sha(JSON.stringify(b));if(b.post){approvePermission(user);if(!b.confirmed)throw new CommandError(400,'Cần xác nhận khoản chi thực tế.');}const doc=await evidence(b.file),files:string[]=[];
  try{return await prisma.$transaction(async tx=>{
   // Serialize identical create requests before lookup, including draft-only saves.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+':expense:'+b.requestId},0))`;
   const old=await tx.expense.findUnique({where:{companyId_requestId:{companyId:user.companyId,requestId:b.requestId}}});if(old){if(old.requestDigest!==digest)throw new CommandError(409,'Mã yêu cầu đã được dùng cho khoản chi khác.');return {item:old,message:'Khoản chi đã được lưu; không ghi trùng.'};}
   await account(tx,user.companyId,b);let item=await tx.expense.create({data:{companyId:user.companyId,direction:b.direction,purpose:b.purpose,projectLabel:b.projectLabel,nature:b.nature,cashAccountId:b.cashAccountId,expenseCode:await code(tx,user.companyId,'EXPENSE','EXP'),requestId:b.requestId,requestDigest:digest,expenseDate:new Date(b.expenseDate),category:b.category,description:b.description,payee:b.payee,reference:b.reference,currency:b.currency,amount:value,note:b.note,createdById:user.userId}});
   const attachment=await attach(tx,user,item.id,item.expenseCode,doc,files);if(attachment)item=await tx.expense.update({where:{id:item.id},data:{documentId:attachment.id}});
   if(b.post)item=await postExpense(tx,user,item);
   await audit(tx,user,b.post?'EXPENSE_POST':'EXPENSE_CREATE','Expense',item.id,null,item,b.post?'Ghi nhận chi tiêu và trừ số dư tài khoản':'Lưu chi tiêu nháp');return {item,message:b.post?'Đã ghi nhận chi tiêu và cập nhật số dư.':'Đã lưu khoản chi nháp.'};
  },{timeout:30000});}catch(e){await rollbackFiles(files);throw e;}
 });
 app.post('/api/v1/expenses/:id/update',{bodyLimit:8*1024*1024,onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const expenseId=id(req.params),b=parse(fields.extend({expectedUpdatedAt:timestamp}).strict(),req.body),user=req.auth!,value=amount(b),doc=await evidence(b.file),files:string[]=[];
  try{return await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM expenses WHERE company_id=${user.companyId}::uuid AND id=${expenseId}::uuid FOR UPDATE`;
   const old=await tx.expense.findFirst({where:{companyId:user.companyId,id:expenseId}});if(!old)throw new CommandError(404,'Không tìm thấy khoản chi.');unchanged(old,b.expectedUpdatedAt);if(old.status!=='DRAFT')throw new CommandError(409,'Chỉ sửa khoản chi nháp.');await account(tx,user.companyId,b);
   const attached=await attach(tx,user,old.id,old.expenseCode,doc,files);if(attached&&old.documentId)await tx.document.update({where:{id:old.documentId},data:{status:'SUPERSEDED'}});
   const {file:ignored,expectedUpdatedAt,...data}=b,item=await tx.expense.update({where:{id:old.id},data:{...data,expenseDate:new Date(b.expenseDate),amount:value,...(attached?{documentId:attached.id}:{})}});
   await audit(tx,user,'EXPENSE_EDIT','Expense',item.id,old,item,'Sửa khoản chi nháp');return {item,message:'Đã cập nhật khoản chi nháp.'};
  },{timeout:30000});}catch(e){await rollbackFiles(files);throw e;}
 });
 app.post('/api/v1/expenses/:id/post',{onRequest:writeGuard('PAYMENT_POST',config)},async req=>{
  const expenseId=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;approvePermission(user);
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM expenses WHERE company_id=${user.companyId}::uuid AND id=${expenseId}::uuid FOR UPDATE`;const old=await tx.expense.findFirst({where:{companyId:user.companyId,id:expenseId}});if(!old)throw new CommandError(404,'Không tìm thấy khoản chi.');if(old.status==='POSTED')return {message:'Khoản chi đã được ghi nhận; không trừ lại số dư.'};unchanged(old,b.expectedUpdatedAt);if(old.status!=='DRAFT')throw new CommandError(409,'Chỉ ghi nhận khoản chi nháp.');const item=await postExpense(tx,user,old);await audit(tx,user,'EXPENSE_POST','Expense',item.id,old,item,'Duyệt khoản chi và trừ số dư');return {message:'Đã ghi nhận chi tiêu và cập nhật số dư.'};});
 });
 app.post('/api/v1/expenses/:id/void',{onRequest:writeGuard('PAYMENT_CREATE',config)},async req=>{
  const expenseId=id(req.params),b=parse(z.object({expectedUpdatedAt:timestamp,reason:z.string().trim().min(3).max(500),confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM expenses WHERE company_id=${user.companyId}::uuid AND id=${expenseId}::uuid FOR UPDATE`;const old=await tx.expense.findFirst({where:{companyId:user.companyId,id:expenseId}});if(!old)throw new CommandError(404,'Không tìm thấy khoản chi.');if(old.status==='VOIDED')return {message:'Khoản chi đã được hủy.'};unchanged(old,b.expectedUpdatedAt);
   if(old.status==='POSTED'){approvePermission(user);await tx.$queryRaw`SELECT id FROM cash_accounts WHERE company_id=${user.companyId}::uuid AND id=${old.cashAccountId}::uuid FOR UPDATE`;const before=await tx.cashAccount.findFirstOrThrow({where:{companyId:user.companyId,id:old.cashAccountId}});if(old.direction==='IN'&&before.balance.lt(old.amount))throw new CommandError(409,'Số dư không đủ để hủy khoản thu.');const a=await tx.cashAccount.update({where:{id:old.cashAccountId},data:{balance:old.direction==='OUT'?{increment:old.amount}:{decrement:old.amount}}});await tx.cashEntry.create({data:{companyId:user.companyId,cashAccountId:a.id,entryCode:await code(tx,user.companyId,'CASH_ENTRY','CASH'),entryDate:new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})),kind:'EXPENSE_REVERSAL',direction:old.direction==='OUT'?'IN':'OUT',currency:old.currency,amount:old.amount,balanceAfter:a.balance,sourceId:old.id,description:'Hủy '+old.expenseCode+' · '+b.reason}});}
   const item=await tx.expense.update({where:{id:old.id},data:{status:'VOIDED',voidReason:b.reason}});await audit(tx,user,'EXPENSE_VOID','Expense',item.id,old,item,'Hủy khoản chi; giữ lịch sử và hoàn lại số dư nếu đã ghi nhận');return {message:'Đã hủy khoản chi'+(old.status==='POSTED'?' và hoàn lại số dư.':'.')};});
 });
 app.get('/api/v1/expenses/:id/document',{preHandler:requirePermission('PAYMENT_VIEW')},async(req,reply)=>{
  const user=req.auth!,e=await prisma.expense.findFirst({where:{companyId:user.companyId,id:id(req.params)}});if(!e?.documentId)throw new CommandError(404,'Không có chứng từ.');const doc=await prisma.document.findFirst({where:{id:e.documentId,companyId:user.companyId,entityType:'Expense',entityId:e.id,documentType:'EXPENSE_EVIDENCE',status:'ACTIVE'},include:{attachment:true}});if(!doc||doc.attachment.companyId!==user.companyId)throw new CommandError(404,'Không có chứng từ.');const ext=doc.attachment.storedFilename.split('.').at(-1);if(!['pdf','png','jpg'].includes(ext??''))throw new CommandError(409,'Chứng từ không hợp lệ.');return reply.type(doc.attachment.mimeType!).header('Content-Disposition',`inline; filename="${e.expenseCode}.${ext}"`).send(await checkedFile(doc.attachment,`expenses/${user.companyId}/${doc.attachment.id}.${ext}`,5*1024*1024));
 });
}
