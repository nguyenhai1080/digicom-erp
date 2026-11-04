import {mkdir,open,readFile,rename,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {CommandError} from './commands.js';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function capturedUploadRoot(root:string,companyId:string,pin:string){
 if(!/^[0-9a-f-]{36}$/i.test(companyId)||!/^[a-f0-9]{64}$/.test(pin))throw new CommandError(400,'Sai định danh gói chuyển.');
 return resolve(root,'dgc-transfer',companyId,pin);
}
// Sequential, resumable byte transfer. This never writes financial records.
export async function receiveCapturedChunk(root:string,file:{sha256:string;size:number},offset:number,base64:string){
 if(!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<5||file.size>64*1024*1024||!Number.isSafeInteger(offset)||offset<0||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new CommandError(400,'Phần tệp không hợp lệ.');
 const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>1024*1024||offset+bytes.length>file.size)throw new CommandError(400,'Phần tệp vượt kích thước.');
 const blobs=resolve(root,'blobs'),part=resolve(root,file.sha256+'.part'),final=resolve(blobs,file.sha256+'.pdf');await mkdir(blobs,{recursive:true,mode:0o700});
 try{const old=await readFile(final);if(old.length===file.size&&sha(old)===file.sha256)return {received:file.size,complete:true};throw new CommandError(409,'Tệp đích đã có dữ liệu khác.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 let handle;try{handle=await open(part,'r+');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;if(offset!==0)throw new CommandError(409,'Cần gửi từ phần đầu của tệp.');handle=await open(part,'wx+',0o600);}
 let received:number;
 try{
  const existing=await handle.stat();if(existing.size<offset)throw new CommandError(409,'Thứ tự phần tệp chưa khớp.');
  if(existing.size>offset){const prior=Buffer.alloc(bytes.length);const read=await handle.read(prior,0,prior.length,offset);if(read.bytesRead!==bytes.length||!prior.equals(bytes))throw new CommandError(409,'Phần gửi lại khác dữ liệu đã nhận.');}
  else{let wrote=0;while(wrote<bytes.length){const result=await handle.write(bytes,wrote,bytes.length-wrote,offset+wrote);if(!result.bytesWritten)throw Error('Incomplete file write');wrote+=result.bytesWritten;}await handle.sync();}
  received=(await handle.stat()).size;
 }finally{await handle.close();}
 if(received===file.size){const full=await readFile(part);if(sha(full)!==file.sha256)throw new CommandError(409,'Tệp nhận chưa khớp checksum nguồn.');await rename(part,final);return {received,complete:true};}
 return {received,complete:false};
}
