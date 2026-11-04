import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonical,digest} from './core.mjs';
import {historicalInvoice4Authority} from '../../apps/api/dist/modules/projects/historical-invoice4-authority.js';
const d=JSON.parse(await readFile('artifacts/dgc-migration/20261030/legacy-source-file/invoice4-owner-decision.json','utf8')),p=d.proposal,source=p.sourceInvoice,pdf={fileId:p.originalPdf.fileId,sha256:p.originalPdf.sha256};
let n=0;const read=(decision=d,rows=p.sourceRows,s=source,f=pdf)=>historicalInvoice4Authority(canonical(decision),d.snapshotHash,s,rows,f);
assert.equal(read().acceptance,false);n++;
assert.equal(read().additionalReceivable,false);n++;
assert.equal(read().decisionHash,d.decisionHash);n++;
for(const change of ['money','date','snapshot']){const x=structuredClone(d);if(change==='snapshot')x.snapshotHash='0'.repeat(64);else x.proposal.ledger[change==='money'?'revenue':'date']=change==='money'?'18644.16':'2023-04-14';const {decisionHash,...body}=x;x.decisionHash=digest(body);assert.throws(()=>read(x),e=>e.statusCode===409);n++;}
for(const sheet of ['49_INVOICE_DETAIL','50_AR_AP','52_INVOICE_PAYMENT']){const rows=structuredClone(p.sourceRows);rows[sheet]=[];assert.throws(()=>read(d,rows),e=>e.statusCode===409);n++;}
assert.throws(()=>read(d,p.sourceRows,{...source,sourceRow:14}),e=>e.statusCode===409);n++;
assert.throws(()=>read(d,p.sourceRows,source,{...pdf,sha256:null}),e=>e.statusCode===409);n++;
console.log(`Invoice4 authority reader: ${n} assertions passed; exact owner envelope, complete source set, rehashed money/date/snapshot forgery rejected`);
