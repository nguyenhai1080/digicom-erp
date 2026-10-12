import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {CommandError} from './commands.js';
import sharp from 'sharp';
import {parseReconIdentity} from './recon-identity.js';
let reading=false;
function run(command:string,args:string[],deadline:number){
 return new Promise<string>((resolveResult,reject)=>{
  const child=spawn(command,args,{shell:false,windowsHide:true,env:{...process.env,LC_ALL:'C',OMP_THREAD_LIMIT:'1'},stdio:['ignore','pipe','pipe']});let output=Buffer.alloc(0),overflow=false,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},Math.max(1,Math.min(30000,deadline-Date.now())));
  child.stdout.on('data',(data:Buffer)=>{if(output.length+data.length>1024*1024){overflow=true;child.kill('SIGKILL');}else output=Buffer.concat([output,data]);});child.stderr.resume();
  child.once('error',()=>{clearTimeout(timer);reject(new CommandError(503,'Bộ đọc PDF/OCR chưa sẵn sàng trên máy chủ.'));});
  child.once('close',code=>{clearTimeout(timer);if(timedOut)reject(new CommandError(422,'Đọc PDF quá thời gian. Chọn PDF ít trang hơn hoặc kiểm tra bản gốc.'));else if(overflow)reject(new CommandError(422,'Nội dung PDF vượt giới hạn đọc.'));else if(code!==0)reject(new CommandError(422,'Không đọc được PDF. Kiểm tra tệp bị lỗi, khóa mật khẩu hoặc nội dung scan.'));else resolveResult(output.toString('utf8'));});
 });
}
export async function readReconPdf(data:Buffer,forceOcr=false){
 if(reading)throw new CommandError(429,'Máy chủ đang đọc PDF khác. Vui lòng thử lại sau.');reading=true;let directory:string|undefined;
 try{
  const deadline=Date.now()+90000;directory=await mkdtemp(resolve(tmpdir(),'erp-recon-read-'));const file=resolve(directory,'source.pdf');await writeFile(file,data,{mode:0o600});
  const info=await run(process.env.PDFINFO_BIN??'pdfinfo',[file],deadline);const pages=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
  if(!Number.isInteger(pages)||pages<1||pages>12)throw new CommandError(422,'Bộ đọc hỗ trợ PDF từ 1 đến 12 trang.');
  if(/^Encrypted:\s*yes/im.test(info))throw new CommandError(422,'PDF có mật khẩu. Cần bản PDF không khóa.');
  // Inspect each page. A text cover must not hide later scanned pages.
  const result:{page:number;method:string;text:string;ocrRotation?:number}[]=[];
  for(let page=1;page<=pages;page++){
   const native=await run(process.env.PDFTOTEXT_BIN??'pdftotext',['-f',String(page),'-l',String(page),'-layout','-enc','UTF-8',file,'-'],deadline);
   let text=native.replace(/\f/g,'').trim(),method='PDF_TEXT',ocrRotation:number|undefined;
   const nativeIdentity=parseReconIdentity(text);
   if(forceOcr||text.replace(/\s/g,'').length<50||(!nativeIdentity.service&&!nativeIdentity.period)){
    const image=resolve(directory,'page');await run(process.env.PDFTOPPM_BIN??'pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-r','180','-scale-to','2200','-png',file,image],deadline);
    // Older GST scans contain a sideways image despite PDF /Rotate=0 and an
    // unusable hidden text layer. OSD rotates only the temporary OCR bitmap.
    try{const osd=await run(process.env.TESSERACT_BIN??'tesseract',[image+'.png','stdout','-l','osd','--psm','0'],deadline);const angle=Number(osd.match(/^Rotate:\s*(\d+)/m)?.[1]);if([90,180,270].includes(angle)){const rotated=resolve(directory,'oriented.png');await sharp(image+'.png',{limitInputPixels:5_000_000}).rotate(angle).png().toFile(rotated);ocrRotation=angle;text=(await run(process.env.TESSERACT_BIN??'tesseract',[rotated,'stdout','-l','eng','--psm','3'],deadline)).trim();}else text=(await run(process.env.TESSERACT_BIN??'tesseract',[image+'.png','stdout','-l','eng','--psm','3'],deadline)).trim();}
    catch{if(Date.now()>=deadline)throw new CommandError(422,'Đọc PDF quá thời gian.');text=(await run(process.env.TESSERACT_BIN??'tesseract',[image+'.png','stdout','-l','eng','--psm','3'],deadline)).trim();}
    method='OCR';
   }
   result.push({page,method,text,...(ocrRotation?{ocrRotation}:{})});if(result.reduce((n,p)=>n+p.text.length,0)>200000)throw new CommandError(422,'Nội dung PDF vượt giới hạn đọc.');
  }
  const text=result.map(p=>p.text).join('\n\f\n');if(text.trim().length<50)throw new CommandError(422,'Không đọc đủ chữ từ PDF. Cần kiểm tra chất lượng scan.');
  return {text,pages:result.map(({page,method,text,ocrRotation})=>({page,method,characters:text.length,...(ocrRotation?{ocrRotation}:{})})),engine:'poppler+tesseract-eng+osd',readerVersion:'0.6.46',forceOcr};
 }finally{try{if(directory)await rm(directory,{recursive:true,force:true});}finally{reading=false;}}
}

// Preview the original visual page, retaining Poppler's rotation/aspect ratio.
// Use the same bounded worker as OCR so scans cannot overload the API.
export async function previewReconPage(data:Buffer,page:number){
 if(reading)throw new CommandError(429,'Máy chủ đang đọc PDF khác. Vui lòng thử lại sau.');reading=true;let directory:string|undefined;
 try{
  const deadline=Date.now()+30000;directory=await mkdtemp(resolve(tmpdir(),'erp-recon-preview-'));const file=resolve(directory,'source.pdf');await writeFile(file,data,{mode:0o600});
  const info=await run(process.env.PDFINFO_BIN??'pdfinfo',[file],deadline),pages=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
  if(!Number.isInteger(pages)||pages<1||pages>12||page>pages)throw new CommandError(422,'Trang PDF không hợp lệ. Bộ đọc hỗ trợ tối đa 12 trang.');
  if(/^Encrypted:\s*yes/im.test(info))throw new CommandError(422,'PDF có mật khẩu. Cần bản PDF không khóa.');
  const image=resolve(directory,'page');await run(process.env.PDFTOPPM_BIN??'pdftoppm',['-cropbox','-f',String(page),'-l',String(page),'-singlefile','-scale-to','1600','-png',file,image],deadline);
  const bytes=await readFile(image+'.png');if(bytes.length>8*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new CommandError(422,'Không tạo được ảnh xem trước.');return bytes;
 }finally{try{if(directory)await rm(directory,{recursive:true,force:true});}finally{reading=false;}}
}
