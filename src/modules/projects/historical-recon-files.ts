import {createHash} from 'node:crypto';
import {lstat,realpath,open} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {z} from 'zod';
import {CommandError} from './commands.js';

const hex=/^[a-f0-9]{64}$/,fileId=/^[A-Za-z0-9_-]{20,200}$/;
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:unknown)=>JSON.stringify(sorted(v)),sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const address=z.object({sheet:z.literal('43_RECON_PDF_HEADER'),sheetId:z.number().int().nonnegative(),sourceRow:z.number().int().min(2),legacyId:z.string(),rowHash:z.string().regex(hex)}).strict();
const entry=z.object({fileId:z.string().regex(fileId),mimeType:z.literal('application/pdf'),relativePath:z.string(),size:z.number().int().positive().max(64*1024*1024),sha256:z.string().regex(hex),sourceHeaders:z.array(address).min(1).max(10000)}).passthrough();
const manifestSchema=z.object({format:z.literal('dgc-source-recon-files-v1'),snapshotHash:z.string().regex(hex),filePlanHash:z.string().regex(hex),manifestHash:z.string().regex(hex),complete:z.boolean(),postingAllowed:z.literal(false),acceptance:z.literal(false),pdfSemanticsVerified:z.literal(false),files:z.array(entry).max(10000)}).passthrough();
export type HistoricalPdfConfig={root:string;manifestHash:string;snapshotHash:string};
export type HistoricalDocumentBinding={snapshotHash:string;document:z.infer<typeof address>;fileId:string};
export function historicalReconPdfConfiguration(snapshotHash:string):HistoricalPdfConfig{
 const root=process.env.DGC_RECON_EVIDENCE_ROOT,manifestHash=process.env.DGC_RECON_EVIDENCE_MANIFEST_HASH;
 if(!root||!isAbsolute(root)||!hex.test(manifestHash??'')||!hex.test(snapshotHash))throw new CommandError(503,'Chưa cấu hình kho PDF đối soát nguồn riêng.');
 return {root,manifestHash:manifestHash!,snapshotHash};
}
// Files are bounded reads; paths, labels, URLs and timestamps from a manifest
// cannot select arbitrary files or turn byte custody into financial acceptance.
async function bytes(root:string,name:string,max:number){
 if(!isAbsolute(root)||(await lstat(root)).isSymbolicLink()||name.includes('/')||name.includes('\\')||name==='.'||name==='..')throw Error('Invalid evidence path');
 const base=await realpath(root),target=resolve(base,name),info=await lstat(target),rel=relative(base,await realpath(target));
 if(info.isSymbolicLink()||!info.isFile()||info.size>max||!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Evidence path escapes root');
 const handle=await open(target,'r');try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size!==info.size||stat.ino!==info.ino||stat.dev!==info.dev)throw Error('Evidence changed before read');
  const data=Buffer.alloc(info.size+1);let count=0;
  while(count<data.length){const result=await handle.read(data,count,data.length-count,null);if(!result.bytesRead)break;count+=result.bytesRead;}
  if(count!==info.size||(await handle.stat()).size!==info.size)throw Error('Evidence changed during read');return data.subarray(0,count);
 }finally{await handle.close();}
}
export async function readHistoricalReconPdf(config:HistoricalPdfConfig,binding:HistoricalDocumentBinding){
 try{
  if(!hex.test(config.manifestHash)||!hex.test(config.snapshotHash)||binding.snapshotHash!==config.snapshotHash||!fileId.test(binding.fileId)||!address.safeParse(binding.document).success)throw Error('Invalid pinned binding');
  const manifest=manifestSchema.parse(JSON.parse((await bytes(config.root,'recon-files-manifest.json',16*1024*1024)).toString('utf8'))),{manifestHash,...body}=manifest;
  if(manifestHash!==config.manifestHash||sha(canonical(body))!==manifestHash||manifest.snapshotHash!==config.snapshotHash)throw Error('Pinned manifest differs');
  const seenIds=new Set<string>(),seenRows=new Set<string>();
  for(const file of manifest.files){
   if(seenIds.has(file.fileId)||file.relativePath!==file.fileId+'.pdf')throw Error('Invalid file identity');seenIds.add(file.fileId);
   for(const h of file.sourceHeaders){const k=h.sheetId+'|'+h.sourceRow;if(seenRows.has(k))throw Error('Duplicate document binding');seenRows.add(k);}
  }
  const file=manifest.files.find(f=>f.fileId===binding.fileId);
  if(!file)throw new CommandError(404,'Chưa có PDF gốc cho tài liệu nguồn này trong kho evidence.');
  if(!file.sourceHeaders.some(h=>canonical(h)===canonical(binding.document)))throw Error('Document source row differs');
  const data=await bytes(config.root,file.relativePath,64*1024*1024);
  if(data.length!==file.size||data.subarray(0,5).toString()!=='%PDF-'||sha(data)!==file.sha256)throw Error('Original PDF bytes differ');
  return {bytes:data,metadata:{readOnly:true,bytesVerified:true,manifestHash,snapshotHash:manifest.snapshotHash,sourceDocument:binding.document,size:file.size,sha256:file.sha256,manifestComplete:manifest.complete,pdfSemanticsVerified:false,signedStatusVerified:false,operationalUseAllowed:false,postingAllowed:false,acceptance:false,historicalCashPosting:false}};
 }catch(e){if(e instanceof CommandError)throw e;throw new CommandError(409,'Kho PDF đối soát nguồn không khớp bằng chứng đã ghim hoặc không đọc được.');}
}
