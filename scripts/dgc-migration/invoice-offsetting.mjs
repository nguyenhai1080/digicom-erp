import {createRequire} from 'node:module';
import {canonical,digest} from './core.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),D=v=>new Prisma.Decimal(v);

// An exact header does not erase independently rounded presentation lines.
// Separate profile/metadata: keep every prior gate and V1 plan unchanged.
export function invoiceOffsettingPlan(options){return withSourcePlanningCache(()=>{
 const base=invoiceRoundingPlan(options),{invoiceOptions:i,rounding,roundingPin,exceptionPlan}=options,scopes=revenueScopePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions);
 const entries=base.entries.map(e=>{
  const c=rounding.invoices.find(x=>canonical(x.source)===canonical(e.source)),scope=scopes.invoices.find(x=>canonical(x.source)===canonical(e.source)),reasons=[];
  if(canonical(e.reasons)!==canonical(['HEADER_LINE_ROUNDING_NOT_CHARACTERIZED']))reasons.push('OTHER_INVOICE_SOURCE_SCOPE_OR_FINANCIAL_HOLD');
  if(c?.state!=='CAPTURED_HEADER_IDENTITY_MATCH'||c.headerCheck?.state!=='MATCH'||c.headerCheck?.difference!=='0'||!c.headerAndLineDeltaReconcile||c.characterizedLineDelta!=='0'||c.otherChecks.length||c.issues.length)reasons.push('HEADER_OR_LINE_TOTAL_NOT_EXACT');
  const lines=(c?.lines??[]).map(l=>{const rv=rounding.revenues.find(r=>l.revenueSource&&canonical(r.source)===canonical(l.revenueSource)),mapping=scope.lineMappings?.find(m=>canonical(m.detailSource)===canonical(l.source));return {source:l.source,revenueSource:l.revenueSource,totalSource:mapping?.totalSource??null,components:Object.fromEntries(l.checks.map(c=>[({Revenue_USD:'revenue',WHT_USD:'wht',Payable_USD:'payable'})[c.field],c.actual])),identityDelta:rv?.capturedUsdIdentity.difference??null};});
  if(!lines.some(l=>l.identityDelta!==null&&D(l.identityDelta).gt(0))||!lines.some(l=>l.identityDelta!==null&&D(l.identityDelta).lt(0)))reasons.push('NO_OPPOSING_CHARACTERIZED_LINE_DELTAS');
  if(lines.some(l=>!l.totalSource||l.identityDelta===null))reasons.push('INCOMPLETE_SOURCE_LINE_BINDING');
  const candidate=!reasons.length;
  const invoiceRounding=candidate?{format:'DGC_CAPTURED_INVOICE_ROUNDING_V2',headerArithmetic:'OFFSETTING_CHARACTERIZED_LINE_DELTAS',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:i.snapshot.snapshotHash,source:e.source,sourceRestorePlanHash:i.restorePlan.planHash,characterizationReviewHash:roundingPin,revenueExceptionPlanHash:exceptionPlan.planHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components:{revenue:e.invoice.revenueAmount,wht:e.invoice.whtAmount,payable:e.invoice.payableAmount},identityDelta:'0',characterizedLineDelta:'0',lines,sourceReceivable:e.receivable.source,sourceValuesChanged:false,historicalCashPosting:false,localApprovalCreated:false,acceptance:false}:null;
  return {...e,originalRoundingState:e.state,originalRoundingReasons:e.reasons,state:candidate?'INVOICE_OFFSETTING_SHAPE_CANDIDATE':'INVOICE_OFFSETTING_SHAPE_HELD',reasons,invoiceRounding,readyToImport:false};
 });
 const body={format:'dgc-invoice-offsetting-shape-plan-v1',snapshotHash:i.snapshot.snapshotHash,originalRoundingPlanHash:base.planHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,postingAllowed:false,acceptance:false,commitAllowed:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
});}
export function verifyInvoiceOffsettingPlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(invoiceOffsettingPlan(options)))throw Error('Invoice offsetting shape plan differs from pinned source');return plan;}
