import assert from 'node:assert/strict';
import {cell} from './fixtures.mjs';
import {revenueCaptures,changeRevenueCapture} from './revenue-fixtures.mjs';
import {normalizeCapture,canonical,digest} from './core.mjs';
import {revenueTargetPlan} from './revenue-target.mjs';
import {reconLifecycleReview} from './recon-lifecycle.mjs';
import {revenueBillingPlan,verifyRevenueBillingPlan} from './revenue-billing.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},ok=v=>{assert.ok(v);n++;},fail=(f,re)=>{assert.throws(f,re);n++;};
function set(c,name,headers,data){const e=c.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];let col='',i=headers.length;while(i){col=String.fromCharCode(65+(i-1)%26)+col;i=Math.floor((i-1)/26);}s.properties.gridProperties={rowCount:data.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${col}${data.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...data.map(v=>({values:v.map(cell)}))];}
function fixture(st='Paid'){
 const c=revenueCaptures(),paid=st==='Paid'?90:st==='Partially Paid'?30:0;
 set(c,'48_INVOICE_HEADER',['Invoice_ID','Invoice_Number','Business_Key','Revision_No','Status','Is_Current','Partner_ID','Revenue_Month','Currency','Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD','Paid_Amount_USD','Outstanding_Amount_USD','Needs_Regeneration','Created_By','Created_At'],[['INV','TEST-INV','SYNTH_PARTNER|2026-01|CONSOLIDATED',1,st,true,'SYNTH_PARTNER','2026-01','USD',100,10,90,paid,90-paid,false,'external@example.invalid',46245.657010740746]]);
 set(c,'49_INVOICE_DETAIL',['Invoice_Detail_ID','Invoice_ID','Revenue_ID','Service_ID','Source_Recon_Doc_ID','Source_Recon_Detail_ID','Revenue_USD','WHT_USD','Payable_USD'],[['LINE','INV','REV_CHILD','SYNTH_CHILD','DOC','DETAIL_CHILD',100,10,90]]);
 set(c,'50_AR_AP',['ARAP_ID','Invoice_ID','ARAP_Type','Status','Is_Current','Partner_ID','Currency','Original_Amount','Paid_Amount','Outstanding_Amount'],st==='Draft'?[]:[['AR','INV','AR',st==='Paid'?'Paid':paid?'Partial':'Open',true,'SYNTH_PARTNER','USD',90,paid,90-paid]]);
 set(c,'52_INVOICE_PAYMENT',['Payment_ID','Invoice_ID','Partner_ID','Paid_Amount_USD','Paid_Amount_VND','Payment_FX_Rate','Payment_Date'],paid?[['PAY','INV','SYNTH_PARTNER',paid,paid*25000,25000,46245.657010740746]]:[]);
 return c;
}
function input(c=fixture()){
 const snapshot=normalizeCapture(c),plan=revenueTargetPlan(snapshot),b={format:'dgc-recon-combined-evidence-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:plan.planHash,postingAllowed:false,acceptance:false,readyToImport:false,groups:plan.groups.map(g=>({groupKey:g.groupKey,businessState:g.state,documentSource:g.documentSource,state:'EVIDENCE_CLEAR_FOR_NEXT_REVIEW',rows:g.entries.map(e=>({source:e.source})),readyToImport:false})),lifecycle:reconLifecycleReview(snapshot)};
 const combined={...b,reviewHash:digest(b)};return [snapshot,plan,combined,combined.reviewHash];
}
const row=(r,id='REV_CHILD')=>r.rows.find(r=>r.source.legacyId===id),changed=(sheet,field,value,c=fixture())=>{changeRevenueCapture(c,sheet,1,field,value);return revenueBillingPlan(...input(c));};
for(const [st,expected] of [['Paid','PAID'],['Partially Paid','PARTIALLY_PAID'],['Issued','INVOICED'],['Overdue','INVOICED'],['Draft',null]]){
 const i=input(fixture(st)),before=canonical(i),r=revenueBillingPlan(...i);eq(row(r).proposedRevenueStatus,expected);eq(row(r,'REV_TOTAL').proposedRevenueStatus,null);eq(row(r,'REV_TOTAL').childCoverage.length,1);eq(row(r,'REV_TOTAL').childCoverage[0].source,row(r).source);eq(row(r).invoiceReceiptAllocation,null);eq(canonical(i),before);
 eq(r.readyToImport,false);eq(r.historicalCashPosting,false);eq(r.recomputeAmounts,false);eq(r.rows.every(r=>!r.readyToImport&&!r.rebillingAllowed&&!r.safeRehearsalIsCurrent&&r.safeRehearsalStatus==='BLOCKED'),true);
 if(st==='Draft')ok(row(r).reasons.includes('UNISSUED_DRAFT_RESERVES_SOURCE'));
}
const i=input(),r=revenueBillingPlan(...i);eq(verifyRevenueBillingPlan(r,...i),r);eq(revenueBillingPlan(...i).planHash,r.planHash);
const h=JSON.parse(r.invoices[0].capturedHeaderJson);eq(h.values.Created_At,46245.657010740746);eq(h.values.Created_By,'external@example.invalid');eq(digest({values:h.values,cells:h.cells}),h.rowHash);
eq(JSON.parse(r.invoices[0].capturedPaymentsJson)[0].values.Payment_Date,46245.657010740746);eq(r.localApprovalCreated,false);eq(r.invoices[0].historicalCashPosting,false);
fail(()=>revenueBillingPlan(...[...i.slice(0,3),'0'.repeat(64)]),/Pinned/);
const bad=structuredClone(r);bad.rows[0].proposedRevenueStatus='INVOICE_READY';fail(()=>verifyRevenueBillingPlan(bad,...i),/checksum/);const {planHash,...b}=bad;bad.planHash=digest(b);fail(()=>verifyRevenueBillingPlan(bad,...i),/pinned source/);
for(const [sheet,field,value,reason] of [
 ['48_INVOICE_HEADER','Needs_Regeneration',true,'INVOICE_NEEDS_REGENERATION'],
 ['48_INVOICE_HEADER','Is_Current',false,'INVOICE_NOT_EXPLICITLY_CURRENT'],
 ['48_INVOICE_HEADER','Is_Current','','INVOICE_NOT_EXPLICITLY_CURRENT'],
 ['48_INVOICE_HEADER','Currency','MZN','INVOICE_CURRENCY_CONFLICT'],
 ['48_INVOICE_HEADER','Outstanding_Amount_USD',0.01,'INVOICE_AMOUNTS_REQUIRE_REVIEW'],
 ['50_AR_AP','Status','Open','AR_STATUS_CONFLICT'],
 ['50_AR_AP','Is_Current','','AR_NOT_EXPLICITLY_CURRENT'],
 ['50_AR_AP','Outstanding_Amount',1,'INVOICE_AMOUNTS_REQUIRE_REVIEW'],
 ['52_INVOICE_PAYMENT','Paid_Amount_USD',89.99,'INVOICE_AMOUNTS_REQUIRE_REVIEW'],
 ['49_INVOICE_DETAIL','Revenue_USD',100.01,'INVOICE_AMOUNTS_REQUIRE_REVIEW'],
 ['49_INVOICE_DETAIL','Revenue_ID','MISSING','BUSINESS_SCOPE_RESERVATION_REQUIRES_REVIEW'],
 ['49_INVOICE_DETAIL','Source_Recon_Detail_ID','MISSING','INVOICE_STRUCTURE_REQUIRES_REVIEW'],
 ['49_INVOICE_DETAIL','Invoice_ID','MISSING','UNRESOLVED_INVOICE_PARENT']]){
 const p=changed(sheet,field,value);eq(row(p).proposedRevenueStatus,null);ok(row(p).reasons.includes(reason));
}
// Tolerance is evidence only: Paid with a remaining cent is not silently paid.
const tolerance=fixture();for(const [s,f,v] of [['48_INVOICE_HEADER','Paid_Amount_USD',89.99],['48_INVOICE_HEADER','Outstanding_Amount_USD',0.01],['52_INVOICE_PAYMENT','Paid_Amount_USD',89.99],['50_AR_AP','Paid_Amount',89.99],['50_AR_AP','Outstanding_Amount',0.01]])changeRevenueCapture(tolerance,s,1,f,v);
const tol=revenueBillingPlan(...input(tolerance));eq(row(tol).proposedRevenueStatus,null);ok(row(tol).reasons.includes('CAPTURED_STATUS_BALANCE_CONFLICT'));
for(const st of ['Cancelled','Superseded']){const c=fixture('Issued');changeRevenueCapture(c,'48_INVOICE_HEADER',1,'Status',st);changeRevenueCapture(c,'48_INVOICE_HEADER',1,'Is_Current',false);set(c,'50_AR_AP',['ARAP_ID'],[]);const p=revenueBillingPlan(...input(c));eq(row(p).proposedRevenueStatus,null);eq(row(p).archivedLines.length,1);eq(row(p).directCurrentLines.length,0);eq(p.invoices[0].createCurrentAr,false);eq(row(p).rebillingAllowed,false);}
// Explicit line references cannot promote Draft revenue, even on a Paid invoice.
const draft=changed('40_MONTHLY_REVENUE','Status','Draft');eq(row(draft).proposedRevenueStatus,null);
ok(draft.invoices[0].sourceLifecycleIssues.some(i=>i.code==='INVOICE_SOURCE_LIFECYCLE_REQUIRES_REVIEW'));
// An active invoice's source chain is checked in full, including source header.
const inactive=changed('43_RECON_PDF_HEADER','Status','Cancelled');eq(row(inactive).proposedRevenueStatus,null);ok(inactive.invoices[0].sourceLifecycleIssues.length);
const c=fixture();changeRevenueCapture(c,'40_MONTHLY_REVENUE',2,'Status','Draft');eq(row(revenueBillingPlan(...input(c))).proposedRevenueStatus,null);
const conflict=changed('49_INVOICE_DETAIL','Revenue_ID','REV_TOTAL');eq(row(conflict).proposedRevenueStatus,null);ok(row(conflict).scopeReservations.length);ok(row(conflict,'REV_TOTAL').reasons.includes('UNRESOLVED_CURRENT_LINE_REFERENCE'));
// Missing Invoice_ID and missing Revenue_ID together cannot release the service.
const orphan=fixture();changeRevenueCapture(orphan,'49_INVOICE_DETAIL',1,'Invoice_ID','MISSING');changeRevenueCapture(orphan,'49_INVOICE_DETAIL',1,'Revenue_ID','MISSING');const or=revenueBillingPlan(...input(orphan));ok(row(or).scopeReservations.some(s=>s.reason==='UNKNOWN_INVOICE_PARENT_WITH_SAME_SERVICE_NO_SCOPE_PROOF'));
const dup=fixture(),dc=dup.find(e=>e.data.sheets[0].properties.title==='40_MONTHLY_REVENUE'),ds=dc.data.sheets[0];ds.data[0].rowData.push(structuredClone(ds.data[0].rowData[2]));ds.properties.gridProperties.rowCount++;dc.requestedRange="'40_MONTHLY_REVENUE'!A1:U4";const du=revenueBillingPlan(...input(dup));eq(du.rows.filter(r=>r.source.legacyId==='REV_CHILD').length,2);ok(du.rows.filter(r=>r.source.legacyId==='REV_CHILD').every(r=>r.proposedRevenueStatus===null&&r.reasons.includes('UNRESOLVED_CURRENT_LINE_REFERENCE')));
// Both duplicate detail coverage and two invoices stay held, never sum receipts.
for(const secondInvoice of [false,true]){
 const c=fixture(),s=c.find(e=>e.data.sheets[0].properties.title==='49_INVOICE_DETAIL').data.sheets[0];s.data[0].rowData.push(structuredClone(s.data[0].rowData[1]));s.properties.gridProperties.rowCount++;c.find(e=>e.data.sheets[0].properties.title==='49_INVOICE_DETAIL').requestedRange="'49_INVOICE_DETAIL'!A1:I3";changeRevenueCapture(c,'49_INVOICE_DETAIL',2,'Invoice_Detail_ID','LINE2');
 if(secondInvoice){const e=c.find(e=>e.data.sheets[0].properties.title==='48_INVOICE_HEADER'),h=e.data.sheets[0];h.data[0].rowData.push(structuredClone(h.data[0].rowData[1]));h.properties.gridProperties.rowCount++;e.requestedRange="'48_INVOICE_HEADER'!A1:Q3";for(const [f,v] of [['Invoice_ID','INV2'],['Invoice_Number','TEST2'],['Business_Key','BIZ2']])changeRevenueCapture(c,'48_INVOICE_HEADER',2,f,v);changeRevenueCapture(c,'49_INVOICE_DETAIL',2,'Invoice_ID','INV2');}
 const p=revenueBillingPlan(...input(c));eq(row(p).proposedRevenueStatus,null);ok(row(p).reasons.includes(secondInvoice?'MULTIPLE_CURRENT_INVOICE_CANDIDATES':'REPEATED_REVENUE_LINE_COVERAGE'));
}
console.log(`Historical revenue billing bridge: ${n} assertions passed`);
