import {readFile,writeFile,mkdir,realpath,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {digest} from './core.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {verifyReconFiles} from './recon-files.mjs';
import {verifyReferenceFiles} from './reference-files.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(base,path)=>{const rel=relative(base,path);return !!rel&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../')&&!isAbsolute(rel);};

export async function verifyPreparedDocumentStore(root,expectedManifestHash){
 const base=await realpath(root),manifest=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8')),{manifestHash,...body}=manifest;
 if(!/^[a-f0-9]{64}$/.test(expectedManifestHash??'')||manifestHash!==expectedManifestHash||digest(body)!==manifestHash||manifest.format!=='dgc-private-document-store-v1'||manifest.financialAdmission!==false||manifest.hostUploadAllowed!==false||manifest.financialCommitAllowed!==false||manifest.acceptance!==false||manifest.allCopiedBytesReadBack!==true)throw Error('Unpinned private document store');
 const top=(await readdir(base)).sort();if(JSON.stringify(top)!==JSON.stringify(['blobs','manifest.json'])||(await lstat(resolve(base,'blobs'))).isSymbolicLink()||(await lstat(resolve(base,'manifest.json'))).isSymbolicLink())throw Error('Unexpected private document store entries');
 const files=new Set(),blobs=new Map();let references=0;
 for(const file of manifest.files){
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(file.fileId??'')||files.has(file.fileId)||!/^[a-f0-9]{64}$/.test(file.sha256??'')||file.relativePath!=='blobs/'+file.sha256+'.pdf'||!Number.isSafeInteger(file.size)||file.size<=0||!Array.isArray(file.sourceBindings)||!file.sourceBindings.length)throw Error('Invalid prepared file metadata');
  files.add(file.fileId);const old=blobs.get(file.sha256);if(old&&old.size!==file.size)throw Error('Prepared blob size conflict');blobs.set(file.sha256,file);
  for(const binding of file.sourceBindings){if(!['invoice','recon','reference'].includes(binding.kind)||binding.manifestHash!==manifest.sourceManifestHashes[binding.kind]||!Array.isArray(binding.sources)||!binding.sources.length)throw Error('Prepared source binding differs');references++;}
 }
 if(JSON.stringify((await readdir(resolve(base,'blobs'))).sort())!==JSON.stringify([...blobs.keys()].map(h=>h+'.pdf').sort()))throw Error('Unlisted or missing prepared blobs');
 let bytes=0;for(const file of blobs.values()){const path=resolve(base,file.relativePath);if((await lstat(path)).isSymbolicLink())throw Error('Prepared blob cannot be a symbolic link');const data=await readFile(path);if(data.length!==file.size||data.subarray(0,5).toString()!=='%PDF-'||sha(data)!==file.sha256)throw Error('Prepared document bytes differ');bytes+=data.length;}
 if(manifest.uniqueFiles!==files.size||manifest.uniqueBlobs!==blobs.size||manifest.bytes!==bytes||manifest.sourceFileReferences!==references)throw Error('Prepared document totals differ');
 return {verified:true,manifestHash,snapshotHash:manifest.snapshotHash,files:files.size,blobs:blobs.size,bytes,missingOriginalReconFiles:manifest.missingOriginalReconFiles.length,financialAdmission:false,hostUploadAllowed:false};
}

