import assert from 'node:assert/strict';
import {historicalRevenueFixture} from './historical-revenue-source.fixtures.mjs';
import {readHistoricalRevenueSource} from '../dist/modules/projects/historical-revenue-source.js';
import {roundingExceptionInputs} from '../../../scripts/dgc-migration/rounding-exception.fixtures.mjs';
import {roundingExceptionPlan} from '../../../scripts/dgc-migration/rounding-exception.mjs';
import {cell} from '../../../scripts/dgc-migration/fixtures.mjs';
import {canonical} from '../../../scripts/dgc-migration/core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async fn=>{await assert.rejects(fn,e=>e.statusCode===409);n++;};
function fixture(o=roundingExceptionInputs()){
 const p=roundingExceptionPlan(o.snapshot,o.targetPlan,o.combined,o.combinedPin,o.rounding,o.roundingPin);
 const f=historicalRevenueFixture(c=>{for(const e of c){const s=e.data.sheets[0],t=o.snapshot.tables[s.properties.title];s.properties.sheetId=t.sheetId;s.properties.gridProperties=t.gridBounds;e.requestedRange=t.requestedRange;const rows=Array.from({length:t.gridBounds.rowCount},()=>({}));rows[0]={values:t.headers.map(cell)};for(const r of t.rows)rows[r.sourceRow-1]={values:t.headers.map(h=>r.cells[h])};s.data[0].rowData=rows;}});
 assert.equal(f.snapshot.snapshotHash,o.snapshot.snapshotHash);
 f.revenue.calculationJson.roundingException=structuredClone(p.groups[0].entries[0].exceptionEvidence);f.reconciliation.ocrRawJson.roundingReviewHash=o.roundingPin;f.reseal();return f;
}
const f=fixture(),before=canonical(f.revenue),read=f=>readHistoricalRevenueSource(f.tx,f.companyId,f.id,f.snapshot.snapshotHash),r=await read(f);
eq(r.capturedAmounts.invoiceUsd,{revenue:'33.33',wht:'3.67',payable:'29.67'});eq(r.historicalArithmetic.identityDelta,'0.01');eq(r.historicalArithmetic.components,r.capturedAmounts.invoiceUsd);eq(r.historicalArithmetic.sourceArithmeticReplayed,true);eq(r.historicalArithmetic.operationalUseAllowed,false);eq(r.historicalArithmetic.originalPdfVerified,false);eq(r.historicalArithmetic.operationalFxDerived,false);eq(r.historicalArithmetic.gateOverrideAllowed,false);eq(r.historicalArithmetic.acceptance,false);eq(r.approvalEvidence.localApprovalCreated,false);eq(canonical(f.revenue),before);eq(JSON.stringify(r).includes('Exchange_Rate'),false);eq(JSON.stringify(r).includes('Remuneration_Provider_MZN'),false);
for(const mutate of [
 f=>delete f.revenue.calculationJson.roundingException,
 f=>{delete f.revenue.calculationJson.roundingException;delete f.reconciliation.ocrRawJson.roundingReviewHash;},
 f=>f.revenue.calculationJson.roundingException.identityDelta='0',
 f=>f.revenue.calculationJson.roundingException.components.payable='29.66',
 f=>f.revenue.calculationJson.roundingException.acceptance=true,
 f=>f.revenue.calculationJson.roundingException.sourceValuesChanged=true,
 f=>f.revenue.calculationJson.roundingException.operationalFxDerived=true,
 f=>f.revenue.calculationJson.roundingException.mode='APPROVED',
 f=>f.revenue.calculationJson.roundingException.characterizationReviewHash='0'.repeat(64),
 f=>f.revenue.calculationJson.roundingException.sourceDetail.sourceRow++,
 f=>f.revenue.calculationJson.roundingException.sourceDetail.rowHash='0'.repeat(64),
 f=>f.revenue.calculationJson.roundingException.sourceDocument.rowHash='0'.repeat(64),
 f=>f.revenue.calculationJson.roundingException.extra='DO_NOT_EXPOSE',
 f=>delete f.reconciliation.ocrRawJson.roundingReviewHash,
 ]){const x=fixture();mutate(x);x.reseal();await reject(()=>read(x));}
const missing=fixture(),lookup=missing.tx.dgcImportRow.findUnique;missing.tx.dgcImportRow.findUnique=async q=>q.where.companyId_snapshotHash_sheetId_sourceRow.sheetId===missing.revenue.calculationJson.roundingException.sourceDetail.sheetId?null:lookup(q);await reject(()=>read(missing));
const negative=fixture(roundingExceptionInputs((c,ch)=>{for(const row of [1,2]){
 for(const [field,value] of Object.entries({Remuneration_Provider_MZN:101,WHT_MZN:10,Partner_Revenue_MZN:91,Remuneration_Provider_USD:33.67,WHT_USD:3.33,Partner_Revenue_USD:30.33}))ch('44_RECON_PDF_DETAIL',field,value,row);
 for(const [field,value] of Object.entries({Gross_Revenue:30.33,Net_Revenue:30.33,Company_Share:30.33,Invoice_Revenue_USD:33.67,Invoice_WHT_USD:3.33,Invoice_Payable_USD:30.33}))ch('40_MONTHLY_REVENUE',field,value,row);
 for(const field of ['Gross_Revenue','Net_Revenue','Company_Share'])ch('41_RECONCILIATION',field,30.33,row);
}})),nr=await read(negative);eq(nr.historicalArithmetic.identityDelta,'-0.01');eq(nr.capturedAmounts.invoiceUsd,{revenue:'33.67',wht:'3.33',payable:'30.33'});
console.log(`Historical captured rounding reader: ${n} assertions passed (controlled source/target doubles)`);
