import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {canonical,digest} from './core.mjs';
import {invoiceLedgerAuthority} from './invoice-ledger-authority.mjs';
const b='artifacts/dgc-migration/',j=async p=>JSON.parse(await readFile(b+p,'utf8'));
const snapshot=await j('20261019/prepared/snapshot.json'),decision=await j('20261025/cutover/invoice14-owner-decision.json'),before=canonical({snapshot,decision}),p=invoiceLedgerAuthority(snapshot,decision);let n=0;
const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
eq(p.source.sourceRow,14);eq(p.ledger.payable,'14668.99');eq(p.ledger.paid,'14668.99');eq(p.ledger.outstanding,'0');eq(p.presented.payable,'14669');eq(p.printed.payable,'14669.00');eq(p.lines.length,5);eq(p.componentDifferences.map(c=>c.presentedMinusLedger),['0.01','0.01','0.01']);eq(p.receiptTotal,p.ledger.paid);eq(p.headerAndScopesEqual,false);eq(p.originalPdfBytesVerified,false);
for(const k of ['adjustmentCreated','additionalReceivableCreated','sourceValuesChanged','operationalUseAllowed','readyToImport','commitAllowed','acceptance','historicalCashPosting'])eq(p[k],false);eq(p.otherHoldsUnchanged,true);eq(canonical({snapshot,decision}),before);
for(const change of [d=>d.approvedBy='OTHER',d=>d.capturedLedger.payable='14669.00',d=>d.sourceRows['49_INVOICE_DETAIL'].pop(),d=>d.source.legacyId='OTHER',d=>d.financialCommitAllowed=true]){const altered=structuredClone(decision);change(altered);const {decisionHash,...body}=altered;altered.decisionHash=digest(body);assert.throws(()=>invoiceLedgerAuthority(snapshot,altered),/Unrecognized Invoice ledger authority/);n++;}
// Snapshot and decision hashes are independent. Rehashing altered source data
// cannot turn this narrow decision into approval for a different capture.
const changed=structuredClone(snapshot),row=changed.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===14);row.values.Total_Payable_USD=14669;row.cells.Total_Payable_USD.effectiveValue.numberValue=14669;row.rowHash=digest({values:row.values,cells:row.cells});const {snapshotHash,...body}=changed;changed.snapshotHash=digest(body);assert.throws(()=>invoiceLedgerAuthority(changed,decision),/source snapshot differs/);n++;
const out=b+'20261030/invoice-ledger-authority/';await mkdir(out,{recursive:true});await writeFile(out+'review.json',JSON.stringify(p,null,2)+'\n',{mode:0o600});await writeFile(out+'source-proof.json',JSON.stringify({assertions:n,reviewHash:p.reviewHash,financialAcceptance:false,financialRowsCommitted:0,otherHoldsUnchanged:true,remoteChanged:false},null,2)+'\n',{mode:0o600});console.log(`Invoice ledger authority: ${n} assertions passed; exact owner scope, independent ledger/lines/PDF, no adjustment or financial admission`);