// Local preparation only. Source/PDF custody does not admit a financial row,
// approve a document, recover missing originals or authorize a host upload.
export async function prepareDocumentStore({snapshot,invoice,recon,reference,output}){
 const inputHash=()=>digest({snapshot,invoice,recon,reference,output}),validatedInputHash=inputHash();
 const artifacts=await realpath('artifacts'),target=resolve(output),parent=await realpath(dirname(target));
 if(!inside(artifacts,target)||!inside(artifacts,parent)||resolve(parent,target.split(/[\\/]/).at(-1))!==target)throw Error('A new private artifacts output directory is required');
 const checks={invoice:await verifyInvoiceFiles(snapshot,invoice.manifest,invoice.root),recon:await verifyReconFiles(snapshot,recon.manifest,recon.root,recon.manifest.manifestHash),reference:await verifyReferenceFiles(snapshot,reference.manifest,reference.root,reference.manifest.manifestHash)};
 // mkdir intentionally refuses existing outputs; never adopt/overwrite a store.
 await mkdir(target);await mkdir(resolve(target,'blobs'));
 const files=new Map(),blobs=new Map();let references=0;
 for(const [kind,input] of Object.entries({invoice,recon,reference}))for(const file of input.manifest.files){
  const bytes=await readFile(resolve(input.root,file.relativePath));
  if(bytes.length!==file.size||bytes.subarray(0,5).toString()!=='%PDF-'||sha(bytes)!==file.sha256)throw Error('Document changed after source verification');
  const old=files.get(file.fileId);if(old&&(old.sha256!==file.sha256||old.size!==file.size))throw Error('One source file ID has conflicting captured bytes');
  const relativePath='blobs/'+file.sha256+'.pdf',entry=old??{fileId:file.fileId,sha256:file.sha256,size:file.size,relativePath,sourceBindings:[]};
  const sources=kind==='invoice'?[{sheet:'48_INVOICE_HEADER',sheetId:snapshot.tables['48_INVOICE_HEADER'].sheetId,sourceRow:file.sourceRow,legacyId:file.legacyId,rowHash:file.rowHash}]:kind==='recon'?file.sourceHeaders:file.sources;
  entry.sourceBindings.push({kind,manifestHash:input.manifest.manifestHash,sources});files.set(file.fileId,entry);references++;
  if(!blobs.has(file.sha256)){await writeFile(resolve(target,relativePath),bytes,{flag:'wx',mode:0o600});blobs.set(file.sha256,{sha256:file.sha256,size:file.size,relativePath});}
 }
 // Independently read every destination blob before publishing the manifest.
 for(const blob of blobs.values()){const bytes=await readFile(resolve(target,blob.relativePath));if(bytes.length!==blob.size||sha(bytes)!==blob.sha256)throw Error('Prepared document blob failed readback');}
 const body={format:'dgc-private-document-store-v1',snapshotHash:snapshot.snapshotHash,sourceManifestHashes:Object.fromEntries(Object.entries({invoice,recon,reference}).map(([k,v])=>[k,v.manifest.manifestHash])),files:[...files.values()].sort((a,b)=>a.fileId<b.fileId?-1:a.fileId>b.fileId?1:0),sourceFileReferences:references,uniqueFiles:files.size,uniqueBlobs:blobs.size,bytes:[...blobs.values()].reduce((sum,b)=>sum+b.size,0),missingOriginalReconFiles:checks.recon.missingFiles,unresolvedReconHeaders:checks.recon.unresolvedHeaders,missingReferenceFiles:checks.reference.missingFiles,allCopiedBytesReadBack:true,pdfSemanticsVerified:false,signedStatusVerified:false,financialAdmission:false,originalBytesRecovered:false,sourceValuesChanged:false,hostUploadAllowed:false,financialCommitAllowed:false,acceptance:false};
 if(inputHash()!==validatedInputHash)throw Error('Document preparation inputs changed');
 const manifest={...body,manifestHash:digest(body)};await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]==='--verify'){console.log(JSON.stringify(await verifyPreparedDocumentStore(process.argv[3],process.argv[4])));process.exit(0);}
 const base='artifacts/dgc-migration/',json=async p=>JSON.parse(await readFile(base+p,'utf8'));
 const manifest=await prepareDocumentStore({snapshot:await json('20261019/prepared/snapshot.json'),invoice:{manifest:await json('20261020/source-invoices/all-invoices-manifest.json'),root:resolve(base+'20261020/source-invoices')},recon:{manifest:await json('20261021/source-recons/recon-files-manifest.json'),root:resolve(base+'20261021/source-recons')},reference:{manifest:await json('20261022/source-references/reference-files-manifest.json'),root:resolve(base+'20261022/source-references')},output:process.argv[2]});
 console.log(JSON.stringify({manifestHash:manifest.manifestHash,sourceFileReferences:manifest.sourceFileReferences,uniqueFiles:manifest.uniqueFiles,uniqueBlobs:manifest.uniqueBlobs,bytes:manifest.bytes,missingOriginalReconFiles:manifest.missingOriginalReconFiles.length,missingReferenceFiles:manifest.missingReferenceFiles.length,allCopiedBytesReadBack:true,hostUploaded:false,financialRowsCommitted:0}));
}
