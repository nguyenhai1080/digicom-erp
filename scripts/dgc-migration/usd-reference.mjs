import {createRequire} from 'node:module';
import {canonical,digest} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {verifyChildNativeFiles,childNativeFields,replayChildNativeFallback,explicitChildVat} from './child-native.mjs';
import {replayDonorUsd,verifyDonorRoundingReview} from './donor-rounding.mjs';
import {parseUsdSummary,compareCapturedUsd} from './recon-semantics.mjs';
import {withSourcePlanningCache,memoSourcePlan} from './planning-context.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),same=(a,b)=>canonical(a)===canonical(b),norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,''),moneyFields=[['Remuneration_Provider_MZN','Remuneration_Provider_USD','Invoice_Revenue_USD'],['WHT_MZN','WHT_USD','Invoice_WHT_USD'],['Partner_Revenue_MZN','Partner_Revenue_USD','Invoice_Payable_USD']];
const valid=v=>['string','number'].includes(typeof v)&&/^\d+(?:\.\d+)?$/.test(String(v))&&String(v).length<=80&&D(v).isFinite()&&D(v).lt('10000000000000000');
export function referenceUsdComponents(captured,printed,rate,usd){
 return moneyFields.map(([nativeField,detailField,usdField])=>{const source=replayDonorUsd(captured?.[nativeField],rate),reference=replayDonorUsd(printed?.[nativeField],rate),actual=usd?.[usdField],sourceMatches=valid(actual)&&source.state==='NUMBER_AND_DECIMAL_AGREE'&&source.donorNumber===D(actual).toFixed(),printedMatches=valid(actual)&&reference.state==='NUMBER_AND_DECIMAL_AGREE'&&reference.donorNumber===D(actual).toFixed();return {nativeField,detailField,usdField,capturedNative:captured?.[nativeField]??null,printedNative:printed?.[nativeField]??null,capturedUsd:valid(actual)?D(actual).toFixed():null,source,reference,sourceMatches,printedMatches};});
}
// Compatibility only, not a statement about the PDF author's rounding policy.
// Every amount must match exactly; this never supplies an operational formula.
export function printedTruncatedRevenueCompatibility(p){
 if(!childNativeFields.every(f=>valid(p?.[f]))||!D(p.Sharing_Rate).gt(0)||D(p.Sharing_Rate).gt(1)||!D(p.Distribution_Ratio).gt(0)||D(p.Distribution_Ratio).gt(1))return [];
 const r=D(p.Service_Revenue_For_Sharing_MZN).mul(p.Sharing_Rate).mul(p.Distribution_Ratio).toDecimalPlaces(2,Decimal.ROUND_DOWN),out=[];
 for(const [name,mode] of [['WHT_HALF_UP',Decimal.ROUND_HALF_UP],['WHT_HALF_EVEN',Decimal.ROUND_HALF_EVEN]]){const w=r.mul('.1').toDecimalPlaces(2,mode),pay=r.minus(w).toDecimalPlaces(2,mode);if(['Remuneration_Provider_MZN','WHT_MZN','Partner_Revenue_MZN'].every((f,i)=>D(p[f]).eq([r,w,pay][i])))out.push('REVENUE_TRUNCATE_'+name);}
 return out;
}
const detail=(s,e)=>s.tables['44_RECON_PDF_DETAIL'].rows.find(r=>r.sourceRow===e.bindings.Source_Recon_Detail_ID?.sourceRow&&r.rowHash===e.bindings.Source_Recon_Detail_ID?.rowHash);
export function nativeReferenceShape(snapshot,g,e,vat){
 const raw=detail(snapshot,e);if(!raw)return null;
 const own=replayChildNativeFallback(raw.values,raw.values,vat);
 if(own.components?.length===9&&own.components.every(c=>c.capturedMatchesReplay&&c.numberDecimalAgree))return {recipe:'V61_NATIVE_FALLBACK_INDEPENDENT_COMPONENTS',vat,source:e.source,sourceDetail:e.bindings.Source_Recon_Detail_ID};
 if(e.aggregationMapping.rowType!=='TOTAL')return null;
 const children=g.entries.filter(c=>c.aggregationMapping.rowType==='CHILD'&&same(c.bindings.Parent_Service_ID,e.bindings.Service_ID));if(!children.length)return null;
 const proofs=children.map(c=>{const d=detail(snapshot,c),r=d&&replayChildNativeFallback(d.values,d.values,vat);return r?.components?.length===9&&r.components.every(c=>c.capturedMatchesReplay&&c.numberDecimalAgree)?{source:c.source,sourceDetail:c.bindings.Source_Recon_Detail_ID,vat}:null;});if(proofs.some(p=>!p))return null;
 const totals=moneyFields.map(([nf])=>{const values=children.map(c=>detail(snapshot,c).values[nf]);if(!values.every(valid)||!valid(raw.values[nf]))return {field:nf,match:false};const decimal=values.reduce((n,v)=>n.plus(v),D(0)).toDecimalPlaces(2,Decimal.ROUND_HALF_UP),number=Math.round((values.reduce((n,v)=>n+Number(v),0)+Number.EPSILON)*100)/100;return {field:nf,match:decimal.eq(number)&&decimal.eq(raw.values[nf])};});
 return totals.every(c=>c.match)?{recipe:'V61_NATIVE_AGGREGATE_COMPONENT_SUM',source:e.source,sourceDetail:e.bindings.Source_Recon_Detail_ID,children:proofs}:null;
}
export async function reviewUsdReference(o){return withSourcePlanningCache(async()=>{
 const {snapshot,targetPlan,decisions,rounding,roundingPin}=o;verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 memoSourcePlan(snapshot,'usd-reference-rounding-validation',[snapshot,decisions,rounding,roundingPin],()=>{if(rounding.reviewHash!==roundingPin)throw Error('USD reference rounding pin differs');return verifyDonorRoundingReview(rounding,snapshot,decisions);});
 const {extracted,actual}=await verifyChildNativeFiles(o),entries=actual.filter(e=>e.state==='CAPTURED_NATIVE_DETAIL_DIFFERS').map(p=>{
  const g=targetPlan.groups.find(g=>g.entries.some(e=>same(e.source,p.source))),e=g?.entries.find(e=>same(e.source,p.source)),d=e&&detail(snapshot,e),h=snapshot.tables['43_RECON_PDF_HEADER'].rows.find(r=>r.sourceRow===g?.documentSource?.sourceRow&&r.rowHash===g?.documentSource?.rowHash),f=extracted.files.find(f=>f.fileId===p.fileId),vat=f?explicitChildVat(f.pages):null,components=referenceUsdComponents(d?.values,p.printedLine.values,h?.values.Exchange_Rate,e?.capturedInvoiceUsd),capture=d?replayChildNativeFallback(d.values,p.printedLine.values,vat):null,truncated=printedTruncatedRevenueCompatibility(p.printedLine.values),reasons=[];
  if(p.nativeChecks.length!==9||!p.nativeChecks.slice(0,6).every(c=>c.state==='MATCH'))reasons.push('PRINTED_INPUT_COLUMNS_DIFFER');
  if(p.usdChecks.length!==3||p.usdChecks.some(c=>c.state!=='MATCH')||components.some(c=>!c.sourceMatches))reasons.push('CAPTURED_USD_SOURCE_REPLAY_OR_LINK_DIFFERS');
  const invariant=components.every(c=>c.printedMatches),truncatedBound=capture?.components?.length===9&&capture.components.every(c=>c.capturedMatchesReplay&&c.numberDecimalAgree)&&truncated.length>0;
  if(!invariant&&!truncatedBound)reasons.push('PRINTED_NATIVE_USD_OR_COMPATIBILITY_UNEXPLAINED');
  return {...p,state:reasons.length?'USD_REFERENCE_CHILD_HELD':'USD_REFERENCE_CHILD_BOUND',originalState:p.state,reasons,referenceMode:invariant?'EXACT_USD_CONCORDANCE':truncatedBound?'SOURCE_FALLBACK_AND_PRINTED_TRUNCATION_COMPATIBILITY':null,components,capturedRate:h?.values.Exchange_Rate??null,vat,sourceNativeReference:nativeReferenceShape(snapshot,g,e,vat),printedArithmeticCompatibility:truncated,pdfAuthorRoundingPolicyProven:false,usdPrintedOnChild:false,operationalFxDerived:false,sourceValuesChanged:false};
 });
 const groups=targetPlan.groups.map(g=>{
  const proofs=entries.filter(e=>g.entries.some(r=>same(r.source,e.source))),reasons=[],warnings=[],f=extracted.files.find(f=>f.fileId===g.sourceFileId),summary=f?parseUsdSummary(f.pages):null,header=snapshot.tables['43_RECON_PDF_HEADER'].rows.find(r=>r.sourceRow===g.documentSource?.sourceRow&&r.rowHash===g.documentSource?.rowHash),total=g.entries.filter(e=>e.aggregationMapping.rowType==='TOTAL'),vat=f?explicitChildVat(f.pages):null;
  if(!proofs.length&&!g.entries.some(e=>rounding.revenues.some(r=>same(r.source,e.source)&&r.state==='DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS')))return {groupKey:g.groupKey,state:'NO_NEW_USD_REFERENCE',reasons:[]};
  if(!(g.state==='REHEARSABLE'&&g.reasons.length===0||g.state==='HELD'&&same(g.reasons,['REVENUE_REQUIRES_REVIEW']))||g.currency!=='USD')reasons.push('OTHER_SOURCE_BUSINESS_HOLD');
  if(proofs.some(p=>p.state!=='USD_REFERENCE_CHILD_BOUND'))reasons.push('CHILD_REFERENCE_REMAINS_HELD');
  for(const child of g.entries.filter(e=>e.aggregationMapping.rowType==='CHILD')){const original=actual.find(e=>same(e.source,child.source)),extra=proofs.find(e=>same(e.source,child.source));if(original?.state!=='PRINTED_CHILD_AND_CAPTURED_USD_LINK_MATCH'&&extra?.state!=='USD_REFERENCE_CHILD_BOUND')reasons.push('INCOMPLETE_PRINTED_CHILD_SOURCE_SET');}
  const checks=summary?.state==='EXPLICIT_USD_SUMMARY'&&total.length===1?compareCapturedUsd(total[0].capturedInvoiceUsd,summary,moneyFields.map(([,pdf,source])=>[source,pdf])):[];
  if(checks.length!==3||checks.some(c=>c.state!=='MATCH')||summary?.footerMatches!==true||summary?.period!==g.period||norm(summary?.service)!==norm(header?.values.Service_Header))reasons.push('FULL_PRINTED_USD_SUMMARY_OR_IDENTITY_HOLD');
  const revenues=g.entries.map(e=>{const r=rounding.revenues.find(r=>same(r.source,e.source)),sourceNativeReference=nativeReferenceShape(snapshot,g,e,vat),other=!r||r.reasons.length||r.sourceIssueCodes.length||r.otherCheckCodes.length||!['CAPTURED_USD_IDENTITY_MATCH','DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED','DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS'].includes(r.state);if(other)reasons.push('OTHER_CAPTURED_REVENUE_SOURCE_OR_REPLAY_HOLD');if(r?.state==='DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS')warnings.push('CAPTURED_NATIVE_IDENTITY_DIFFERENCE_PRESERVED');return {source:e.source,sourceDetail:e.bindings.Source_Recon_Detail_ID,originalRoundingState:r?.state??null,capturedUsdIdentity:r?.capturedUsdIdentity??null,nativeIdentity:r?.nativeIdentity??null,sourceNativeReference,nativeIdentityAccepted:false};});
  return {groupKey:g.groupKey,state:reasons.length?'USD_REFERENCE_GROUP_HELD':'USD_REFERENCE_GROUP_CANDIDATE',reasons:[...new Set(reasons)],warnings:[...new Set(warnings)],originalBusinessState:g.state,originalBusinessReasons:g.reasons,printedSummary:summary,summaryChecks:checks,children:proofs,revenues,originalGatesUnchanged:true,acceptance:false};
 });
 const body={format:'dgc-printed-child-usd-reference-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,manifestHash:o.manifestPin,childReviewHash:o.childReviewPin,roundingReviewHash:roundingPin,scope:'REFERENCE_USD_AND_CAPTURED_ARITHMETIC_NOT_LIFECYCLE_OR_NATIVE_ACCEPTANCE',entries,groups,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),groupCounts:groups.reduce((a,g)=>(a[g.state]=(a[g.state]??0)+1,a),{}),sourceValuesChanged:false,operationalFxDerived:false,originalGatesUnchanged:true,readyToImport:false,postingAllowed:false,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,reviewHash:digest(body)};
});}
