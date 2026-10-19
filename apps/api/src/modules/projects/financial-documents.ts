import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {PDFDocument,degrees,type PDFImage,type PDFPage} from 'pdf-lib';
import {z} from 'zod';
import {Prisma} from '@erp/db';
import {code,CommandError} from './commands.js';
import type {Identity} from '../auth/access.js';
export const placementSchema=z.object({page:z.number().int().min(1).max(12),x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(.04).max(.6)}).strict();
export type Placement=z.infer<typeof placementSchema>;
export const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function storageRoot(){const p=process.env.STORAGE_ROOT??'./storage';if((process.env.STORAGE_PROVIDER&&process.env.STORAGE_PROVIDER!=='local')||(process.env.NODE_ENV==='production'&&!isAbsolute(p)))throw new CommandError(503,'Kho tài liệu chưa được cấu hình.');return resolve(p);}
export async function asset(tx:Prisma.TransactionClient,companyId:string,kind:string,id?:string){
 const found=await tx.document.findMany({where:{companyId,entityType:'CompanyAsset',entityId:companyId,documentType:kind,status:'ACTIVE'},include:{attachment:true},take:2});
 if(found.length!==1||id&&found[0].id!==id)throw new CommandError(409,kind==='SIGNING_COMPOSITE'?'Cần ảnh dấu/chữ ký/chức danh đang hiệu lực trong Tài sản công ty.':'Tài sản đã thay đổi hoặc chưa có. Tải lại bản xem trước.');
 const d=found[0],ext=d.attachment.storedFilename.split('.').at(-1)!,folder=kind==='INVOICE_TEMPLATE'?'invoice-templates':'company-assets';
 if(d.attachment.companyId!==companyId||!['png','jpg','xlsx','xlsm'].includes(ext))throw new CommandError(409,'Định dạng tài sản không hợp lệ.');
 const bytes=await checkedFile(d.attachment,`${folder}/${companyId}/${d.attachment.id}.${ext}`,5*1024*1024);
 return {document:d,bytes};
}
export async function checkedFile(a:{companyId:string;storageProvider:string;storagePath:string;fileSize:bigint|null;checksumSha256:string|null},expected:string,max=16*1024*1024){
 if(a.storageProvider!=='local'||a.storagePath!==expected)throw new CommandError(409,'Đường dẫn tài liệu không hợp lệ.');
 let b:Buffer;try{const path=resolve(storageRoot(),expected),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max||BigInt(s.size)!==a.fileSize)throw new Error();b=await readFile(path);}catch{throw new CommandError(409,'Không truy cập được tài liệu trong kho.');}
 if(sha(b)!==a.checksumSha256||BigInt(b.length)!==a.fileSize)throw new CommandError(409,'Tài liệu trong kho đã thay đổi.');return b;
}
export function visualBox(page:PDFPage){const b=page.getCropBox(),r=((page.getRotation().angle%360)+360)%360;if(![0,90,180,270].includes(r)||b.width<=0||b.height<=0)throw new CommandError(422,'Khổ hoặc hướng trang PDF không hợp lệ.');return {...b,rotation:r,visualWidth:r%180?b.height:b.width,visualHeight:r%180?b.width:b.height};}
// Invert the page's display rotation and crop offset. Coordinates originate at
// the top left of the exact Poppler crop-box preview, not an assumed A4 page.
export function drawPlacement(page:PDFPage,image:PDFImage,p:Placement){
 const b=visualBox(page),w=p.width*b.visualWidth,h=w*image.height/image.width,X=p.x*b.visualWidth,Y=b.visualHeight-p.y*b.visualHeight-h;
 if(X+w>b.visualWidth+.001||Y<-.001)throw new CommandError(400,'Ảnh dấu/chữ ký nằm ngoài trang. Điều chỉnh vị trí hoặc kích thước.');
 const points=b.rotation===0?[X,Y]:b.rotation===90?[b.width-Y,X]:b.rotation===180?[b.width-X,b.height-Y]:[Y,b.height-X];
 page.drawImage(image,{x:b.x+points[0],y:b.y+points[1],width:w,height:h,rotate:degrees(b.rotation)});
}
export async function image(doc:PDFDocument,bytes:Buffer,mime:string|null){return mime==='image/png'?doc.embedPng(bytes):mime==='image/jpeg'?doc.embedJpg(bytes):Promise.reject(new CommandError(409,'Ảnh dấu phải là PNG/JPEG.'));}
export async function stampPdf(source:Buffer,bytes:Buffer,mime:string|null,p:Placement,allPages=false){
 let doc:PDFDocument;try{doc=await PDFDocument.load(source,{updateMetadata:false});}catch{throw new CommandError(422,'Không thể chèn dấu vào PDF bị lỗi hoặc khóa.');}
 if(doc.getPageCount()>12||p.page>doc.getPageCount())throw new CommandError(400,'Trang chèn dấu không tồn tại.');
 const picture=await image(doc,bytes,mime);
 for(const page of allPages?doc.getPages():[doc.getPage(p.page-1)])drawPlacement(page,picture,p);
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
export async function persistPdf(tx:Prisma.TransactionClient,user:Identity,entityType:string,entityId:string,type:'RECON_SIGNED'|'INVOICE'|'PAYMENT_SWIFT'|'EXPENSE_EVIDENCE',filename:string,bytes:Buffer,version:number,rollback:string[]){
 if(bytes.length>16*1024*1024)throw new CommandError(422,'PDF kết quả vượt giới hạn lưu trữ.');
 const id=randomUUID(),folder=type==='RECON_SIGNED'?'signed-recon':type==='PAYMENT_SWIFT'?'payments':type==='EXPENSE_EVIDENCE'?'expenses':'invoices',relative=`${folder}/${user.companyId}/${id}.pdf`,path=resolve(storageRoot(),relative),temp=path+'.pending';
 await mkdir(resolve(storageRoot(),folder,user.companyId),{recursive:true,mode:0o700});rollback.push(temp);
 const handle=await open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temp,path);rollback.push(path);
 const attachment=await tx.attachment.create({data:{id,companyId:user.companyId,originalFilename:filename,storedFilename:id+'.pdf',storageProvider:'local',storagePath:relative,mimeType:'application/pdf',fileSize:BigInt(bytes.length),checksumSha256:sha(bytes),uploadedById:user.userId}});
 return tx.document.create({data:{companyId:user.companyId,documentCode:await code(tx,user.companyId,type,type==='INVOICE'?'INV-PDF':type==='PAYMENT_SWIFT'?'SWIFT':type==='EXPENSE_EVIDENCE'?'EXP-DOC':'RSIGN'),documentType:type,entityType,entityId,attachmentId:attachment.id,versionNo:version,createdById:user.userId}});
}
export async function rollbackFiles(paths:string[]){for(const path of paths)try{await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
export async function derivedBytes(tx:Prisma.TransactionClient,companyId:string,documentId:string,type:'RECON_SIGNED'|'INVOICE'){
 const d=await tx.document.findFirst({where:{id:documentId,companyId,documentType:type},include:{attachment:true}});if(!d||d.attachment.companyId!==companyId)throw new CommandError(404,'Không tìm thấy tài liệu của công ty.');
 const folder=type==='RECON_SIGNED'?'signed-recon':'invoices';return {document:d,bytes:await checkedFile(d.attachment,`${folder}/${companyId}/${d.attachment.id}.pdf`)};
}
export async function persistWorkbook(tx:Prisma.TransactionClient,user:Identity,invoiceId:string,bytes:Buffer,filename:string,ext:'xlsx'|'xlsm',rollback:string[]){
 const id=randomUUID(),relative=`invoices/${user.companyId}/${id}.${ext}`,path=resolve(storageRoot(),relative),temp=path+'.pending';
 if(bytes.length>5*1024*1024)throw new CommandError(422,'Workbook Invoice vượt giới hạn.');
 await mkdir(resolve(storageRoot(),'invoices',user.companyId),{recursive:true,mode:0o700});rollback.push(temp);const h=await open(temp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}await rename(temp,path);rollback.push(path);
 const a=await tx.attachment.create({data:{id,companyId:user.companyId,originalFilename:filename,storedFilename:id+'.'+ext,storageProvider:'local',storagePath:relative,mimeType:ext==='xlsm'?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileSize:BigInt(bytes.length),checksumSha256:sha(bytes),uploadedById:user.userId}});
 return tx.document.create({data:{companyId:user.companyId,documentCode:await code(tx,user.companyId,'INVOICE_WORKBOOK','INV-XLS'),documentType:'INVOICE_WORKBOOK',entityType:'Invoice',entityId:invoiceId,attachmentId:a.id,createdById:user.userId}});
}

export async function persistPaymentImage(tx:Prisma.TransactionClient,user:Identity,paymentId:string,filename:string,bytes:Buffer,ext:'png'|'jpg',rollback:string[],expense=false){
 const folder=expense?'expenses':'payments',id=randomUUID(),relative=`${folder}/${user.companyId}/${id}.${ext}`,path=resolve(storageRoot(),relative),temp=path+'.pending';
 await mkdir(resolve(storageRoot(),folder,user.companyId),{recursive:true,mode:0o700});rollback.push(temp);
 const h=await open(temp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}await rename(temp,path);rollback.push(path);
 const a=await tx.attachment.create({data:{id,companyId:user.companyId,originalFilename:filename,storedFilename:id+'.'+ext,storageProvider:'local',storagePath:relative,mimeType:ext==='png'?'image/png':'image/jpeg',fileSize:BigInt(bytes.length),checksumSha256:sha(bytes),uploadedById:user.userId}});
 return tx.document.create({data:{companyId:user.companyId,documentCode:await code(tx,user.companyId,expense?'EXPENSE_EVIDENCE':'PAYMENT_SWIFT',expense?'EXP-DOC':'SWIFT'),documentType:expense?'EXPENSE_EVIDENCE':'PAYMENT_SWIFT',entityType:expense?'Expense':'InvoicePayment',entityId:paymentId,attachmentId:a.id,createdById:user.userId}});
}
