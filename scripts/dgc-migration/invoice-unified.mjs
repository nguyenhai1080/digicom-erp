import {canonical,digest} from './core.mjs';
import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {invoiceOffsettingPlan,invoiceSourceRoundingPlan} from './invoice-offsetting.mjs';
import {invoiceBalancePlan} from './invoice-balance.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
export function invoiceUnifiedPlan(options){return withSourcePlanningCache(()=>{
 const {invoiceOptions:i}=options;verifyInvoiceRestorePlan(i.restorePlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions);
 const profiles=[['STRICT',i.restorePlan,'CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL'],['V1',invoiceRoundingPlan(options),'INVOICE_ROUNDING_SHAPE_CANDIDATE'],['V2',invoiceOffsettingPlan(options),'INVOICE_OFFSETTING_SHAPE_CANDIDATE'],['V3',invoiceSourceRoundingPlan(options),'INVOICE_SOURCE_ROUNDING_SHAPE_CANDIDATE'],['V4',invoiceBalancePlan(options),'INVOICE_GROUP_BALANCE_SHAPE_CANDIDATE']];
 const entries=i.restorePlan.entries.map(original=>{
  for(const [profile,p,state] of profiles){const e=p.entries.find(e=>canonical(e.source)===canonical(original.source));if(e?.state===state)return {...e,originalProfileState:state,sourceProfile:profile,state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false};}
  return {...original,state:'UNIFIED_INVOICE_SHAPE_HELD',sourceProfile:null,readyToImport:false};
 });
 const body={format:'dgc-unified-invoice-shape-plan-v1',snapshotHash:i.snapshot.snapshotHash,profilePlanHashes:Object.fromEntries(profiles.map(([n,p])=>[n,p.planHash])),entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),profileCounts:entries.filter(e=>e.sourceProfile).reduce((a,e)=>(a[e.sourceProfile]=(a[e.sourceProfile]??0)+1,a),{}),originalGatesUnchanged:true,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
});}
export function verifyInvoiceUnifiedPlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(invoiceUnifiedPlan(options)))throw Error('Unified Invoice set differs from pinned profiles');return plan;}
