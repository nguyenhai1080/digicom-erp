import {canonical,digest} from './core.mjs';
import {invoiceUnifiedPlan} from './invoice-unified.mjs';
import {invoiceNativeUsdPlan} from './invoice-native-usd.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {invoiceChildNativePlan} from './invoice-child-native.mjs';
import {invoiceChildRoundingPlan} from './invoice-child-rounding.mjs';
import {invoiceUsdAuthorityPlan} from './invoice-usd-authority.mjs';
import {usdReferenceInvoicePlan} from './usd-reference-invoice.mjs';
import {invoiceSignedPackageCopiesPlan} from './invoice-signed-package-copies.mjs';
// Explicit extension; the original unified/strict profiles keep their hashes
// and holds. Every native profile is rederived from both original PDF sets.
export async function invoiceUnifiedNativePlan(o){return withSourcePlanningCache(async()=>{
 const original=invoiceUnifiedPlan(o),native=await invoiceNativeUsdPlan({...o.nativeUsdOptions,invoiceOptions:o.invoiceOptions});
 if(native.planHash!==o.nativeUsdOptions?.nativeInvoicePlanPin)throw Error('Native unified Invoice evidence pin differs');
 let entries=original.entries.map(e=>{
  const extra=native.entries.find(n=>canonical(n.source)===canonical(e.source));
  if(e.state!=='UNIFIED_INVOICE_SHAPE_HELD'||extra?.state!=='NATIVE_INVOICE_USD_SHAPE_CANDIDATE')return e;
  return {...extra,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:extra.state,sourceProfile:'NATIVE_USD',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false};
 });
 let child=null;if(o.childNativeOptions){child=await invoiceChildNativePlan(o);if(child.planHash!==o.childNativeOptions.invoicePlanPin)throw Error('Child/native Invoice plan pin differs');entries=entries.map(e=>{const c=child.entries.find(c=>canonical(c.source)===canonical(e.source));return e.state==='UNIFIED_INVOICE_SHAPE_HELD'&&c?.state==='CHILD_NATIVE_INVOICE_CANDIDATE'?{...c,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:c.state,sourceProfile:'CHILD_NATIVE',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false}:e;});}
 let compound=null;if(o.childRoundingOptions){compound=await invoiceChildRoundingPlan(o);if(compound.planHash!==o.childRoundingOptions.invoicePlanPin)throw Error('Compound child rounding Invoice plan pin differs');entries=entries.map(e=>{const c=compound.entries.find(c=>canonical(c.source)===canonical(e.source));return e.state==='UNIFIED_INVOICE_SHAPE_HELD'&&c?.state==='CHILD_ROUNDING_INVOICE_CANDIDATE'?{...c,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:c.state,sourceProfile:'CHILD_ROUNDING_V1',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false}:e;});}
 let authority=null;if(o.invoiceUsdAuthorityOptions){authority=await invoiceUsdAuthorityPlan(o);if(authority.planHash!==o.invoiceUsdAuthorityOptions.invoicePlanPin)throw Error('Original Invoice USD authority plan pin differs');entries=entries.map(e=>{const c=authority.entries.find(c=>canonical(c.source)===canonical(e.source));return e.state==='UNIFIED_INVOICE_SHAPE_HELD'&&c?.state==='ORIGINAL_INVOICE_USD_CANDIDATE'?{...c,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:c.state,sourceProfile:'ORIGINAL_INVOICE_USD',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false}:e;});}
 let usdReference=null;if(o.usdReferenceOptions){usdReference=await usdReferenceInvoicePlan(o);if(usdReference.planHash!==o.usdReferenceOptions.invoicePlanPin)throw Error('USD reference Invoice plan pin differs');entries=entries.map(e=>{const c=usdReference.entries.find(c=>canonical(c.source)===canonical(e.source));return e.state==='UNIFIED_INVOICE_SHAPE_HELD'&&c?.state==='USD_REFERENCE_INVOICE_CANDIDATE'?{...c,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:c.state,sourceProfile:'USD_REFERENCE_V1',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false}:e;});}
 let signedCopies=null;if(o.signedPackageCopyOptions){signedCopies=await invoiceSignedPackageCopiesPlan(o);if(signedCopies.planHash!==o.signedPackageCopyOptions.invoicePlanPin)throw Error('Signed package copy Invoice plan pin differs');entries=entries.map(e=>{const c=signedCopies.entries.find(c=>canonical(c.source)===canonical(e.source));return e.state==='UNIFIED_INVOICE_SHAPE_HELD'&&c?.state==='SIGNED_PACKAGE_COPY_INVOICE_CANDIDATE'?{...c,originalUnifiedState:e.state,originalUnifiedReasons:e.reasons,originalProfileState:c.state,sourceProfile:'SIGNED_PACKAGE_COPIES_V1',state:'UNIFIED_INVOICE_SHAPE_CANDIDATE',readyToImport:false}:e;});}
 const selected=entries.filter(e=>e.state==='UNIFIED_INVOICE_SHAPE_CANDIDATE'),owners=new Map();
 for(const e of selected)for(const key of e.revenueGroupKeys){if(owners.has(key)&&owners.get(key)!==e.source.sourceRow)throw Error('Unified native revenue group has multiple Invoice owners');owners.set(key,e.source.sourceRow);}
 const body={...original,format:'dgc-native-extended-unified-invoice-shape-plan-v1',originalUnifiedPlanHash:original.planHash,nativeInvoicePlanHash:native.planHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),profileCounts:selected.reduce((a,e)=>(a[e.sourceProfile]=(a[e.sourceProfile]??0)+1,a),{})};delete body.planHash;
 if(child){body.format='dgc-child-native-extended-unified-invoice-plan-v1';body.childNativeInvoicePlanHash=child.planHash;}
 if(compound){body.format='dgc-child-rounding-extended-unified-invoice-plan-v1';body.childRoundingInvoicePlanHash=compound.planHash;}
 if(authority){body.format='dgc-original-invoice-usd-extended-unified-plan-v1';body.invoiceUsdAuthorityPlanHash=authority.planHash;}
 if(usdReference){body.format='dgc-usd-reference-extended-unified-plan-v1';body.usdReferenceInvoicePlanHash=usdReference.planHash;}
 if(signedCopies){body.format='dgc-signed-package-copy-extended-unified-plan-v1';body.signedPackageCopyInvoicePlanHash=signedCopies.planHash;}
 return {...body,planHash:digest(body)};
});}
export async function verifyInvoiceUnifiedNativePlan(plan,o){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(await invoiceUnifiedNativePlan(o)))throw Error('Native extended unified Invoice set differs');return plan;}
