import {canonical,digest} from './core.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {reviewChildNative} from './child-native.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
const same=(a,b)=>canonical(a)===canonical(b);

// Pure diagnostic helper, never an authorization boundary. Its caller must
// rederive the old plans and fresh child PDF proof before selecting any group.
export function compoundChildGroup(g,c,x,review){
 const reasons=[],children=[];
 const sourceOnly=g?.state==='REHEARSABLE'&&same(g.reasons,[]);
 const rounded=g?.state==='HELD'&&same(g.reasons,['REVENUE_REQUIRES_REVIEW'])&&same(x?.reasons,['OTHER_PDF_OR_LIFECYCLE_EVIDENCE_HOLD']);
 if(!sourceOnly&&!rounded)reasons.push('OTHER_SOURCE_BUSINESS_OR_ROUNDING_HOLD');
 if(c?.state!=='EVIDENCE_REVIEW_HELD'||!same(c.reasons,sourceOnly?['PRINTED_CHILD_OR_CAPTURED_USD_LINK_UNVERIFIED']:['BUSINESS_HELD','PRINTED_CHILD_OR_CAPTURED_USD_LINK_UNVERIFIED']))reasons.push('OTHER_SOURCE_PDF_OR_LIFECYCLE_HOLD');
 for(const row of c?.rows??[]){if(!row.childState||row.childState==='PRINTED_CHILD_AND_CAPTURED_USD_LINK_MATCH')continue;
  const p=review.entries.find(e=>same(e.source,row.source)),entry=g?.entries.find(e=>same(e.source,row.source));
  if(!p||p.state!=='CHILD_NATIVE_FALLBACK_BOUND'||!same(p.sourceDetail,entry?.bindings.Source_Recon_Detail_ID))reasons.push('CHILD_NATIVE_SOURCE_NOT_CHARACTERIZED');else children.push(p);
 }
 if(!children.length)reasons.push('NO_BOUND_CHILD_NATIVE_EXCEPTION');
 return {groupKey:g?.groupKey,state:reasons.length?'COMPOUND_CHILD_GROUP_HELD':'COMPOUND_CHILD_GROUP_CANDIDATE',reasons:[...new Set(reasons)],originalBusinessState:g?.state,originalBusinessReasons:g?.reasons,originalEvidenceReasons:c?.reasons,originalRoundingReasons:x?.reasons,children};
}

// V1 arithmetic is unchanged. Only the exact, separately verified child/native
// dependency can be explained here; missing bytes, native identities and other
// business/lifecycle holds remain held in both the old and new plans.
export function childRoundingProposal(o,review){
 const i=o.invoiceOptions,base=invoiceRoundingPlan(o);
 if(review.snapshotHash!==i.snapshot.snapshotHash||review.targetPlanHash!==i.targetPlan.planHash||review.childReviewHash!==i.combined.inputPins?.child)throw Error('Compound child evidence binding differs');
 const scopes=revenueScopePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions);
 const entries=base.entries.filter(e=>same(e.reasons,['WHOLE_INVOICE_SOURCE_GROUPS_HELD'])).map(e=>{
  const groups=e.dependencies.filter(d=>d.state==='SOURCE_GROUP_HELD').map(d=>compoundChildGroup(i.targetPlan.groups.find(g=>g.groupKey===d.groupKey),i.combined.groups.find(g=>g.groupKey===d.groupKey),o.exceptionPlan.groups.find(g=>g.groupKey===d.groupKey),review));
  const reasons=groups.some(g=>g.state!=='COMPOUND_CHILD_GROUP_CANDIDATE')?['WHOLE_COMPOUND_SOURCE_SET_HELD']:[];
  if(!groups.length)reasons.push('NO_COMPOUND_SOURCE_DEPENDENCY');
  const c=o.rounding.invoices.find(x=>same(x.source,e.source)),scope=scopes.invoices.find(x=>same(x.source,e.source));
  const lines=c.lines.map(l=>({source:l.source,revenueSource:l.revenueSource,totalSource:scope.lineMappings.find(m=>same(m.detailSource,l.source)).totalSource,components:Object.fromEntries(l.checks.map(c=>[({Revenue_USD:'revenue',WHT_USD:'wht',Payable_USD:'payable'})[c.field],c.actual])),identityDelta:o.rounding.revenues.find(r=>same(r.source,l.revenueSource)).capturedUsdIdentity.difference}));
  const invoiceRounding={format:'DGC_CAPTURED_INVOICE_ROUNDING_V1',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:i.snapshot.snapshotHash,source:e.source,sourceRestorePlanHash:i.restorePlan.planHash,characterizationReviewHash:o.roundingPin,revenueExceptionPlanHash:o.exceptionPlan.planHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components:{revenue:e.invoice.revenueAmount,wht:e.invoice.whtAmount,payable:e.invoice.payableAmount},identityDelta:c.headerCheck.difference,characterizedLineDelta:c.characterizedLineDelta,lines,sourceReceivable:e.receivable.source,sourceValuesChanged:false,historicalCashPosting:false,localApprovalCreated:false,acceptance:false};
  const childNativeEvidence={format:'DGC_CHILD_NATIVE_ROUNDING_REHEARSAL_V1',snapshotHash:i.snapshot.snapshotHash,reviewHash:review.reviewHash,source:e.source,originalInvoiceRoundingPlanHash:base.planHash,originalRoundingReasons:e.reasons,groups,usdPrintedOnChild:false,pdfAuthorRoundingPolicyProven:false,sourceValuesChanged:false,operationalUseAllowed:false,postingAllowed:false,acceptance:false};
  return {...e,originalRoundingState:e.state,originalRoundingReasons:e.reasons,state:reasons.length?'CHILD_ROUNDING_INVOICE_HELD':'CHILD_ROUNDING_INVOICE_CANDIDATE',reasons,invoiceRounding:reasons.length?null:invoiceRounding,childNativeEvidence,readyToImport:false};
 });
 const body={format:'dgc-child-native-rounding-invoice-plan-v1',snapshotHash:i.snapshot.snapshotHash,originalInvoiceRoundingPlanHash:base.planHash,childNativeReviewHash:review.reviewHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export async function invoiceChildRoundingPlan(o){return withSourcePlanningCache(async()=>{
 if(!o.childNativeOptions)throw Error('Fresh pinned child/native options required');
 const i=o.invoiceOptions,review=await reviewChildNative({...o.childNativeOptions,snapshot:i.snapshot,targetPlan:i.targetPlan,decisions:i.decisions});
 if(review.reviewHash!==o.childNativeOptions.reviewPin)throw Error('Compound child review pin differs');
 await verifyInvoiceFiles(i.snapshot,i.manifest,i.root);return childRoundingProposal(o,review);
});}
