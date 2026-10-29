import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {signedPackageCopySourceInputs} from './signed-package-copy-source-inputs.mjs';
import {verifySignedPackageCopyFiles} from './signed-package-copies.mjs';
const o=await signedPackageCopySourceInputs(),root=await mkdtemp(join(tmpdir(),'dgc-signed-copy-tamper-')),shadow={...o,ocrRoot:root};let n=0;
try{
 const files=[o.observations.invoice.visualRender,...o.ocrManifest.toolEvidence,...o.ocrManifest.pages.flatMap(p=>[p.visualRender,p.ocrRender,...p.passes.flatMap(p=>[p.text,p.tsv])])];
 for(const name of new Set(files.map(f=>f.relativePath))){if(!/^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe evidence fixture filename');await copyFile(join(o.ocrRoot,name),join(root,name));}
 const first=await verifySignedPackageCopyFiles(shadow);assert.equal(first.custody.missingFiles.length,5);n++;assert.equal(first.authority.acceptance,false);n++;
 const name=o.observations.invoice.visualRender.relativePath,original=await readFile(join(root,name)),tampered=Buffer.from(original);tampered[tampered.length-1]^=1;await writeFile(join(root,name),tampered);
 // Identical options/root/manifest/pins after a successful read: the next call
 // must observe changed bytes, rather than reuse a previous verified result.
 await assert.rejects(()=>verifySignedPackageCopyFiles(shadow),/Signed copy evidence bytes differ/);n++;
 await writeFile(join(root,name),original);const restored=await verifySignedPackageCopyFiles(shadow);assert.equal(restored.authority.reviewHash,first.authority.reviewHash);n++;assert.deepEqual(restored.custody.missingFiles,first.custody.missingFiles);n++;
 const out='artifacts/dgc-migration/20261029/signed-package-copies/';await mkdir(out,{recursive:true});await writeFile(out+'byte-guard-proof.json',JSON.stringify({format:'dgc-signed-copy-byte-guard-proof-v1',assertions:n,snapshotHash:o.snapshot.snapshotHash,positiveTamperRestore:true,sameInputPins:true,originalsChanged:false,originalMissingFiles:5,financialWrites:false,remoteChanged:false},null,2)+'\n',{mode:0o600});console.log(`Signed copy fresh-byte guard: ${n} assertions passed; same pins/root, tamper rejected, restored bytes reread; originals untouched`);
}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-signed-copy-tamper-'))throw Error('Unsafe evidence fixture cleanup');await rm(root,{recursive:true,force:true});}
