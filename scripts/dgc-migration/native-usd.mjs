import {canonical,digest} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {reviewReconOcr} from './recon-ocr.mjs';
import {reconLifecycleReview} from './recon-lifecycle.mjs';
import {capturedMonth} from './recon-semantics.mjs';
import {replayDonorUsd} from './donor-rounding.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),same=(a,b)=>canonical(a)===canonical(b);
const fields=[['revenue','Remuneration_Provider_MZN','Remuneration_Provider_USD','Invoice_Revenue_USD'],['wht','WHT_MZN','WHT_USD','Invoice_WHT_USD'],['payable','Partner_Revenue_MZN','Partner_Revenue_USD','Invoice_Payable_USD']];
const valid=v=>['string','number'].includes(typeof v)&&/^\d+(?:\.\d+)?$/.test(String(v))&&String(v).length<=80&&D(v).isFinite()&&D(v).lt('10000000000000000');
const eq=(a,b)=>valid(a)&&valid(b)&&D(a).eq(b),text=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(),contains=(phrase,label)=>!!text(label)&&(' '+text(phrase)+' ').includes(' '+text(label)+' ');
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
// Printed native components + captured rate can explain donor USD arithmetic.
// They are not three printed USD components, an independently printed FX rate,
// operational MZN support, or authorization to import/approve financial records.
export async function reviewNativeUsdScans(o){return withSourcePlanningCache(async()=>{
 const {snapshot,targetPlan,decisions,manifest,root,manifestPin,ocrManifest,ocrRoot,ocrManifestPin,observations,observationPin}=o;
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);const {observationHash,...body}=observations??{};
 if(observationHash!==observationPin||observationHash!==digest(body)||observations.format!=='dgc-scan-and-multiperiod-visual-observations-v1'||observations.snapshotHash!==snapshot.snapshotHash||observations.ocrManifestHash!==ocrManifestPin||observations.operationalAcceptance!==false||!Array.isArray(observations.scans))throw Error('Unpinned native/USD visual observations');
 const ocr=await reviewReconOcr(snapshot,manifest,root,manifestPin,ocrManifest,ocrRoot,ocrManifestPin),lifecycle=reconLifecycleReview(snapshot,decisions),seen=new Set(),entries=[];
 if(!observations.scans.length||observations.scans.length>ocr.files.length)throw Error('Native scan observation coverage differs');
 for(const scan of observations.scans){
  const h=snapshot.tables['43_RECON_PDF_HEADER'].rows.find(r=>r.sourceRow===scan.sourceHeader?.sourceRow),file=ocr.files.find(f=>f.sourceHeaders.some(a=>same(a,scan.sourceHeader)));
  if(!h||seen.has(h.sourceRow)||!same(addr('43_RECON_PDF_HEADER',snapshot.tables['43_RECON_PDF_HEADER'],h),scan.sourceHeader)||!file||scan.pdfSha256!==file.pdfSha256||!same(scan.visualRender,file.visualRender)||scan.method!=='CODEX_VISUAL_REVIEW'||scan.acceptance!==false||scan.sourceValuesChanged!==false||scan.exchangeRatePrinted!==false||scan.revenueUsdPrinted!==false||scan.whtUsdPrinted!==false||!fields.every(([f])=>typeof scan.nativeComponents?.[f]==='string'&&/^\d+\.\d{2}$/.test(scan.nativeComponents[f]))||!/^\d+\.\d{2}$/.test(scan.payableUsd??'')||scan.period!==file.observed.period||!eq(scan.payableUsd,file.observed.payableUsd)||scan.serviceText!==file.observed.serviceText||scan.identityCoverage!==file.observed.identityCoverage)throw Error('Native visual/PDF/OCR binding differs');seen.add(h.sourceRow);
  const groups=targetPlan.groups.filter(g=>same(g.documentSource,scan.sourceHeader)),chain=lifecycle.chains.find(c=>same(c.source,scan.sourceHeader));
  for(const g of groups){
   const reasons=[],e=g.entries.length===1?g.entries[0]:null,d=e&&snapshot.tables['44_RECON_PDF_DETAIL'].rows.find(r=>r.sourceRow===e.bindings.Source_Recon_Detail_ID?.sourceRow&&r.rowHash===e.bindings.Source_Recon_Detail_ID.rowHash);
   if(!e||!d||g.state!=='REHEARSABLE'||g.currency!=='USD'||e.sourceStatus!=='Approved'||e.aggregationMapping.rowType!=='TOTAL'||e.aggregationMapping.includeInMonthlyTotal!==true)reasons.push('SINGLE_APPROVED_USD_TOTAL_REQUIRED');
   if(scan.identityCoverage!=='HEADER_AND_FOOTER')reasons.push('FULL_PRINTED_IDENTITY_REQUIRED');
   const service=e?.bindings.Service_ID?.legacyId,serviceBound=!!service&&text(h.values.Service_Header)===text(service)&&text(d?.values.Service_Name)===text(service)&&contains(scan.serviceText,service);
   if(!serviceBound)reasons.push('PRINTED_SERVICE_AND_BOUND_SOURCE_DIFFER');
   if(scan.period!==g.period||capturedMonth(h,'Period_Month')!==g.period||e&&capturedMonth(e.capturedRevenue,'Revenue_Month')!==g.period)reasons.push('PRINTED_AND_CAPTURED_PERIOD_DIFFER');
   if(!chain||chain.donorActivity!=='ACTIVE'||chain.issues.length)reasons.push('ACTIVE_SOURCE_LIFECYCLE_REQUIRED');
   const rate=h.values.Exchange_Rate,rateAvailable=valid(rate)&&D(rate).gt(0);if(!rateAvailable)reasons.push('POSITIVE_CAPTURED_RATE_UNAVAILABLE');
   const components=fields.map(([field,nativeField,detailUsdField,revenueUsdField])=>{const native=d?.values[nativeField]??null,detailUsd=d?.values[detailUsdField]??null,revenueUsd=e?.capturedRevenue.values[revenueUsdField]??null,printed=scan.nativeComponents[field],replay=replayDonorUsd(native,rate);return {field,nativeField,detailUsdField,revenueUsdField,printedNative:printed,capturedNative:valid(native)?D(native).toFixed():null,capturedDetailUsd:valid(detailUsd)?D(detailUsd).toFixed():null,capturedRevenueUsd:valid(revenueUsd)?D(revenueUsd).toFixed():null,nativeMatches:eq(native,printed),replay,detailMatchesReplay:eq(detailUsd,replay.donorNumber),revenueMatchesDetail:eq(revenueUsd,detailUsd),usdPrinted:field==='payable'};});
   if(components.some(c=>!c.nativeMatches))reasons.push('PRINTED_AND_CAPTURED_NATIVE_COMPONENTS_DIFFER');
   if(components.some(c=>c.replay.state!=='NUMBER_AND_DECIMAL_AGREE'||!c.detailMatchesReplay||!c.revenueMatchesDetail))reasons.push('CAPTURED_DONOR_USD_REPLAY_NOT_EXACT');
   if(!eq(scan.nativeComponents.payable,D(scan.nativeComponents.revenue).minus(scan.nativeComponents.wht).toFixed()))reasons.push('PRINTED_NATIVE_IDENTITY_DIFFERS');
   const payable=components.find(c=>c.field==='payable');if(!eq(payable.capturedRevenueUsd,scan.payableUsd)||!eq(h.values.Total_Revenue_USD,scan.payableUsd)||!D(scan.payableUsd).gt(0))reasons.push('PRINTED_AND_CAPTURED_PAYABLE_USD_DIFFER');
   if(!e||!eq(e.capturedInvoiceUsd.Invoice_Payable_USD,D(e.capturedInvoiceUsd.Invoice_Revenue_USD).minus(e.capturedInvoiceUsd.Invoice_WHT_USD).toFixed()))reasons.push('CAPTURED_USD_IDENTITY_DIFFERS');
   entries.push({groupKey:g.groupKey,sourceHeader:scan.sourceHeader,source:e?.source??null,sourceDetail:e?.bindings.Source_Recon_Detail_ID??null,fileId:file.fileId,pdfSha256:file.pdfSha256,visualRender:scan.visualRender,period:g.period,state:reasons.length?'NATIVE_USD_EVIDENCE_HELD':'NATIVE_PRINT_AND_CAPTURED_RATE_REPLAY_BOUND',reasons,components,capturedSourceRateJson:canonical(rate??null),printedPayableUsd:scan.payableUsd,serviceBound,identityCoverage:scan.identityCoverage,claims:{nativeComponentsPrinted:true,payableUsdPrinted:true,exchangeRatePrinted:false,revenueUsdPrinted:false,whtUsdPrinted:false,usdComponentsBasis:'CAPTURED_RATE_DONOR_REPLAY_ONLY'},sourceValuesChanged:false,operationalFxDerived:false,operationalUseAllowed:false,readyToImport:false});
  }
  if(!groups.length)throw Error('Native scan has no exact target group');
 }
 const report={format:'dgc-native-print-captured-usd-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,sourceManifestHash:manifestPin,ocrManifestHash:ocrManifestPin,ocrReviewHash:ocr.reviewHash,observationHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,postingAllowed:false,acceptance:false,readyToImport:false,historicalCashPosting:false,sourceValuesChanged:false,operationalFxDerived:false,pdfSemanticsVerified:false};return {...report,reviewHash:digest(report)};
});}
