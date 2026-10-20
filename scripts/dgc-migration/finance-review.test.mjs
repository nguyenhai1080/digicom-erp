import assert from 'node:assert/strict';
import {normalizeCapture,digest} from './core.mjs';
import {fixture,cell} from './fixtures.mjs';
import {financeReview} from './finance-review.mjs';
const captures=fixture();
function set(name,headers,data){
 const e=captures.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];
 s.properties.gridProperties={rowCount:data.length+1,columnCount:headers.length};
 e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+headers.length)}${data.length+1}`;
 s.data[0].rowData=[{values:headers.map(cell)},...data.map(values=>({values:values.map(cell)}))];
}
set('40_MONTHLY_REVENUE',['Revenue_ID','Service_ID','Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'],[['REV','SYNTH_SERVICE','100','10','90']]);
set('48_INVOICE_HEADER',['Invoice_ID','Partner_ID','Currency','Status','Is_Current','Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD','Paid_Amount_USD','Outstanding_Amount_USD'],[
 ['INV','SYNTH_PARTNER','USD','Issued',true,'100','10','90','30','60'],
 ['CANCEL','SYNTH_PARTNER','USD','Cancelled',false,'0','0','0','0','0']
]);
set('49_INVOICE_DETAIL',['Invoice_Detail_ID','Invoice_ID','Revenue_ID','Service_ID','Revenue_USD','WHT_USD','Payable_USD'],[['LINE','INV','REV','SYNTH_SERVICE','100','10','90']]);
set('52_INVOICE_PAYMENT',['Payment_ID','Invoice_ID','Paid_Amount_USD','Paid_Amount_VND','Payment_Date'],[
 ['P1','INV','10.1','252500','2026-01-01'],['P2','INV','19.9','497500','2026-02-01']
]);
set('50_AR_AP',['ARAP_ID','Invoice_ID','Partner_ID','ARAP_Type','Status','Is_Current','Currency','Original_Amount','Paid_Amount','Outstanding_Amount'],[
 ['AR','INV','SYNTH_PARTNER','AR','Open',true,'USD','90','30','60'],['OLD','INV','SYNTH_PARTNER','AR','Superseded',false,'USD','90','0','90']
]);
const snapshot=normalizeCapture(captures),before=JSON.stringify(snapshot),report=financeReview(snapshot);
const check=(r,code,id='INV')=>r.checks.find(c=>c.source.legacyId===id&&c.code===code);
assert.equal(report.postingAllowed,false);assert.equal(report.acceptance,false);assert.equal(report.historicalCashPosting,false);
assert.equal(check(report,'PAYMENT_SUM').state,'MATCH');assert.equal(check(report,'PAYMENT_SUM').expected,'30');
assert.equal(check(report,'CURRENT_AR_CARDINALITY').state,'MATCH');
assert.equal(check(report,'DETAIL_SUM_Payable_USD').state,'MATCH');
assert.equal(check(report,'AR_PAID_VS_PAYMENTS','AR').state,'MATCH');
assert.equal(check(report,'REVENUE_SOURCE_Payable_USD','LINE').state,'MATCH');
assert.equal(JSON.stringify(snapshot),before);
assert.equal(financeReview(snapshot).planHash,report.planHash);
const {planHash,...body}=report;assert.equal(planHash,digest(body));
function modified(sheet,row,field,value){const copy=structuredClone(captures),s=copy.find(e=>e.data.sheets[0].properties.title===sheet).data.sheets[0],j=s.data[0].rowData[0].values.findIndex(c=>c.effectiveValue.stringValue===field);s.data[0].rowData[row].values[j]=cell(value);return financeReview(normalizeCapture(copy));}
const missing=modified('52_INVOICE_PAYMENT',1,'Paid_Amount_USD','');
assert.equal(check(missing,'PAYMENT_SUM').state,'UNAVAILABLE');assert.ok(missing.issueCounts.MISSING_AMOUNT);
const fractional=modified('49_INVOICE_DETAIL',1,'Payable_USD','90.01');
assert.equal(check(fractional,'DETAIL_SUM_Payable_USD').state,'MISMATCH');
assert.equal(check(fractional,'DETAIL_SUM_Payable_USD').withinDonorIssueTolerance,true);
assert.equal(check(fractional,'DETAIL_SUM_Payable_USD').difference,'-0.01');
const overpaid=modified('52_INVOICE_PAYMENT',1,'Paid_Amount_USD','100');
assert.equal(check(overpaid,'OUTSTANDING_IDENTITY').expected,'-29.9');
assert.equal(check(overpaid,'OUTSTANDING_IDENTITY').state,'MISMATCH');
const arMissing=modified('50_AR_AP',1,'Is_Current',false);
assert.equal(check(arMissing,'CURRENT_AR_CARDINALITY').state,'MISMATCH');
const malformed=modified('49_INVOICE_DETAIL',1,'Payable_USD','90,00');
assert.equal(check(malformed,'DETAIL_SUM_Payable_USD').state,'UNAVAILABLE');assert.ok(malformed.issueCounts.INVALID_AMOUNT);
const unsupported=modified('48_INVOICE_HEADER',1,'Currency','MZN');
assert.ok(unsupported.issueCounts.UNSUPPORTED_INVOICE_CURRENCY);assert.equal(check(unsupported,'PAYMENT_SUM'),undefined);
assert.ok(modified('52_INVOICE_PAYMENT',1,'Invoice_ID','MISSING').issueCounts.UNRESOLVED_PAYMENT_INVOICE);
assert.ok(modified('50_AR_AP',1,'Invoice_ID','').issueCounts.UNRESOLVED_CURRENT_AR_INVOICE);
assert.ok(modified('49_INVOICE_DETAIL',1,'Revenue_USD','-1').issueCounts.NEGATIVE_AMOUNT);
assert.ok(modified('49_INVOICE_DETAIL',1,'Payable_USD','9'.repeat(81)).issueCounts.INVALID_AMOUNT);
console.log('PASS: financial review Decimal identities, source lineage, all-payment scope, active AR, exact differences, donor tolerance evidence, missing values, overpayment and unsupported currency.');
