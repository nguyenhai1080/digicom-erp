import {canonical,digest} from './core.mjs';
import {verifyReferenceRegistrationPlan} from './reference-registration.mjs';
import {verifyInvoiceUnifiedPlan} from './invoice-unified.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {verifyInvoiceUnifiedNativePlan} from './native-unified.mjs';
const key=s=>s.sheet+'|'+s.sourceRow;
export async function referenceUnifiedPlan(options){return withSourcePlanningCache(async()=>{
 const invoices=verifyInvoiceUnifiedPlan(options.unifiedInvoicePlan,options);return buildReferenceUnified(options,invoices);
});}
export async function referenceUnifiedNativePlan(options){return withSourcePlanningCache(async()=>buildReferenceUnified(options,await verifyInvoiceUnifiedNativePlan(options.unifiedInvoicePlan,options)));}
async function buildReferenceUnified(options,invoices){
 const original=await verifyReferenceRegistrationPlan(options.registrationPlan,options),bySource=new Map(invoices.entries.map(e=>[key(e.source),e]));
 const documents=original.documents.map(d=>{
  const dependencies=d.dependencies.map(dep=>{const e=bySource.get(key(dep.source)),same=e&&canonical(e.source)===canonical(dep.source);return {source:dep.source,originalState:dep.state,sourceProfile:same?e.sourceProfile:null,state:same&&e.state==='UNIFIED_INVOICE_SHAPE_CANDIDATE'?'UNIFIED_INVOICE_SHAPE':'INVOICE_SHAPE_HELD'};});
  const reasons=d.reasons.filter(r=>r!=='WHOLE_DOCUMENT_INVOICE_SET_NOT_REHEARSABLE');
  if(!dependencies.length)reasons.push('NO_CAPTURED_INVOICE_REFERENCES');if(dependencies.some(d=>d.state==='INVOICE_SHAPE_HELD'))reasons.push('WHOLE_DOCUMENT_INVOICE_SHAPES_HELD');
  return {...d,originalRegistrationState:d.state,originalRegistrationReasons:d.reasons,dependencies,reasons:[...new Set(reasons)],state:reasons.length?'UNIFIED_REFERENCE_SHAPE_HELD':'WHOLE_DOCUMENT_UNIFIED_SHAPE_CANDIDATE',readyToRegister:false,operationalDocumentStatus:null,safeTrialDocumentStatus:'DRAFT'};
 });
 const body={format:'dgc-unified-reference-shape-plan-v1',snapshotHash:invoices.snapshotHash,originalRegistrationPlanHash:original.planHash,unifiedInvoicePlanHash:invoices.planHash,referenceManifestHash:options.referenceManifestPin,documents,counts:documents.reduce((a,d)=>(a[d.state]=(a[d.state]??0)+1,a),{}),originalGatesUnchanged:true,registryCommitAllowed:false,postingAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
}
export async function verifyReferenceUnifiedPlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await referenceUnifiedPlan(options)))throw Error('Unified reference set differs from pinned evidence');return plan;}
export async function verifyReferenceUnifiedNativePlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await referenceUnifiedNativePlan(options)))throw Error('Native extended unified reference set differs');return plan;}
