import {canonical,digest} from './core.mjs';
import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {verifyRoundingExceptionPlan} from './rounding-exception.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {revenueBillingPlan} from './revenue-billing.mjs';
import {invoiceHistoryPlan} from './invoice-history.mjs';

export function invoiceRoundingPlan({invoiceOptions:i,rounding,roundingPin,exceptionPlan}){
 verifyInvoiceRestorePlan(i.restorePlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions);
 verifyRoundingExceptionPlan(exceptionPlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,rounding,roundingPin,i.decisions);
 const scopes=revenueScopePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),billing=revenueBillingPlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),history=invoiceHistoryPlan(i.snapshot,i.decisions),allowed=new Set(['CAPTURED_FINANCE_REQUIRES_REVIEW','REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD','REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW']);
 const entries=i.restorePlan.entries.map(e=>{
  const c=rounding.invoices.find(c=>canonical(c.source)===canonical(e.source)),s=scopes.invoices.find(s=>canonical(s.source)===canonical(e.source)),reasons=[];
  if(e.state!=='RESTORE_HELD'||e.reasons.some(r=>!allowed.has(r)))reasons.push('NOT_SOLE_CAPTURED_INVOICE_ROUNDING_HOLD');
  if(c?.state!=='CAPTURED_LINE_ROUNDING_PROPAGATES_TO_HEADER')reasons.push('HEADER_LINE_ROUNDING_NOT_CHARACTERIZED');
  const h=history.entries.find(h=>canonical(h.source)===canonical(e.source));
  if(!h||h.issues.length||h.amountIssues.length||h.amountDifferences.some(d=>!['HEADER_REVENUE_MINUS_WHT','LINE_REVENUE_MINUS_WHT'].includes(d.code)))reasons.push('OTHER_CAPTURED_FINANCE_DIFFERENCE');
  if(s.issues.length||s.financialReasons.some(r=>r!=='CAPTURED_INVOICE_FINANCE_REQUIRES_REVIEW')||s.headerChecks?.some(c=>c.state!=='MATCH'))reasons.push('OTHER_SCOPE_OR_FINANCIAL_HOLD');
  const dependencies=e.revenueGroupKeys.map(k=>{
   const g=i.targetPlan.groups.find(g=>g.groupKey===k),cg=i.combined.groups.find(g=>g.groupKey===k),x=exceptionPlan.groups.find(g=>g.groupKey===k);
   return {groupKey:k,state:g?.state==='REHEARSABLE'&&cg?.state==='EVIDENCE_CLEAR_FOR_NEXT_REVIEW'?'STRICT_SOURCE_SHAPE':x?.state==='CAPTURED_ROUNDING_SHAPE_TRIAL_CANDIDATE'?'ROUNDING_SOURCE_SHAPE':'SOURCE_GROUP_HELD'};
  });
  if(!dependencies.length||dependencies.some(d=>d.state==='SOURCE_GROUP_HELD'))reasons.push('WHOLE_INVOICE_SOURCE_GROUPS_HELD');
  const lineEvidence=(c?.lines??[]).map(l=>{
   const mapping=s.lineMappings?.find(x=>canonical(x.detailSource)===canonical(l.source)),b=billing.rows.find(b=>l.revenueSource&&canonical(b.source)===canonical(l.revenueSource));
   if(!mapping?.totalSource||!b||b.reasons.some(r=>r!=='INVOICE_AMOUNTS_REQUIRE_REVIEW')||b.directCurrentLines.length!==1||canonical(b.directCurrentLines[0].invoiceSource)!==canonical(e.source)||b.directCurrentLines[0].referenceState!=='RESOLVED')reasons.push('OTHER_SOURCE_BILLING_OR_RESERVATION_HOLD');
   const r=rounding.revenues.find(r=>l.revenueSource&&canonical(r.source)===canonical(l.revenueSource));
   return {source:l.source,revenueSource:l.revenueSource,totalSource:mapping?.totalSource??null,components:Object.fromEntries(l.checks.map(c=>[({'Revenue_USD':'revenue','WHT_USD':'wht','Payable_USD':'payable'})[c.field],c.actual])),identityDelta:r?.capturedUsdIdentity.difference??null};
  });
  if(lineEvidence.length!==(s.lineMappings?.length??0))reasons.push('INCOMPLETE_CAPTURED_LINE_SET');
  const state=reasons.length?'INVOICE_ROUNDING_SHAPE_HELD':'INVOICE_ROUNDING_SHAPE_CANDIDATE';
  const invoiceRounding=state==='INVOICE_ROUNDING_SHAPE_CANDIDATE'?{format:'DGC_CAPTURED_INVOICE_ROUNDING_V1',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:i.snapshot.snapshotHash,source:e.source,sourceRestorePlanHash:i.restorePlan.planHash,characterizationReviewHash:roundingPin,revenueExceptionPlanHash:exceptionPlan.planHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components:{revenue:e.invoice.revenueAmount,wht:e.invoice.whtAmount,payable:e.invoice.payableAmount},identityDelta:c.headerCheck.difference,characterizedLineDelta:c.characterizedLineDelta,lines:lineEvidence,sourceReceivable:e.receivable.source,sourceValuesChanged:false,historicalCashPosting:false,localApprovalCreated:false,acceptance:false}:null;
  return {...e,state,originalRestoreState:e.state,originalRestoreReasons:e.reasons,reasons:[...new Set(reasons)],dependencies,invoiceRounding,readyToImport:false};
 });
 const body={format:'dgc-invoice-rounding-shape-plan-v1',snapshotHash:i.snapshot.snapshotHash,sourceRestorePlanHash:i.restorePlan.planHash,roundingReviewHash:roundingPin,revenueExceptionPlanHash:exceptionPlan.planHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,postingAllowed:false,acceptance:false,commitAllowed:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export function verifyInvoiceRoundingPlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(invoiceRoundingPlan(options)))throw Error('Invoice rounding shape plan differs from pinned source');return plan;}
