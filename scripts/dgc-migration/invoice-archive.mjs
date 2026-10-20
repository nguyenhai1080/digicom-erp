import {readFile,writeFile,mkdir,realpath,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest,verifySnapshot,text} from './core.mjs';
import {verifyInvoiceHistoryPlan} from './invoice-history.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(base,path)=>{const rel=relative(base,path);return !!rel&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel);};
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const seal=body=>({...body,archiveHash:digest(body)});
async function physicalTarget(path){
 let existing=resolve(path);
 for(;;){try{return resolve(await realpath(existing),relative(existing,resolve(path)));}catch(e){if(e.code!=='ENOENT')throw e;existing=resolve(existing,'..');}}
}
function expectedArchive(snapshot,plan,manifest,decisions){
 verifySnapshot(snapshot);verifyInvoiceHistoryPlan(plan,snapshot,decisions);
 if(manifest?.format!=='dgc-source-invoice-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.acceptance!==false)throw Error('Wrong source file manifest');
 const {manifestHash,...body}=manifest;if(manifestHash!==digest(body))throw Error('Source file manifest checksum mismatch');
 const payloads=new Map();
 const entries=plan.entries.filter(e=>e.disposition==='PRESERVE_HISTORY_ONLY').map(e=>{
  const source=e.source,archiveId=digest({snapshotHash:snapshot.snapshotHash,source});
  const files=manifest.files.filter(f=>f.sourceRow===source.sourceRow&&f.rowHash===source.rowHash&&f.legacyId===source.legacyId);
  if(files.length!==1)throw Error('Archive source PDF must resolve exactly once');
  const f=files[0],payloadPath='records/'+archiveId+'.json';payloads.set(payloadPath,e);
  return {archiveId,source,invoiceNumber:text(e.capturedHeader.values.Invoice_Number),sourceStatus:e.sourceStatus,payloadPath,payloadHash:digest(e),pdf:{fileId:f.fileId,path:'pdf/'+f.sha256+'.pdf',size:f.size,sha256:f.sha256}};
 });
 const archive=seal({format:'dgc-invoice-source-archive-v1',snapshotHash:snapshot.snapshotHash,historyPlanHash:plan.planHash,sourceManifestHash:manifest.manifestHash,postingAllowed:false,operationalImportAllowed:false,recomputeAmounts:false,postHistoricalCash:false,acceptance:false,entries});
 return {archive,payloads};
}
async function safeRead(base,path){
 // No symlinks/junctions, including internal ones: archive copies must be standalone.
 const parts=path.split('/');let target=base;
 for(const part of parts){target=resolve(target,part);if(!inside(base,target)||(await lstat(target)).isSymbolicLink())throw Error('Archive path or symbolic link is invalid');}
 if(!inside(base,await realpath(target)))throw Error('Archive file escaped its directory');
 return readFile(target);
}
function validateIndex(archive,expectedHash){
 if(!/^[a-f0-9]{64}$/.test(expectedHash??'')||archive?.archiveHash!==expectedHash)throw Error('Archive digest differs from expected digest');
 const {archiveHash,...body}=archive;
 if(archiveHash!==digest(body)||archive.format!=='dgc-invoice-source-archive-v1'||archive.acceptance!==false||archive.postingAllowed!==false||archive.operationalImportAllowed!==false||archive.recomputeAmounts!==false||archive.postHistoricalCash!==false||!Array.isArray(archive.entries))throw Error('Invalid archive manifest or flags');
 const ids=new Set();
 for(const e of archive.entries){
  if(!/^[a-f0-9]{64}$/.test(e.archiveId)||ids.has(e.archiveId)||e.archiveId!==digest({snapshotHash:archive.snapshotHash,source:e.source})||!['SUPERSEDED','CANCELLED','CANCELED'].includes(text(e.sourceStatus).toUpperCase())||e.payloadPath!=='records/'+e.archiveId+'.json'||!/^[a-f0-9]{64}$/.test(e.payloadHash)||!/^[a-f0-9]{64}$/.test(e.pdf?.sha256)||e.pdf.path!=='pdf/'+e.pdf.sha256+'.pdf'||!Number.isSafeInteger(e.pdf.size)||e.pdf.size<=0)throw Error('Invalid archive record identity or paths');
  ids.add(e.archiveId);
 }
 return archive;
}
export async function inspectInvoiceArchive(root,expectedHash){
 const base=await realpath(root);
 if((await lstat(resolve(base,'archive.json'))).isSymbolicLink())throw Error('Archive manifest must not be a symbolic link');
 const archive=validateIndex(await json(resolve(base,'archive.json')),expectedHash);
 const expectedFiles=new Set(['archive.json','COMPLETE.json']);
 const complete=JSON.parse((await safeRead(base,'COMPLETE.json')).toString('utf8'));
 if(canonical(complete)!==canonical({archiveHash:archive.archiveHash,entries:archive.entries.length}))throw Error('Archive is incomplete');
 const payloads=new Map(),seenPdfs=new Set();let bytes=0;
 for(const e of archive.entries){
  expectedFiles.add(e.payloadPath);expectedFiles.add(e.pdf.path);
  const payload=JSON.parse((await safeRead(base,e.payloadPath)).toString('utf8'));
  if(digest(payload)!==e.payloadHash||canonical(payload.source)!==canonical(e.source)||payload.disposition!=='PRESERVE_HISTORY_ONLY'||payload.restoreRoute!=='IMMUTABLE_SOURCE_HISTORY'||payload.postingAllowed!==false||payload.postHistoricalCash!==false||payload.recomputeAmounts!==false||text(payload.capturedHeader?.values?.Invoice_Number)!==e.invoiceNumber||payload.sourceStatus!==e.sourceStatus)throw Error('Archived payload checksum or source mismatch');
  payloads.set(e.payloadPath,payload);
  const data=await safeRead(base,e.pdf.path);
  if(data.length!==e.pdf.size||data.subarray(0,5).toString()!=='%PDF-'||sha(data)!==e.pdf.sha256)throw Error('Archived PDF byte checksum mismatch');
  if(!seenPdfs.has(e.pdf.path)){bytes+=data.length;seenPdfs.add(e.pdf.path);}
 }
 const found=[];
 async function walk(dir,prefix=''){for(const f of await readdir(dir,{withFileTypes:true})){const path=prefix+f.name;if(f.isSymbolicLink())throw Error('Archive contains a symbolic link');if(f.isDirectory()){if(!['records','pdf'].includes(path))throw Error('Unexpected archive directory');await walk(resolve(dir,f.name),path+'/');}else found.push(path);}}
 await walk(base);
 if(found.length!==expectedFiles.size||found.some(f=>!expectedFiles.has(f)))throw Error('Archive contains unexpected or missing files');
 return {archive,payloads,files:seenPdfs.size,bytes};
}
export async function verifyInvoiceArchive({snapshot,plan,manifest,decisions,sourceRoot,root}){
 await verifyInvoiceFiles(snapshot,manifest,sourceRoot);
 const expected=expectedArchive(snapshot,plan,manifest,decisions),actual=await inspectInvoiceArchive(root,expected.archive.archiveHash);
 if(canonical(actual.archive)!==canonical(expected.archive)||[...expected.payloads].some(([path,payload])=>canonical(actual.payloads.get(path))!==canonical(payload)))throw Error('Archive differs from verified source and history plan');
 return {verified:true,archiveHash:actual.archive.archiveHash,entries:actual.archive.entries.length,files:actual.files,bytes:actual.bytes,postingAllowed:false,acceptance:false};
}
export async function createInvoiceArchive(options){
 const {snapshot,plan,manifest,decisions,sourceRoot,root}=options;
 await verifyInvoiceFiles(snapshot,manifest,sourceRoot);
 const expected=expectedArchive(snapshot,plan,manifest,decisions),target=resolve(root),sourceBase=await realpath(sourceRoot),planned=await physicalTarget(target);
 // Refuse overlap so a target never changes source evidence or nests in it.
 if(planned===sourceBase||inside(sourceBase,planned)||inside(planned,sourceBase))throw Error('Archive and source directories must be separate');
 await mkdir(resolve(target,'..'),{recursive:true});
 const parent=await realpath(resolve(target,'..')),destination=resolve(parent,target.split(/[\\/]/).at(-1));
 if(destination===sourceBase||inside(sourceBase,destination)||inside(destination,sourceBase))throw Error('Archive and source directories must be separate');
 try{await mkdir(destination);}catch(e){if(e.code!=='EEXIST')throw e;
  if((await lstat(destination)).isSymbolicLink())throw Error('Archive root must not be a symbolic link');
  return {...await verifyInvoiceArchive({...options,root:destination}),replayed:true};
 }
 // Never overwrite or clean a failed destination: no COMPLETE marker means quarantine.
 await mkdir(resolve(destination,'records'));await mkdir(resolve(destination,'pdf'));
 for(const [path,payload] of expected.payloads)await writeFile(resolve(destination,path),JSON.stringify(payload,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
 const copied=new Set();
 for(const e of expected.archive.entries){if(copied.has(e.pdf.path))continue;copied.add(e.pdf.path);
  const data=await readFile(resolve(sourceBase,e.pdf.fileId+'.pdf'));
  if(data.length!==e.pdf.size||sha(data)!==e.pdf.sha256)throw Error('Source PDF changed while copying archive');
  await writeFile(resolve(destination,e.pdf.path),data,{mode:0o600,flag:'wx'});
 }
 await writeFile(resolve(destination,'archive.json'),JSON.stringify(expected.archive,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
 await writeFile(resolve(destination,'COMPLETE.json'),JSON.stringify({archiveHash:expected.archive.archiveHash,entries:expected.archive.entries.length}),{encoding:'utf8',mode:0o600,flag:'wx'});
 return {...await verifyInvoiceArchive({...options,root:destination}),replayed:false};
}
export async function listInvoiceArchive(root,expectedHash,{invoiceNumber='',page=1}={}){
 if(typeof invoiceNumber!=='string'||invoiceNumber.length>200||!Number.isSafeInteger(page)||page<1)throw Error('Invalid archive search or page');
 const {archive}=await inspectInvoiceArchive(root,expectedHash),matches=archive.entries.filter(e=>!invoiceNumber||e.invoiceNumber===invoiceNumber.trim()),pages=Math.max(1,Math.ceil(matches.length/10)),current=Math.min(page,pages);
 return {archiveHash:archive.archiveHash,postingAllowed:false,acceptance:false,total:matches.length,page:current,pages,pageSize:10,items:matches.slice((current-1)*10,current*10)};
}
