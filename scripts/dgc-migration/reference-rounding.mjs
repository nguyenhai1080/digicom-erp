import {canonical,digest} from './core.mjs';
import {verifyReferenceRegistrationPlan} from './reference-registration.mjs';
import {verifyInvoiceRoundingPlan} from './invoice-rounding.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
const key=s=>s.sheet+'|'+s.sourceRow;

// Only dependency closure for a rollback trial; source Approved packages remain
// DRAFT evidence. No donor approval/auto-issue function is executed.
export async function referenceRoundingPlan(options){
 return withSourcePlanningCache(()=>buildReferenceRoundingPlan(options));
}
async function buildReferenceRoundingPlan(options){
 const {registrationPlan:original,invoiceOptions:i,invoiceExceptionPlan:rounding}=options;
 await verifyReferenceRegistrationPlan(original,options);verifyInvoiceRoundingPlan(rounding,options);
 const strict=new Map(i.restorePlan.entries.map(e=>[key(e.source),e])),extra=new Map(rounding.entries.map(e=>[key(e.source),e]));
 const documents=original.documents.map(d=>{
  const dependencies=d.dependencies.map(dep=>{const s=strict.get(key(dep.source)),r=extra.get(key(dep.source)),same=e=>e&&canonical(e.source)===canonical(dep.source);return {source:dep.source,originalState:dep.state,state:same(s)&&s.state==='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL'?'STRICT_INVOICE_SHAPE':same(r)&&r.state==='INVOICE_ROUNDING_SHAPE_CANDIDATE'?'ROUNDING_INVOICE_SHAPE':'INVOICE_SHAPE_HELD'};});
  const reasons=d.reasons.filter(r=>r!=='WHOLE_DOCUMENT_INVOICE_SET_NOT_REHEARSABLE');
  if(!dependencies.length)reasons.push('NO_CAPTURED_INVOICE_REFERENCES');
  if(dependencies.some(d=>d.state==='INVOICE_SHAPE_HELD'))reasons.push('WHOLE_DOCUMENT_INVOICE_SHAPES_HELD');
  if(!dependencies.some(d=>d.state==='ROUNDING_INVOICE_SHAPE'))reasons.push('NO_ROUNDING_INVOICE_DEPENDENCY');
  return {...d,originalRegistrationState:d.state,originalRegistrationReasons:d.reasons,dependencies,state:reasons.length?'REFERENCE_ROUNDING_SHAPE_HELD':'WHOLE_DOCUMENT_ROUNDING_SHAPE_CANDIDATE',reasons:[...new Set(reasons)],readyToRegister:false,operationalDocumentStatus:null,safeTrialDocumentStatus:'DRAFT'};
 });
 const body={format:'dgc-reference-rounding-shape-plan-v1',snapshotHash:i.snapshot.snapshotHash,originalRegistrationPlanHash:original.planHash,invoiceRoundingPlanHash:rounding.planHash,referenceManifestHash:options.referenceManifestPin,documents,counts:documents.reduce((a,d)=>(a[d.state]=(a[d.state]??0)+1,a),{}),mode:'BLOCKED_SHAPE_TRIAL_ONLY',originalGatesUnchanged:true,registryCommitAllowed:false,postingAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export async function verifyReferenceRoundingPlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await referenceRoundingPlan(options)))throw Error('Reference rounding shape plan differs from pinned evidence');return plan;}
