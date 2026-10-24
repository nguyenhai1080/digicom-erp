import {canonical,digest} from './core.mjs';import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';import {verifyInvoiceFiles} from './invoice-files.mjs';import {reviewChildNative} from './child-native.mjs';import {withSourcePlanningCache} from './planning-context.mjs';
const same=(a,b)=>canonical(a)===canonical(b);
// Pure proposal helper; every writer must use the async byte-verifying planner.
export function childInvoiceProposal(i,review){
 verifyInvoiceRestorePlan(i.restorePlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions);
 if(review.snapshotHash!==i.snapshot.snapshotHash||review.targetPlanHash!==i.targetPlan.planHash||review.childReviewHash!==i.combined.inputPins?.child)throw Error('Child Invoice evidence binding differs');
 const entries=i.restorePlan.entries.filter(e=>e.state==='RESTORE_HELD'&&same(e.reasons,['REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD'])).map(original=>{
  const reasons=[],proofs=[];for(const key of original.revenueGroupKeys){const g=i.targetPlan.groups.find(g=>g.groupKey===key),c=i.combined.groups.find(g=>g.groupKey===key);if(g?.state!=='REHEARSABLE')reasons.push('OTHER_SOURCE_BUSINESS_HOLD');if(c?.state==='EVIDENCE_CLEAR_FOR_NEXT_REVIEW')continue;if(!same(c?.reasons,['PRINTED_CHILD_OR_CAPTURED_USD_LINK_UNVERIFIED'])){reasons.push('OTHER_SOURCE_PDF_OR_LIFECYCLE_HOLD');continue;}
   for(const row of c.rows.filter(r=>r.childState&&r.childState!=='PRINTED_CHILD_AND_CAPTURED_USD_LINK_MATCH')){const p=review.entries.find(e=>same(e.source,row.source)),entry=g.entries.find(e=>same(e.source,row.source));if(!p||p.state!=='CHILD_NATIVE_FALLBACK_BOUND'||!same(p.sourceDetail,entry?.bindings.Source_Recon_Detail_ID))reasons.push('CHILD_NATIVE_SOURCE_NOT_CHARACTERIZED');else proofs.push(p);}
  }
  if(!proofs.length)reasons.push('NO_BOUND_CHILD_NATIVE_EXCEPTION');
  const evidence={format:'DGC_CHILD_NATIVE_FALLBACK_REHEARSAL_V1',snapshotHash:i.snapshot.snapshotHash,reviewHash:review.reviewHash,source:original.source,originalStrictReasons:original.reasons,children:proofs,usdPrintedOnChild:false,pdfAuthorRoundingPolicyProven:false,sourceValuesChanged:false,operationalUseAllowed:false,postingAllowed:false,acceptance:false};
  return {...original,originalState:original.state,originalReasons:original.reasons,state:reasons.length?'CHILD_NATIVE_INVOICE_HELD':'CHILD_NATIVE_INVOICE_CANDIDATE',reasons:[...new Set(reasons)],childNativeEvidence:evidence,readyToImport:false};
 });
 const body={format:'dgc-child-native-invoice-plan-v1',snapshotHash:i.snapshot.snapshotHash,sourceRestorePlanHash:i.restorePlan.planHash,childNativeReviewHash:review.reviewHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export async function invoiceChildNativePlan(o){return withSourcePlanningCache(async()=>{const i=o.invoiceOptions,review=await reviewChildNative({...o.childNativeOptions,snapshot:i.snapshot,targetPlan:i.targetPlan,decisions:i.decisions});if(review.reviewHash!==o.childNativeOptions.reviewPin)throw Error('Child/native characterization pin differs');await verifyInvoiceFiles(i.snapshot,i.manifest,i.root);return childInvoiceProposal(i,review);});}
