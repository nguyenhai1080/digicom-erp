import assert from 'node:assert/strict';
import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {cell} from './fixtures.mjs';
import {canonical,digest} from './core.mjs';
import {donorRoundingReview,verifyDonorRoundingReview,replayDonorUsd,donorRoundingImpact} from './donor-rounding.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
eq(replayDonorUsd('100','3').donorNumber,'33.33');eq(replayDonorUsd('11','3').donorNumber,'3.67');eq(replayDonorUsd('89','3').donorNumber,'29.67');
// Retain a known binary Number versus Decimal difference before adaptation.
eq(replayDonorUsd('10.075','1'),{state:'NUMBER_AND_DECIMAL_DIFFER',donorNumber:'10.07',decimalHalfUp:'10.08',difference:'-0.01'});
for(const [native,rate] of [[null,3],['',3],[-1,3],[100,0],[100,null],[100,'bad'],['1e2',3],[true,3]])eq(replayDonorUsd(native,rate).state,'REFERENCE_ARITHMETIC_UNAVAILABLE');
eq(replayDonorUsd(0,3).donorNumber,'0');
function fixture(mutate=()=>{}){
 return invoiceRestoreInputs('Issued',(c,change)=>{
  function append(sheet,values){const e=c.find(e=>e.data.sheets[0].properties.title===sheet),s=e.data.sheets[0],rows=s.data[0].rowData,headers=Object.keys(values);rows[0].values.push(...headers.map(cell));for(const row of rows.slice(1))row.values.push(...headers.map(h=>cell(values[h])));s.properties.gridProperties.columnCount+=headers.length;let x=s.properties.gridProperties.columnCount,col='';while(x){col=String.fromCharCode(65+(x-1)%26)+col;x=Math.floor((x-1)/26);}e.requestedRange=`'${sheet}'!A1:${col}${rows.length}`;}
  append('43_RECON_PDF_HEADER',{Exchange_Rate:3});append('44_RECON_PDF_DETAIL',{Remuneration_Provider_MZN:100,WHT_MZN:11,Partner_Revenue_MZN:89});
  const pkg=c.find(e=>e.data.sheets[0].properties.title==='55_APPROVAL_PACKAGE');pkg.data.sheets[0].properties.gridProperties={rowCount:2,columnCount:2};pkg.requestedRange="'55_APPROVAL_PACKAGE'!A1:B2";pkg.data.sheets[0].data[0].rowData=[{values:['Approval_ID','Related_Invoice_IDs'].map(cell)},{values:['PKG','INV'].map(cell)}];
  for(const row of [1,2]){
   for(const [f,v] of Object.entries({Gross_Revenue:29.67,Net_Revenue:29.67,Company_Share:29.67,Invoice_Revenue_USD:33.33,Invoice_WHT_USD:3.67,Invoice_Payable_USD:29.67}))change('40_MONTHLY_REVENUE',f,v,row);
   for(const [f,v] of Object.entries({Remuneration_Provider_USD:33.33,WHT_USD:3.67,Partner_Revenue_USD:29.67}))change('44_RECON_PDF_DETAIL',f,v,row);
  }
  for(const [f,v] of Object.entries({Total_Revenue_USD:33.33,Total_WHT_USD:3.67,Total_Payable_USD:29.67,Outstanding_Amount_USD:29.67}))change('48_INVOICE_HEADER',f,v);
  for(const [f,v] of Object.entries({Revenue_USD:33.33,WHT_USD:3.67,Payable_USD:29.67}))change('49_INVOICE_DETAIL',f,v);
  for(const f of ['Original_Amount','Outstanding_Amount'])change('50_AR_AP',f,29.67);
  mutate(c,(sheet,field,value,row)=>{change(sheet,field,value,row??1);if(row===undefined&&['40_MONTHLY_REVENUE','44_RECON_PDF_DETAIL'].includes(sheet))change(sheet,field,value,2);});
 })[0];
}
const snapshot=fixture(),before=canonical(snapshot),r=donorRoundingReview(snapshot);eq(r.revenues.length,2);eq(r.revenues.every(e=>e.state==='DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED'),true);eq(r.revenues[0].capturedUsdIdentity.difference,'0.01');eq(r.revenues[0].nativeIdentity.state,'MATCH');eq(r.invoices[0].state,'CAPTURED_LINE_ROUNDING_PROPAGATES_TO_HEADER');eq(r.invoices[0].characterizedLineDelta,'0.01');eq(r.invoices[0].headerAndLineDeltaReconcile,true);eq(canonical(snapshot),before);eq(verifyDonorRoundingReview(r,snapshot),r);
for(const flag of ['sourceValuesChanged','operationalFxDerived','postingAllowed','acceptance','readyToImport','gateOverrideAllowed','historicalCashPosting','pdfSemanticsVerified'])eq(r[flag],false);
for(const [changeValue,state] of [
 [(c,ch)=>ch('44_RECON_PDF_DETAIL','Partner_Revenue_MZN',89.01),'DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS'],
 [(c,ch)=>ch('43_RECON_PDF_HEADER','Exchange_Rate',0),'USD_IDENTITY_DIFFERENCE_REQUIRES_REVIEW'],
 [(c,ch)=>ch('43_RECON_PDF_HEADER','Exchange_Rate',''),'USD_IDENTITY_DIFFERENCE_REQUIRES_REVIEW'],
 [(c,ch)=>ch('44_RECON_PDF_DETAIL','Partner_Revenue_USD',29.68),'USD_IDENTITY_DIFFERENCE_REQUIRES_REVIEW'],
 [(c,ch)=>ch('40_MONTHLY_REVENUE','Invoice_Payable_USD',29.68),'USD_IDENTITY_DIFFERENCE_REQUIRES_REVIEW'],
 [(c,ch)=>ch('40_MONTHLY_REVENUE','Invoice_Payable_USD',''),'CAPTURED_USD_UNAVAILABLE']
]){const x=donorRoundingReview(fixture(changeValue));eq(x.revenues[0].state,state);eq(x.invoices[0].state,'HEADER_DIFFERENCE_REQUIRES_REVIEW');}
const extra=donorRoundingReview(fixture((c,ch)=>ch('48_INVOICE_HEADER','Total_Payable_USD',29.68)));eq(extra.invoices[0].state,'HEADER_DIFFERENCE_REQUIRES_REVIEW');
const unlinked=donorRoundingReview(fixture((c,ch)=>ch('49_INVOICE_DETAIL','Revenue_ID','MISSING')));eq(unlinked.invoices[0].state,'HEADER_DIFFERENCE_REQUIRES_REVIEW');
const unsupported=donorRoundingReview(fixture((c,ch)=>ch('48_INVOICE_HEADER','Currency','VND')));eq(unsupported.invoices[0].state,'HEADER_DIFFERENCE_REQUIRES_REVIEW');
const bad=structuredClone(r);bad.gateOverrideAllowed=true;const {reviewHash,...body}=bad;bad.reviewHash=digest(body);assert.throws(()=>verifyDonorRoundingReview(bad,snapshot),/pinned source/);n++;
const t=snapshot.tables['55_APPROVAL_PACKAGE'],row=t.rows[0],doc={sheet:'55_APPROVAL_PACKAGE',sheetId:t.sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash};
const rb={format:'dgc-reference-registration-plan-v1',snapshotHash:snapshot.snapshotHash,postingAllowed:false,acceptance:false,registryCommitAllowed:false,unrehearsableInvoices:[{source:r.invoices[0].source,affectedDocuments:[doc],restoreReasons:['CAPTURED_FINANCE_REQUIRES_REVIEW','REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD']}]},registration={...rb,planHash:digest(rb)},impact=donorRoundingImpact(snapshot,r,r.reviewHash,registration,registration.planHash);
eq(impact.entries.length,1);eq(impact.entries[0].roundingState,'CAPTURED_LINE_ROUNDING_PROPAGATES_TO_HEADER');eq(impact.entries[0].restorationGateUnchanged,true);eq(impact.entries[0].originalRestoreReasons,rb.unrehearsableInvoices[0].restoreReasons);eq(impact.gateOverrideAllowed,false);eq(impact.postingAllowed,false);
for(const [reviewPin,registrationPin] of [['0'.repeat(64),registration.planHash],[r.reviewHash,'0'.repeat(64)]]){assert.throws(()=>donorRoundingImpact(snapshot,r,reviewPin,registration,registrationPin),/Pinned/);n++;}
for(const mutate of [b=>b.unrehearsableInvoices.push(b.unrehearsableInvoices[0]),b=>b.unrehearsableInvoices[0].source.rowHash='0'.repeat(64),b=>b.unrehearsableInvoices[0].affectedDocuments[0].rowHash='0'.repeat(64)]){const b=structuredClone(rb);mutate(b);const p={...b,planHash:digest(b)};assert.throws(()=>donorRoundingImpact(snapshot,r,r.reviewHash,p,p.planHash),/coverage/);n++;}
console.log(`Donor independent rounding characterization: ${n} assertions passed`);
