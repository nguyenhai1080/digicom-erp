import assert from 'node:assert/strict';
import {revenueCaptures,changeRevenueCapture,revenueSnapshot} from './revenue-fixtures.mjs';
import {normalizeCapture,digest} from './core.mjs';
import {revenueTargetPlan,verifyRevenueTargetPlan} from './revenue-target.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},ok=a=>{assert.ok(a);n++;};
const snapshot=revenueSnapshot(),before=JSON.stringify(snapshot),plan=revenueTargetPlan(snapshot),group=plan.groups[0];
eq(plan.counts,{REHEARSABLE:1});eq(plan.rowCounts,{REHEARSABLE:2});eq(plan.mode,'ROLLBACK_ONLY');eq(plan.postingAllowed,false);eq(plan.acceptance,false);eq(plan.filesVerified,false);
eq(group.entries.length,2);eq(group.state,'REHEARSABLE');eq(group.managementHeader.totalCompanyShare,'90');eq(group.managementHeader.totalGrossRevenue,'90');eq(group.entries[1].capturedManagement.Company_Share,'90');eq(group.entries[0].capturedInvoiceUsd.Invoice_Revenue_USD,'100');
eq(group.targetMapping.status,'BLOCKED');eq(group.targetMapping.approver,'NONE_NO_LOCAL_USER_OR_APPROVAL_CREATED');eq(group.sourceStatuses,['Approved']);eq(group.readyToImport,false);eq(group.sourceFileId,'AAAAAAAAAAAAAAAAAAAAAAAAA');eq(group.entries[1].legacyReconciliations.length,1);
eq(JSON.stringify(snapshot),before);eq(revenueTargetPlan(snapshot).planHash,plan.planHash);eq(verifyRevenueTargetPlan(plan,snapshot).planHash,plan.planHash);
// Characterize the donor's mixed-basis 41_RECONCILIATION without making MZN operational.
const mixed=revenueCaptures(),ds=mixed.find(e=>e.data.sheets[0].properties.title==='44_RECON_PDF_DETAIL');
for(const field of ['Total_Service_Revenue_MZN','Service_Revenue_For_Sharing_MZN','Partner_Revenue_MZN']){ds.data.sheets[0].data[0].rowData[0].values.push({effectiveValue:{stringValue:field},formattedValue:field});for(const r of ds.data.sheets[0].data[0].rowData.slice(1))r.values.push({effectiveValue:{numberValue:1800},formattedValue:'1800'});}
ds.data.sheets[0].properties.gridProperties.columnCount=12;ds.requestedRange="'44_RECON_PDF_DETAIL'!A1:L3";
for(const row of [1,2])for(const field of ['Gross_Revenue','Net_Revenue','Partner_Share'])changeRevenueCapture(mixed,'41_RECONCILIATION',row,field,1800);
const mp=revenueTargetPlan(normalizeCapture(mixed));eq(mp.groups[0].state,'REHEARSABLE');eq(mp.groups[0].entries[0].legacyReconBases,['PDF_MZN_REFERENCE_AND_USD_RECEIVABLE']);eq(mp.groups[0].managementHeader.totalGrossRevenue,'90');eq(mp.groups[0].currency,'USD');eq(mp.groups[0].entries[0].legacyReconciliations[0].values.Gross_Revenue,1800);eq(mp.groups[0].entries[0].capturedInvoiceUsd.Invoice_Payable_USD,'90');
const changed=(sheet,row,f,v)=>revenueTargetPlan(normalizeCapture(changeRevenueCapture(revenueCaptures(),sheet,row,f,v)));
const revenue=(f,v)=>changed('40_MONTHLY_REVENUE',2,f,v);
ok(revenue('Invoice_Payable_USD','90.01').groups[0].reasons.includes('REVENUE_REQUIRES_REVIEW'));eq(revenue('Invoice_Payable_USD','90.01').rowCounts,{HELD:2});
ok(revenue('Status','Draft').groups[0].reasons.includes('MIXED_REVENUE_STATUSES_IN_GROUP'));ok(revenue('Currency','VND').groups.some(g=>g.reasons.includes('REHEARSAL_USD_ONLY_NO_FX_CONVERSION')));
ok(revenue('Parent_Service_ID','SYNTH_CHILD').groups[0].reasons.includes('CHILD_PARENT_TOTAL_NOT_UNIQUE_IN_GROUP'));
ok(changed('41_RECONCILIATION',2,'Status','Cancelled').groups[0].reasons.includes('LEGACY_RECON_STATUS_DIFFERS'));
ok(changed('41_RECONCILIATION',2,'Company_Share','89').groups[0].reasons.includes('LEGACY_RECON_USD_RECEIVABLE_DIFFERS'));
ok(changed('41_RECONCILIATION',2,'Company_Share','').groups[0].reasons.includes('LEGACY_RECON_USD_RECEIVABLE_DIFFERS'));
ok(changed('41_RECONCILIATION',2,'Revenue_ID','REV_TOTAL').groups[0].reasons.includes('LEGACY_RECON_CARDINALITY_OR_REFERENCE'));
ok(changed('43_RECON_PDF_HEADER',1,'Source_File_URL','').groups[0].reasons.includes('MISSING_ORIGINAL_RECON_FILE_REFERENCE'));
ok(changed('43_RECON_PDF_HEADER',1,'Status','Cancelled').groups[0].reasons.includes('SOURCE_DOCUMENT_STATUS_REQUIRES_REVIEW'));
ok(revenue('Gross_Revenue','90.00001').groups[0].state==='HELD');ok(revenue('Revenue_ID','REV_TOTAL').groups[0].state==='HELD');
const draft=revenueCaptures();for(const sheet of ['40_MONTHLY_REVENUE','41_RECONCILIATION'])for(const row of [1,2])changeRevenueCapture(draft,sheet,row,'Status','Draft');const dp=revenueTargetPlan(normalizeCapture(draft));eq(dp.groups[0].sourceStatuses,['Draft']);eq(dp.groups[0].state,'REHEARSABLE');eq(dp.groups[0].targetMode,'BLOCKED_ROLLBACK_ONLY');
const large=revenueCaptures();changeRevenueCapture(large,'40_MONTHLY_REVENUE',2,'Revenue_Row_Type','Total');changeRevenueCapture(large,'40_MONTHLY_REVENUE',2,'Include_In_Monthly_Total','Y');changeRevenueCapture(large,'40_MONTHLY_REVENUE',2,'Parent_Service_ID','');
for(const row of [1,2]){for(const field of ['Gross_Revenue','Net_Revenue','Company_Share'])for(const sheet of ['40_MONTHLY_REVENUE','41_RECONCILIATION'])changeRevenueCapture(large,sheet,row,field,'9999999999999999');}
const lp=revenueTargetPlan(normalizeCapture(large));ok(lp.groups[0].reasons.includes('HEADER_TOTAL_EXCEEDS_DECIMAL_20_4'));eq(lp.groups[0].managementHeader.totalCompanyShare,'19999999999999998');eq(lp.groups[0].state,'HELD');
const tampered=structuredClone(plan);tampered.groups[0].targetMapping.status='APPROVED';assert.throws(()=>verifyRevenueTargetPlan(tampered,snapshot),/checksum/);n++;
const {planHash,...body}=tampered;tampered.planHash=digest(body);assert.throws(()=>verifyRevenueTargetPlan(tampered,snapshot),/differs/);n++;
console.log(`PASS: ${n} revenue target assertions: complete groups, TOTAL/CHILD, source reconciliation lifecycle/amounts, blocked-only targets, no fake approval or FX and canonical tamper guards.`);
