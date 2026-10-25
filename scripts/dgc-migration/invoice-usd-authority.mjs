import {canonical,digest,sourceDate} from './core.mjs';
import {verifyInvoiceRestorePlan} from './invoice-restore.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {revenueBillingPlan} from './revenue-billing.mjs';
import {invoiceMultiPeriodReview,capturedInvoiceWindow} from './invoice-multiperiod.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {reviewReconOcr} from './recon-ocr.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const D=v=>new Prisma.Decimal(String(v)),same=(a,b)=>canonical(a)===canonical(b),norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,''),fields=[['revenue','Total_Revenue_USD','Revenue_USD','Invoice_Revenue_USD'],['wht','Total_WHT_USD','WHT_USD','Invoice_WHT_USD'],['payable','Total_Payable_USD','Payable_USD','Invoice_Payable_USD']];
async function render(root,f){
 if(!f||typeof f.relativePath!=='string'||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256??''))throw Error('Pinned original Invoice USD render required');
 const base=await realpath(root),p=await realpath(resolve(base,f.relativePath)),rel=relative(base,p);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Original Invoice USD render escaped root');const bytes=await readFile(p);if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Original Invoice USD render differs');
}
// Byte-only recheck. A writer must first fully rederive the semantic plan and
// recheck the existing Recon OCR files too; this helper never selects a row.
export async function verifyInvoiceUsdAuthorityFiles(o){const a=o.invoiceUsdAuthorityOptions,i=o.invoiceOptions;await verifyInvoiceFiles(i.snapshot,i.manifest,i.root);for(const obs of a.observations.invoices)await render(a.root,obs.visualRender);}
export function invoiceUsdAuthorityProposal(o,ocr,multi){
 const i=o.invoiceOptions,a=o.invoiceUsdAuthorityOptions,obs=a.observations,{observationHash,...body}=obs??{};
 verifyInvoiceRestorePlan(i.restorePlan,i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions);
 if(obs.format!=='dgc-original-invoice-usd-authority-observations-v1'||observationHash!==a.observationPin||observationHash!==digest(body)||obs.snapshotHash!==i.snapshot.snapshotHash||obs.acceptance!==false||!Array.isArray(obs.invoices)||!obs.invoices.length||ocr.reviewHash!==i.combined.inputPins?.ocr)throw Error('Original Invoice USD observations or Recon OCR pin differ');
 const scopes=revenueScopePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),billing=revenueBillingPlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),seen=new Set();
 const entries=obs.invoices.map(v=>{
  const original=i.restorePlan.entries.find(e=>same(e.source,v.source)),header=i.snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===v.source?.sourceRow),file=i.manifest.files.find(f=>f.sourceRow===v.source?.sourceRow),scope=scopes.invoices.find(e=>same(e.source,v.source));
  if(!original||!header||!scope||seen.has(header.sourceRow)||file?.sha256!==v.pdfSha256||file.fileId!==v.fileId||v.method!=='CODEX_VISUAL_REVIEW'||v.identityCoverage!=='FULL_INVOICE'||v.acceptance!==false||v.sourceValuesChanged!==false)throw Error('Original Invoice USD physical source binding differs');seen.add(header.sourceRow);
  const reasons=[],window=capturedInvoiceWindow(header),isMulti=window.state==='CAPTURED_MULTIPERIOD_RANGE',m=isMulti&&same(multi?.source,v.source)?multi:null;
  if(original.state!=='RESTORE_HELD'||original.disposition!=='PREPARE_CURRENT_LEDGER'||original.sourceStatus!=='Issued')reasons.push('CURRENT_ISSUED_SOURCE_REQUIRED');
  if(isMulti){if(!m||m.state!=='MULTIPERIOD_STRUCTURE_BOUND_FINANCIAL_REVIEW_PENDING'||!m.billingStateBound||m.remainingScopeIssues.length||!same(m.remainingImportReasons,['REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD']))reasons.push('OTHER_MULTIPERIOD_SOURCE_HOLD');}
  else if(window.state!=='CAPTURED_SINGLE_PERIOD_RANGE'||!same(original.reasons,['REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD'])||scope.bindingState!=='STRUCTURAL_SCOPE_BOUND'||scope.issues.length||scope.financialReasons.length||scope.headerChecks.some(c=>c.state!=='MATCH'))reasons.push('OTHER_SINGLE_PERIOD_SOURCE_HOLD');
  const selectedScopes=m?.scopes??scope.scopes,items=selectedScopes.flatMap(s=>s.items),proofs=[];
  if(header.values.Currency!=='USD'||v.currency!=='USD'||v.invoiceNumber!==header.values.Invoice_Number||v.invoiceDate!==sourceDate(header,'Invoice_Date')||v.dueDate!==sourceDate(header,'Payment_Due_Date')||v.billingStart!==window.start||v.billingEnd!==window.end||!same(v.coveredPeriods,window.periods)||!same(selectedScopes.map(s=>s.period).sort(),window.periods))reasons.push('PRINTED_INVOICE_IDENTITY_DATES_OR_PERIODS_DIFFER');
  for(const item of items){
   const g=i.targetPlan.groups.find(g=>g.groupKey===item.sourceGroupKey),c=i.combined.groups.find(g=>g.groupKey===item.sourceGroupKey),e=g?.entries.find(e=>same(e.source,item.source)),mapping=scope.lineMappings.filter(l=>same(l.totalSource,item.source)),detail=mapping.length===1?i.snapshot.tables['49_INVOICE_DETAIL'].rows.find(r=>r.sourceRow===mapping[0].detailSource.sourceRow&&r.rowHash===mapping[0].detailSource.rowHash):null,reconDetail=i.snapshot.tables['44_RECON_PDF_DETAIL'].rows.find(r=>r.sourceRow===e?.bindings.Source_Recon_Detail_ID?.sourceRow&&r.rowHash===e?.bindings.Source_Recon_Detail_ID?.rowHash),b=billing.rows.find(r=>same(r.source,item.source));
   if(g?.state!=='REHEARSABLE'||g.entries.length!==1||g.currency!=='USD'||item.presentationMode!=='TOTAL_ONLY_CAPTURED'||c?.state!=='EVIDENCE_REVIEW_HELD'||!same(c.reasons,['PRINTED_USD_TOTAL_UNVERIFIED','OCR_PAYABLE_ONLY_FULL_USD_REVIEW_PENDING'])||c.rows.length!==1||c.rows[0].ocrPayableState!=='MATCH'||c.rows[0].childState!==null)reasons.push('OTHER_REVENUE_BUSINESS_OR_PDF_HOLD');
   if(!detail||!e||!b||b.directCurrentLines.length!==1||!same(b.directCurrentLines[0].invoiceSource,original.source)||b.directCurrentLines[0].referenceState!=='RESOLVED'||b.unresolvedParentLines.length||(!isMulti&&b.reasons.length))reasons.push('OTHER_REVENUE_BILLING_OR_LINE_HOLD');
   if(!e||v.serviceKey!==e.bindings.Service_ID?.legacyId||norm(v.sourceServiceText)!==norm(reconDetail?.values.Service_Name)||v.partnerKey!==g?.partnerSource?.legacyId)reasons.push('PRINTED_INVOICE_SERVICE_OR_PARTNER_BINDING_DIFFERS');
   const f=ocr.files.find(f=>f.entries.some(r=>same(r.source,item.source))),r=f?.entries.find(r=>same(r.source,item.source));
   if(!r||!r.uniqueHeader||!r.periodMatches||!r.scopeMatches||r.payable.state!=='MATCH'||f.passes.some(p=>p.state!=='OCR_AGREES_WITH_VISUAL_OBSERVATION'))reasons.push('RECON_PAYABLE_SOURCE_OR_OCR_HOLD');
   const components=fields.map(([field,,df,rf])=>({field,capturedLine:detail?.values[df]??null,capturedRevenue:e?.capturedRevenue.values[rf]??null,match:!!detail&&!!e&&D(detail.values[df]).eq(e.capturedRevenue.values[rf])}));
   if(components.some(c=>!c.match))reasons.push('CAPTURED_LINE_AND_REVENUE_USD_DIFFER');
   const contract=i.snapshot.tables['30_CONTRACTS'].rows.find(r=>r.sourceRow===g?.contractSource?.sourceRow&&r.rowHash===g?.contractSource?.rowHash);
   if(typeof v.printedContractNo!=='string'||!v.printedContractNo.trim()||!contract)reasons.push('MISSING_PRINTED_OR_CAPTURED_CONTRACT_EVIDENCE');
   proofs.push({source:item.source,sourceInvoiceDetail:mapping[0]?.detailSource??null,sourceReconHeader:g?.documentSource??null,sourceReconDetail:e?.bindings.Source_Recon_Detail_ID??null,period:g?.period??null,components,reconPdfSha256:f?.pdfSha256??null,reconPayable:r?.payable??null,reconIdentityCoverage:r?.identityCoverage??null,reconFullIdentityVerified:r?.identityCoverage==='HEADER_AND_FOOTER'&&r?.serviceIdentityMatches===true,contractEvidence:{source:g?.contractSource??null,printedContractNo:v.printedContractNo??null,capturedContractNo:contract?.values.Contract_No??null,exactTextMatch:v.printedContractNo===contract?.values.Contract_No,legalEquivalenceInferred:false,sourceBindingChanged:false},originalCombinedReasons:c?.reasons??[],nativeValuesVerified:false,exchangeRateVerified:false,perPeriodRevenueWhtPrintedOnRecon:false});
  }
  if(!items.length||items.length!==scope.lineMappings.length||new Set(items.map(x=>canonical(x.source))).size!==items.length)reasons.push('INCOMPLETE_OR_DUPLICATE_CAPTURED_ALLOCATION');
  const components=fields.map(([field,hf])=>{const printed=v.components?.[field],sum=proofs.reduce((n,p)=>n.plus(p.components.find(c=>c.field===field)?.capturedLine??0),D(0));return {field,printedInvoiceTotal:printed,capturedHeader:header.values[hf],capturedAllocationSum:sum.toFixed(),match:typeof printed==='string'&&/^\d+\.\d{2}$/.test(printed)&&D(printed).eq(header.values[hf])&&sum.eq(printed)};});
  if(components.some(c=>!c.match))reasons.push('PRINTED_INVOICE_HEADER_AND_ALLOCATION_SUM_DIFFER');
  const evidence={format:'DGC_ORIGINAL_INVOICE_USD_AUTHORITY_REHEARSAL_V1',snapshotHash:i.snapshot.snapshotHash,source:original.source,observationHash,ocrReviewHash:ocr.reviewHash,invoicePdfSha256:file.sha256,components,allocations:proofs,claims:{fullInvoiceIdentityObserved:true,invoiceUsdTotalsPrinted:true,perPeriodRevenueWhtPrintedOnInvoice:!isMulti,nativeComponentsVerified:false,exchangeRatePrinted:false,exchangeRateDerived:false},originalStrictReasons:original.reasons,sourceValuesChanged:false,operationalUseAllowed:false,postingAllowed:false,acceptance:false};
  return {...original,invoice:{...original.invoice,...(m?{period:m.sourceHeaderPeriod}:{})},scopes:selectedScopes,...(m?{multiPeriodEvidence:m,proposedRevenueStatuses:m.proposedRevenueStatuses}:{}),nativeUsdEvidence:evidence,originalState:original.state,originalReasons:original.reasons,state:reasons.length?'ORIGINAL_INVOICE_USD_HELD':'ORIGINAL_INVOICE_USD_CANDIDATE',reasons:[...new Set(reasons)],readyToImport:false};
 });
 const report={format:'dgc-original-invoice-usd-authority-plan-v1',snapshotHash:i.snapshot.snapshotHash,observationHash,ocrReviewHash:ocr.reviewHash,strictRestorePlanHash:i.restorePlan.planHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...report,planHash:digest(report)};
}
export async function invoiceUsdAuthorityPlan(o){return withSourcePlanningCache(async()=>{
 const a=o.invoiceUsdAuthorityOptions,i=o.invoiceOptions,n=o.nativeUsdOptions.nativeOptions;
 await verifyInvoiceUsdAuthorityFiles(o);const ocr=await reviewReconOcr(i.snapshot,n.manifest,n.root,n.manifestPin,n.ocrManifest,n.ocrRoot,n.ocrManifestPin),multi=a.multiPeriodOptions?await invoiceMultiPeriodReview({...a.multiPeriodOptions,invoiceOptions:i}):null;
 return invoiceUsdAuthorityProposal(o,ocr,multi);
});}
