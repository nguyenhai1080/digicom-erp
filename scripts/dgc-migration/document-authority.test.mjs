import assert from 'node:assert/strict';
import {ownerRenderFilename} from './document-authority.mjs';
let n=0;const eq=(a,b)=>{assert.equal(a,b);n++;};
for(const value of ['package33-invoice.png','artifacts/dgc-migration/20261025/cutover/package33-invoice.png','artifacts\\dgc-migration\\20261025\\cutover\\package33-invoice.png','D:\\Projects\\DGC-ERP\\artifacts\\package33-invoice.png'])eq(ownerRenderFilename(value),'package33-invoice.png');
for(const value of [undefined,null,{},'', '.', '..', '/tmp/', 'D:\\temp\\', 'a b.png', 'bad\0.png', 'file.png?query']){assert.throws(()=>ownerRenderFilename(value),/Invalid owner render/);n++;}
console.log(`Owner render portability: ${n} assertions passed; Windows/POSIX evidence names and invalid references`);
