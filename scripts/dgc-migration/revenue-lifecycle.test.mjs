import assert from 'node:assert/strict';
import {revenueCaptures,changeRevenueCapture} from './revenue-fixtures.mjs';
import {normalizeCapture,canonical,digest} from './core.mjs';
import {cell} from './fixtures.mjs';
import {revenueTargetPlan} from './revenue-target.mjs';
import {reconLifecycleReview} from './recon-lifecycle.mjs';
import {revenueLifecyclePlan} from './revenue-lifecycle.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},fail=(fn,re)=>{assert.throws(fn,re);n++;};
function fixture(){
 const c=revenueCaptures(),sheet=name=>c.find(e=>e.data.sheets[0].properties.title===name).data.sheets[0];
 changeRevenueCapture(c,'43_RECON_PDF_HEADER',1,'Status','Cancelled');changeRevenueCapture(c,'40_MONTHLY_REVENUE',1,'Include_In_Monthly_Total','N');for(const i of [1,2])changeRevenueCapture(c,'41_RECONCILIATION',i,'Status','Cancelled');
 for(const name of ['43_RECON_PDF_HEADER','40_MONTHLY_REVENUE','41_RECONCILIATION','44_RECON_PDF_DETAIL']){
  const s=sheet(name),e=c.find(e=>e.data.sheets[0].properties.title===name),headers=s.data[0].rowData[0].values.map(c=>c.effectiveValue.stringValue),copies=s.data[0].rowData.slice(1).map(r=>structuredClone(r));
  for(const r of copies){const values=r.values.map(c=>c.effectiveValue.stringValue??c.effectiveValue.numberValue??c.effectiveValue.boolValue),set=(field,v)=>{const i=headers.indexOf(field);if(i>=0)values[i]=v;};
   if(name==='43_RECON_PDF_HEADER'){set('Recon_Doc_ID','DOC_NEW');set('Status','Approved');}
   else if(name==='40_MONTHLY_REVENUE'){set('Revenue_ID',values[0]+'_NEW');set('Source_Recon_Doc_ID','DOC_NEW');set('Source_Recon_Detail_ID',values[headers.indexOf('Source_Recon_Detail_ID')]+'_NEW');if(values[headers.indexOf('Revenue_Row_Type')]==='Total')set('Include_In_Monthly_Total','Y');}
   else if(name==='41_RECONCILIATION'){set('Recon_ID',values[0]+'_NEW');set('Revenue_ID',values[headers.indexOf('Revenue_ID')]+'_NEW');set('Status','Approved');}
   else{set('Recon_Detail_ID',values[0]+'_NEW');set('Recon_Doc_ID','DOC_NEW');}
   s.data[0].rowData.push({values:values.map(cell)});
  }
  if(name==='40_MONTHLY_REVENUE'){headers.push('Approved_By','Approved_At');s.data[0].rowData[0].values=headers.map(cell);for(const r of s.data[0].rowData.slice(1))r.values.push(cell('legacy@example.invalid'),cell(46245.657010740746));}
  s.properties.gridProperties={rowCount:s.data[0].rowData.length,columnCount:headers.length};let col='',i=headers.length;while(i){col=String.fromCharCode(65+(i-1)%26)+col;i=Math.floor((i-1)/26);}e.requestedRange=`'${name}'!A1:${col}${s.data[0].rowData.length}`;
 }
 return c;
}
function input(c=fixture()){
 const snapshot=normalizeCapture(c),plan=revenueTargetPlan(snapshot),lifecycle=reconLifecycleReview(snapshot),old=plan.groups.find(g=>g.documentSource.legacyId==='DOC'),next=plan.groups.find(g=>g.documentSource.legacyId==='DOC_NEW');
 const body={format:'dgc-recon-combined-evidence-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:plan.planHash,postingAllowed:false,acceptance:false,readyToImport:false,groups:plan.groups.map(g=>({groupKey:g.groupKey,businessState:g.state,documentSource:g.documentSource,state:g.state==='HELD'?'EVIDENCE_REVIEW_HELD':'EVIDENCE_CLEAR_FOR_NEXT_REVIEW',rows:g.entries.map(e=>({source:e.source})),readyToImport:false})),lifecycle,replacementAudit:{events:[{source:{sheet:'12_SYS_AUDIT_LOG',sourceRow:5},oldDocumentSource:old.documentSource,replacementDocumentSource:next.documentSource,state:'SOURCE_REPLACEMENT_EVENT_BOUND',explicitSourceReplacementObserved:true}]}};
 const combined={...body,reviewHash:digest(body)};return {snapshot,plan,combined,old,next};
}
const i=input(),run=(x=i,review=x.combined,pin=review.reviewHash)=>revenueLifecyclePlan(x.snapshot,x.plan,review,pin),rehash=r=>{const {reviewHash,...b}=r;return {...b,reviewHash:digest(b)};};
const r=run(),old=r.groups.find(g=>g.groupKey===i.old.groupKey),next=r.groups.find(g=>g.groupKey===i.next.groupKey);
eq(r.proposedRevisionEdges,1);eq(r.proposedRevenueRevisionEdges,2);eq(r.revisionGraphIssues,[]);eq(old.proposedReconciliationStatus,'SUPERSEDED');eq(next.proposedReconciliationStatus,'APPROVED');eq(old.capturedChainOrdinal,1);eq(next.capturedChainOrdinal,2);eq(next.supersedesGroupKey,old.groupKey);eq(next.logicalSourceFamilyKey,old.logicalSourceFamilyKey);eq(next.rows[0].logicalSourceFamilyKey,old.rows[0].logicalSourceFamilyKey);
eq(old.rows.map(x=>x.proposedRevenueStatus),['SUPERSEDED','SUPERSEDED']);eq(next.rows.map(x=>x.proposedRevenueStatus),[null,null]);eq(next.rows.every(x=>x.proposedStateReason==='INVOICE_PAYMENT_AR_MAPPING_REQUIRED'),true);eq(old.rows[0].sourceIncludeInMonthlyTotal,false);eq(next.rows[0].sourceIncludeInMonthlyTotal,true);
const captured=JSON.parse(next.rows[0].capturedRevenueJson);eq(captured.values.Approved_By,'legacy@example.invalid');eq(captured.values.Approved_At,46245.657010740746);eq(digest({values:captured.values,cells:captured.cells}),captured.rowHash);eq(next.localApprovedById,null);eq(next.localApprovedAt,null);eq(next.safeRehearsalStatus,'BLOCKED');eq(next.safeRehearsalIsCurrent,false);eq(next.historicalTimestampTimezoneAssumed,false);eq(r.postingAllowed,false);eq(r.readyToImport,false);eq(r.historicalCashPosting,false);eq(r.recomputeAmounts,false);
fail(()=>run(i,i.combined,'0'.repeat(64)),/Pinned/);const changed=structuredClone(i.combined);changed.groups[0].state='changed';fail(()=>run(i,rehash(changed),i.combined.reviewHash),/Pinned/);
for(const mutate of [r=>r.groups.pop(),r=>r.groups.push(r.groups[0]),r=>r.groups[0].rows.pop(),r=>r.groups[0].readyToImport=true]){const b=structuredClone(i.combined);mutate(b);const v=rehash(b);fail(()=>run(i,v,v.reviewHash),/coverage|missing/);}
const none=structuredClone(i.combined);none.replacementAudit=null;const no=rehash(none),without=run(i,no,no.reviewHash);eq(without.proposedRevisionEdges,0);eq(without.groups.find(g=>g.groupKey===old.groupKey).proposedReconciliationStatus,null);
const repeated=structuredClone(i.combined);repeated.replacementAudit.events.push(repeated.replacementAudit.events[0]);const dup=rehash(repeated),blocked=run(i,dup,dup.reviewHash);eq(blocked.proposedRevisionEdges,0);eq(blocked.revisionGraphIssues.includes('MULTIPLE_SUCCESSORS_OR_DUPLICATE_EDGE'),true);eq(blocked.revisionGraphIssues.includes('TARGET_SINGLE_PREDECESSOR_LIMIT'),true);
eq(blocked.revisionMappings[0].state,'SOURCE_REVISION_MAPPING_REQUIRES_REVIEW');
const cycle=structuredClone(i.combined),event=cycle.replacementAudit.events[0];cycle.replacementAudit.events.push({...event,oldDocumentSource:event.replacementDocumentSource,replacementDocumentSource:event.oldDocumentSource});const cyclic=rehash(cycle),cp=run(i,cyclic,cyclic.reviewHash);eq(cp.proposedRevisionEdges,0);eq(cp.revisionGraphIssues.includes('SOURCE_REVISION_CYCLE'),true);
const mismatch=fixture();changeRevenueCapture(mismatch,'40_MONTHLY_REVENUE',4,'Service_ID','SYNTH_SERVICE');const mi=input(mismatch),bad=run(mi);eq(bad.proposedRevisionEdges,0);eq(bad.revisionMappings[0].issues.includes('REVISION_ROW_SCOPE_NOT_ONE_TO_ONE'),true);
for(const [status,expected] of [['Draft','DRAFT'],['Submitted','PENDING_APPROVAL'],['Other',null]]){const c=fixture();for(const row of [3,4]){changeRevenueCapture(c,'40_MONTHLY_REVENUE',row,'Status',status);changeRevenueCapture(c,'41_RECONCILIATION',row,'Status',status);}const x=input(c),p=run(x).groups.find(g=>g.groupKey===x.next.groupKey);eq(p.proposedReconciliationStatus,expected);eq(p.rows.every(r=>r.proposedRevenueStatus===null),true);eq(p.readyToImport,false);}
console.log(`Historical revenue lifecycle proposal: ${n} assertions passed`);
