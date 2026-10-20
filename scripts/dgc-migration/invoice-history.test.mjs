import assert from 'node:assert/strict';
import {normalizeCapture,digest} from './core.mjs';
import {fixture,cell} from './fixtures.mjs';
import {invoiceHistoryPlan,verifyInvoiceHistoryPlan} from './invoice-history.mjs';
const capture=fixture();
function set(sheet,headers,data){
 const e=capture.find(e=>e.data.sheets[0].properties.title===sheet),s=e.data.sheets[0];
 s.properties.gridProperties={rowCount:data.length+1,columnCount:headers.length};
 e.requestedRange=`'${sheet}'!A1:${String.fromCharCode(64+headers.length)}${data.length+1}`;
 s.data[0].rowData=[{values:headers.map(cell)},...data.map(values=>({values:values.map(cell)}))];
}
set('48_INVOICE_HEADER',['Invoice_ID','Invoice_Number','Business_Key','Revision_No','Status','Is_Current','Supersedes_Invoice_ID','Superseded_By_Invoice_ID','Partner_ID','Currency','Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD','Paid_Amount_USD','Outstanding_Amount_USD'],[
 ['OLD','OLD-NO','BIZ',1,'Superseded',false,'','NEW','SYNTH_PARTNER','USD','-100','-10','-90','0','-90'],
 ['NEW','NEW-NO','BIZ',2,'Issued',true,'OLD','','SYNTH_PARTNER','USD','100','10','90','0','90'],
 ['DRAFT','DRAFT-NO','BIZ-DRAFT',1,'Draft',true,'','','SYNTH_PARTNER','USD','100','10','90','0','90'],
 ['CANCEL','CANCEL-NO','BIZ-CANCEL',1,'Cancelled',false,'','','SYNTH_PARTNER','USD','100','10','90','0','90']
]);
set('40_MONTHLY_REVENUE',['Revenue_ID','Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'],[['REV','100','10','90']]);
set('49_INVOICE_DETAIL',['Invoice_Detail_ID','Invoice_ID','Revenue_ID','Revenue_USD','WHT_USD','Payable_USD'],[
 ['OLD-LINE','OLD','REV','-100','-10','-90'],['NEW-LINE','NEW','REV','100','10','90'],['DRAFT-LINE','DRAFT','REV','100','10','90'],['CANCEL-LINE','CANCEL','REV','100','10','90']
]);
set('50_AR_AP',['ARAP_ID','Invoice_ID','Partner_ID','ARAP_Type','Status','Is_Current','Currency','Original_Amount','Paid_Amount','Outstanding_Amount'],[['AR','NEW','SYNTH_PARTNER','AR','Open',true,'USD','90','0','90']]);
const snapshot=normalizeCapture(capture),before=JSON.stringify(snapshot),plan=invoiceHistoryPlan(snapshot),entry=(p,id)=>p.entries.find(e=>e.source.legacyId===id);
assert.equal(plan.postingAllowed,false);assert.equal(plan.acceptance,false);
assert.equal(plan.entries.length,4);assert.equal(plan.counts.PRESERVE_HISTORY_ONLY,2);assert.equal(plan.counts.PREPARE_CURRENT_LEDGER,1);assert.equal(plan.counts.PREPARE_UNISSUED_DRAFT,1);
assert.equal(entry(plan,'OLD').integrity,'STRUCTURAL_CHECKS_PASSED');assert.equal(entry(plan,'NEW').integrity,'STRUCTURAL_CHECKS_PASSED');
assert.equal(entry(plan,'OLD').capturedDetails[0].values.Payable_USD,'-90');
assert.equal(entry(plan,'OLD').capturedDetails[0].rowHash,snapshot.tables['49_INVOICE_DETAIL'].rows[0].rowHash);
assert.equal(entry(plan,'NEW').capturedReceivables.length,1);
assert.equal(entry(plan,'OLD').capturedReceivables.length,0);
assert.ok(entry(plan,'OLD').amountIssues.some(i=>i.code==='NEGATIVE_AMOUNT'));
assert.ok(entry(plan,'OLD').importerRequirements.includes('HISTORY_MUST_NOT_CREATE_CURRENT_AR_OR_REBILL_SOURCE'));
assert.ok(plan.entries.every(e=>!e.postingAllowed&&!e.recomputeAmounts&&!e.postHistoricalCash));
assert.equal(JSON.stringify(snapshot),before);assert.equal(invoiceHistoryPlan(snapshot).planHash,plan.planHash);
const {planHash,...body}=plan;assert.equal(planHash,digest(body));
assert.equal(verifyInvoiceHistoryPlan(plan,snapshot),plan);
const damaged=structuredClone(plan);damaged.entries[0].capturedDetails[0].values.Payable_USD='90';
assert.throws(()=>verifyInvoiceHistoryPlan(damaged,snapshot),/checksum mismatch/);
const {planHash:oldHash,...changedBody}=damaged;damaged.planHash=digest(changedBody);
assert.throws(()=>verifyInvoiceHistoryPlan(damaged,snapshot),/differs from its verified snapshot/);
const reclassified=structuredClone(plan);reclassified.entries[0].disposition='PREPARE_CURRENT_LEDGER';
const {planHash:otherHash,...reclassifiedBody}=reclassified;reclassified.planHash=digest(reclassifiedBody);
assert.throws(()=>verifyInvoiceHistoryPlan(reclassified,snapshot),/differs from its verified snapshot/);
function change(sheet,row,field,value){const c=structuredClone(capture),s=c.find(e=>e.data.sheets[0].properties.title===sheet).data.sheets[0],j=s.data[0].rowData[0].values.findIndex(c=>c.effectiveValue.stringValue===field);s.data[0].rowData[row].values[j]=cell(value);return invoiceHistoryPlan(normalizeCapture(c));}
assert.ok(change('48_INVOICE_HEADER',1,'Superseded_By_Invoice_ID','MISSING').issueCounts.UNRESOLVED_REVISION_LINK);
assert.ok(change('48_INVOICE_HEADER',1,'Superseded_By_Invoice_ID','OLD').issueCounts.REVISION_CYCLE);
assert.ok(change('48_INVOICE_HEADER',2,'Supersedes_Invoice_ID','').issueCounts.NONRECIPROCAL_REVISION_LINK);
assert.ok(change('48_INVOICE_HEADER',2,'Revision_No',1).issueCounts.DUPLICATE_REVISION_NUMBER);
assert.ok(change('48_INVOICE_HEADER',2,'Revision_No','2').issueCounts.INVALID_REVISION_NUMBER);
assert.ok(change('48_INVOICE_HEADER',1,'Is_Current',true).issueCounts.STATUS_CURRENT_FLAG_CONFLICT);
assert.ok(change('48_INVOICE_HEADER',2,'Invoice_Number','OLD-NO').issueCounts.MISSING_OR_DUPLICATE_INVOICE_NUMBER);
assert.ok(change('48_INVOICE_HEADER',2,'Business_Key','OTHER').issueCounts.CROSS_BUSINESS_REVISION_LINK);
assert.equal(entry(change('49_INVOICE_DETAIL',2,'Revenue_ID','MISSING'),'NEW').integrity,'REVIEW_REQUIRED');
const duplicate=change('48_INVOICE_HEADER',3,'Business_Key','BIZ');assert.ok(duplicate.issueCounts.MULTIPLE_CURRENT_REVISIONS);
assert.ok(entry(duplicate,'NEW').issues.some(i=>i.code==='MULTIPLE_CURRENT_REVISIONS'));
assert.equal(entry(change('49_INVOICE_DETAIL',1,'Revenue_ID','MISSING'),'NEW').integrity,'STRUCTURAL_CHECKS_PASSED');
console.log('PASS: history preparation retains signed amounts/provenance, separates revisions, detects missing/cyclic/inconsistent chains and quarantines source dependencies without posting.');
