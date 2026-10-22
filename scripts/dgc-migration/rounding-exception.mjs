import {createRequire} from 'node:module';
import {canonical,digest} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {verifyDonorRoundingReview} from './donor-rounding.mjs';
import {revenueLifecyclePlan} from './revenue-lifecycle.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),key=s=>s.sheet+'|'+s.sourceRow;
export function capturedRoundingEvidence(snapshotHash,entry,characterized,reviewHash){
 const v=entry.capturedInvoiceUsd,components={revenue:v.Invoice_Revenue_USD,wht:v.Invoice_WHT_USD,payable:v.Invoice_Payable_USD};
 return {format:'DGC_CAPTURED_ROUNDING_EXCEPTION_V1',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash,source:entry.source,sourceDocument:characterized.sourceHeader,sourceDetail:characterized.sourceDetail,characterizationReviewHash:reviewHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components,identityDelta:D(components.payable).minus(D(components.revenue).minus(components.wht)).toFixed(),sourceValuesChanged:false,operationalFxDerived:false,gateOverrideAllowed:false,acceptance:false};
}
export function roundingExceptionPlan(snapshot,target,combined,combinedPin,rounding,roundingPin,decisions){
 verifyRevenueTargetPlan(target,snapshot,decisions);revenueLifecyclePlan(snapshot,target,combined,combinedPin,decisions);
 if(!/^[a-f0-9]{64}$/.test(roundingPin??'')||rounding.reviewHash!==roundingPin)throw Error('Pinned rounding characterization differs');verifyDonorRoundingReview(rounding,snapshot,decisions);
 const chars=new Map(rounding.revenues.map(e=>[key(e.source),e])),evidence=new Map(combined.groups.map(g=>[g.groupKey,g]));
 const groups=target.groups.map(g=>{
  const c=evidence.get(g.groupKey),reasons=[];
  if(g.state!=='HELD'||canonical(g.reasons)!==canonical(['REVENUE_REQUIRES_REVIEW']))reasons.push('NOT_SOLE_CAPTURED_ROUNDING_BUSINESS_HOLD');
  if(c.state!=='EVIDENCE_REVIEW_HELD'||canonical(c.reasons)!==canonical(['BUSINESS_HELD']))reasons.push('OTHER_PDF_OR_LIFECYCLE_EVIDENCE_HOLD');
  const entries=g.entries.map(e=>{
   const r=chars.get(key(e.source));if(!r||canonical(r.source)!==canonical(e.source))throw Error('Rounding physical source coverage differs');
   const characterized=r.state==='DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED';
   if(!['CAPTURED_USD_IDENTITY_MATCH','DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED'].includes(r.state)||r.sourceIssueCodes.length||r.otherCheckCodes.length)reasons.push('OTHER_REVENUE_SOURCE_OR_NATIVE_ISSUE');
   return {source:e.source,characterizationState:r.state,exceptionEvidence:characterized?capturedRoundingEvidence(snapshot.snapshotHash,e,r,roundingPin):null};
  });
  if(!entries.some(e=>e.exceptionEvidence))reasons.push('NO_CHARACTERIZED_ROUNDING_EXCEPTION');
  return {groupKey:g.groupKey,originalBusinessState:g.state,originalBusinessReasons:g.reasons,originalEvidenceState:c.state,originalEvidenceReasons:c.reasons,entries,state:reasons.length?'SHAPE_TRIAL_HELD':'CAPTURED_ROUNDING_SHAPE_TRIAL_CANDIDATE',reasons:[...new Set(reasons)],readyToImport:false,operationalUseAllowed:false};
 });
 const body={format:'dgc-rounding-exception-shape-plan-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:target.planHash,combinedReviewHash:combinedPin,roundingReviewHash:roundingPin,groups,counts:groups.reduce((a,g)=>(a[g.state]=(a[g.state]??0)+1,a),{}),postingAllowed:false,acceptance:false,readyToImport:false,originalGatesUnchanged:true,commitAllowed:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export function verifyRoundingExceptionPlan(plan,...inputs){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(roundingExceptionPlan(...inputs)))throw Error('Rounding exception plan differs from pinned source');return plan;}
