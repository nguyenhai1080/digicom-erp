import {canonical,digest} from './core.mjs';
import {invoiceUnifiedPlan} from './invoice-unified.mjs';
import {invoiceNativeUsdPlan} from './invoice-native-usd.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
// Explicit extension; the original unified/strict profiles keep their hashes
// and holds. Every native profile is rederived from both original PDF sets.
export async function invoiceUnifiedNativePlan(o){return withSourcePlanningCache(async()=>{
 const original=invoiceUnifiedPlan(o),native=await invoiceNativeUsdPlan({...o.nativeUsdOptions,invoiceOptions:o.invoiceOptions});
 if(native.planHash!==o.nativeUsdOptions?.nativeInvoicePlanPin)throw Error('Native unified Invoice evidence pin differs');
 const entries=original.entries.map(e=>{
  const extra=native.entries.find(n=>canonical(n.source)===canonical(e.source));
  if(e.state!=='UNIFIED_INVOICE_SHAPE_HELD'||extra?.state!=='NATIVE_INVOICE_USD_SHAPE_CANDIDATE')return e;
  return {...extra,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:extra.state,sourceProfile:'NATIVE_USD',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false};
 });
 const selected=entries.filter(e=>e.state==='UNIFIED_INVOICE_SHAPE_CANDIDATE'),owners=new Map();
 for(const e of selected)for(const key of e.revenueGroupKeys){if(owners.has(key)&&owners.get(key)!==e.source.sourceRow)throw Error('Unified native revenue group has multiple Invoice owners');owners.set(key,e.source.sourceRow);}
 const body={...original,format:'dgc-native-extended-unified-invoice-shape-plan-v1',originalUnifiedPlanHash:original.planHash,nativeInvoicePlanHash:native.planHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),profileCounts:selected.reduce((a,e)=>(a[e.sourceProfile]=(a[e.sourceProfile]??0)+1,a),{})};delete body.planHash;
 return {...body,planHash:digest(body)};
});}
export async function verifyInvoiceUnifiedNativePlan(plan,o){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await invoiceUnifiedNativePlan(o)))throw Error('Native extended unified Invoice set differs');return plan;}
