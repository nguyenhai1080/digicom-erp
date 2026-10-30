import assert from 'node:assert/strict';
import {readFile,writeFile,unlink,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyPreparedDocumentStore} from './prepare-document-store.mjs';
const root=await realpath('artifacts/dgc-migration/20261030/document-store'),pin='77b26cd95b1f364dc056ac2b47d7aa379910378261cf886b70b8c40a3f063850';
const manifestBytes=await readFile(resolve(root,'manifest.json')),manifest=JSON.parse(manifestBytes);let n=0;
const before=await verifyPreparedDocumentStore(root,pin);assert.equal(before.files,429);n++;
await assert.rejects(()=>verifyPreparedDocumentStore(root,'0'.repeat(64)),/Unpinned/);n++;
const marker=resolve(root,'guard-unlisted.txt');await writeFile(marker,'Synthetic unlisted file guard',{flag:'wx',mode:0o600});
try{await assert.rejects(()=>verifyPreparedDocumentStore(root,pin),/Unexpected private document store entries/);n++;}finally{await unlink(marker);}
// Only the newly prepared copy is changed; original evidence is never written.
const blob=resolve(root,manifest.files[0].relativePath),bytes=await readFile(blob),changed=Buffer.from(bytes);changed[32]^=1;
try{await writeFile(blob,changed);await assert.rejects(()=>verifyPreparedDocumentStore(root,pin),/Prepared document bytes differ/);n++;}finally{await writeFile(blob,bytes);}
const after=await verifyPreparedDocumentStore(root,pin);assert.deepEqual(after,before);n++;assert.deepEqual(await readFile(resolve(root,'manifest.json')),manifestBytes);n++;
await writeFile('artifacts/dgc-migration/20261030/document-store-guard-proof.json',JSON.stringify({assertions:n,manifestHash:pin,files:after.files,wrongPinRejected:true,unlistedFileRejected:true,sameRootSamePinByteTamperRejected:true,restoredBytesReverified:true,originalEvidenceWritten:false,hostChanged:false,financialRowsCommitted:0},null,2)+'\n',{mode:0o600});
console.log(`Prepared document store: ${n} assertions passed; pin/extra-file/fresh-byte guards, complete restored readback, originals untouched`);
