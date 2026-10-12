import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {reconSigningMode,prepareReconDocument} from '../dist/modules/projects/recon-signing.js';
const doc=await PDFDocument.create();doc.addPage();
const source=Buffer.from(await doc.save()),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(reconSigningMode(' digicom '),'EXTERNAL_DIGITAL');
for(const key of ['MOVITEL','VNATEL','OTHER'])assert.equal(reconSigningMode(key),'IMAGE_STAMP');
const png=await sharp({create:{width:20,height:10,channels:4,background:'#ff0000'}}).png().toBuffer(),signing={bytes:png,mime:'image/png',placement:{page:1,x:.55,y:.7,width:.28}};
const preserved=await prepareReconDocument('EXTERNAL_DIGITAL',source);
assert.equal(preserved,source);assert.equal(hash(preserved),hash(source));
// Stale clients sending stamp parameters cannot insert an image for DIGICOM.
assert.equal(hash(await prepareReconDocument('EXTERNAL_DIGITAL',source,signing)),hash(source));
await assert.rejects(prepareReconDocument('IMAGE_STAMP',source),e=>e.statusCode===400);
const stamped=await prepareReconDocument('IMAGE_STAMP',source,signing);
assert.notEqual(hash(stamped),hash(source));assert.equal((await PDFDocument.load(stamped)).getPageCount(),1);
console.log('PASS: DIGICOM exact-source PDF preservation; other partners retain required image signing.');
