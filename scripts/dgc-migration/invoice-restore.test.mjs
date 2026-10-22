import assert from 'node:assert/strict';
import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {invoiceRestorePlan,verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {rehearseInvoiceRestore} from './invoice-rehearsal.mjs';
import {canonical,digest} from './core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},ok=v=>{assert.ok(v);n++;},fail=(fn,re)=>{assert.throws(fn,re);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
for(const status of ['Paid','Issued','Partially Paid','Overdue']){
 const inputs=invoiceRestoreInputs(status),before=canonical(inputs),p=invoiceRestorePlan(...inputs),e=p.entries[0];eq(e.state,'CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL');eq(e.invoice.proposedOperationalStatus,({Paid:'PAID',Issued:'ISSUED','Partially Paid':'PARTIALLY_PAID',Overdue:'ISSUED'})[status]);eq(JSON.parse(e.capturedHeaderJson).values.Status,status);eq(e.invoice.safeTrialStatus,'CANCELLED');eq(e.invoice.safeTrialIsCurrent,false);eq(e.invoice.issuedAt,null);eq(e.invoice.issuedById,null);eq(e.invoice.invoiceDate,'2026-02-01');eq(e.invoice.dueDate,'2026-03-18');eq(e.receivable.originalAmount,'90');eq(e.receivable.safeTrialStatus,'CANCELLED');eq(e.scopes[0].items.length,1);eq(e.scopes[0].items[0].source.legacyId,'REV_TOTAL');eq(e.paymentRestorePolicy,'CANONICAL_SOURCE_EVIDENCE_ONLY_NO_APPROVED_PAYMENT_ROWS');eq(JSON.parse(e.capturedHeaderJson).values.Created_At,46245.657010740746);eq(e.localApprovalCreated,false);eq(e.readyToImport,false);eq(p.filesVerified,false);eq(p.postingAllowed,false);eq(p.acceptance,false);eq(p.historicalCashPosting,false);eq(canonical(inputs),before);eq(verifyInvoiceRestorePlan(p,...inputs),p);
}
for(const [status,state] of [['Draft','DRAFT_RESTORE_DEFERRED_NO_AR'],['Cancelled','ARCHIVE_SEPARATE_NO_CURRENT_AR'],['Superseded','ARCHIVE_SEPARATE_NO_CURRENT_AR']]){const p=invoiceRestorePlan(...invoiceRestoreInputs(status));eq(p.entries[0].state,state);eq(p.entries[0].receivable,null);eq(p.entries[0].invoice,null);}
const inputs=invoiceRestoreInputs(),p=invoiceRestorePlan(...inputs),bad=structuredClone(p);bad.entries[0].invoice.paidAmount='0';fail(()=>verifyInvoiceRestorePlan(bad,...inputs),/checksum/);const {planHash,...body}=bad;bad.planHash=digest(body);fail(()=>verifyInvoiceRestorePlan(bad,...inputs),/pinned source/);
fail(()=>invoiceRestorePlan(...[...inputs.slice(0,5),'0'.repeat(64)]),/Pinned/);
for(const mutate of [m=>m.files.pop(),m=>m.files.push(m.files[0]),m=>m.files[0].fileId='X'.repeat(25),m=>m.files[0].rowHash='0'.repeat(64),m=>m.files[0].relativePath='../bad.pdf',m=>m.files[0].size=64*1024*1024+1]){const m=structuredClone(inputs[4]);mutate(m);const {manifestHash,...b}=m;m.manifestHash=digest(b);fail(()=>invoiceRestorePlan(...[...inputs.slice(0,4),m,m.manifestHash]),/coverage|metadata/);}
for(const [sheet,field,value,reason] of [
 ['48_INVOICE_HEADER','Payment_Due_Date','unknown','UNRESOLVED_SOURCE_Payment_Due_Date'],
 ['48_INVOICE_HEADER','Payment_Due_Date','2026-01-01','SOURCE_INVOICE_DATE_ORDER_CONFLICT'],
 ['48_INVOICE_HEADER','Needs_Regeneration',true,'REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW'],
 ['48_INVOICE_HEADER','Paid_Amount_USD',89.99,'CAPTURED_FINANCE_REQUIRES_REVIEW'],
 ['49_INVOICE_DETAIL','Revenue_ID','MISSING','SCOPE_BINDING_REQUIRES_REVIEW'],
 ['50_AR_AP','Is_Current',false,'CURRENT_AR_NOT_UNIQUE'],
 ['40_MONTHLY_REVENUE','Status','Draft','REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD']]){const x=invoiceRestoreInputs('Paid',(c,change)=>change(sheet,field,value)),r=invoiceRestorePlan(...x);eq(r.entries[0].state,'RESTORE_HELD');ok(r.entries[0].reasons.includes(reason));}
const review=structuredClone(inputs[2]);review.groups[0].state='EVIDENCE_REVIEW_HELD';const {reviewHash,...rb}=review;review.reviewHash=digest(rb);eq(invoiceRestorePlan(...[inputs[0],inputs[1],review,review.reviewHash,...inputs.slice(4)]).entries[0].state,'RESTORE_HELD');
const saved=process.env.DATABASE_URL;try{
 process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55555/dgc_migration_staging_never_connect_synthetic';
 const options={snapshot:inputs[0],targetPlan:inputs[1],combined:inputs[2],reviewPin:inputs[3],manifest:inputs[4],manifestPin:inputs[5],restorePlan:p,companyId:'not-used',root:'not-read'};
 await reject(()=>rehearseInvoiceRestore({}, {...options,sourceRows:[999]}),/held/);await reject(()=>rehearseInvoiceRestore({}, {...options,sourceRows:[2,2]}),/unique/);
 const draftInputs=invoiceRestoreInputs('Draft'),draft=invoiceRestorePlan(...draftInputs);await reject(()=>rehearseInvoiceRestore({}, {...options,snapshot:draftInputs[0],targetPlan:draftInputs[1],combined:draftInputs[2],reviewPin:draftInputs[3],manifest:draftInputs[4],manifestPin:draftInputs[5],restorePlan:draft,sourceRows:[2]}),/held/);
 process.env.DATABASE_URL='postgresql://unused@remote.example/dgc_migration_staging_bad';await reject(()=>rehearseInvoiceRestore({},options),/dedicated local/);
}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
console.log(`Invoice restore blueprint and trial guards: ${n} assertions passed`);
