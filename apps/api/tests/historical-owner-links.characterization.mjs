import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {envelope} from './historical-owner-links.fixture.mjs';
import {historicalOwnerApprovedRevenueLink as read} from '../dist/modules/projects/historical-owner-links.js';
import {canonical} from '../../../scripts/dgc-migration/core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
const address=a=>({sheet:a.sheet,sheetId:a.sheetId,sourceRow:a.sourceRow,legacyId:a.legacyId,rowHash:a.expectedRowHash});
for(const p of envelope.proposal.proposals){
 const input={envelopeJson:canonical(envelope),snapshotHash:envelope.snapshotHash,invoiceId:p.evidence.invoiceId,source:address(p.source),capturedRevenueId:p.source.expectedValue,target:address(p.target),pdfFileId:p.evidence.fileId,pdfSha256:p.evidence.sha256},before=canonical(input),r=read(input);
 eq(r.state,'OWNER_APPROVED_LINK');eq(r.approvalHash,envelope.approvalHash);eq(r.source,p.source);eq(r.target,p.target);eq(r.moneyChanged,false);eq(r.sourceChanged,false);eq(r.datesChanged,false);eq(canonical(input),before);
 for(const mutate of [x=>x.snapshotHash='0'.repeat(64),x=>x.invoiceId='OTHER',x=>x.source.sourceRow++,x=>x.source.rowHash='0'.repeat(64),x=>x.source.legacyId='OTHER',x=>x.source.sheetId++,x=>x.target.sourceRow++,x=>x.target.rowHash='0'.repeat(64),x=>x.target.legacyId='OTHER',x=>x.capturedRevenueId='OTHER',x=>x.pdfFileId='OTHER',x=>x.pdfSha256='0'.repeat(64),x=>delete x.envelopeJson,x=>x.envelopeJson=JSON.stringify(envelope,null,2)]){const x=structuredClone(input);mutate(x);eq(read(x),null);}
 const forged=structuredClone(envelope);forged.proposal.proposals[0].target.sourceRow++;delete forged.approvalHash;forged.approvalHash=createHash('sha256').update(canonical(forged)).digest('hex');eq(read({...input,envelopeJson:canonical(forged)}),null);
}
eq(read({envelopeJson:'{'}),null);
console.log(`Historical owner-approved links: ${n} assertions passed; exact three approvals only, rehashed forgery and row/PDF/snapshot drift rejected`);
