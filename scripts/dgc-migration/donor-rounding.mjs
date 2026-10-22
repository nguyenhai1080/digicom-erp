import {createRequire} from 'node:module';
import {canonical,digest} from './core.mjs';
import {revenueReview} from './revenue-review.mjs';
import {financeReview} from './finance-review.mjs';
import {referenceGraph} from './graph.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),key=s=>s.sheet+'|'+s.sourceRow;
const fields=[['Remuneration_Provider_MZN','Remuneration_Provider_USD','Invoice_Revenue_USD','Revenue_USD'],['WHT_MZN','WHT_USD','Invoice_WHT_USD','WHT_USD'],['Partner_Revenue_MZN','Partner_Revenue_USD','Invoice_Payable_USD','Payable_USD']];
const numeric=v=>['string','number'].includes(typeof v)&&/^\d+(?:\.\d+)?$/.test(String(v))&&String(v).length<=80&&D(v).isFinite()&&D(v).lt('10000000000000000');
// Characterization transcribed from donor 21_Recon_OCR.js:1531/1538, never
// execute donor source. Invalid/missing inputs do not reproduce its zero fill.
// These native/FX values are source evidence only, not an operational MZN flow.
export function replayDonorUsd(native,rate){
 if(!numeric(native)||!numeric(rate)||!D(rate).gt(0)||!Number.isFinite(Number(native)/Number(rate)))return {state:'REFERENCE_ARITHMETIC_UNAVAILABLE',donorNumber:null,decimalHalfUp:null};
 const donorNumber=String(Math.round((Number(native)/Number(rate)+Number.EPSILON)*100)/100),decimalHalfUp=D(native).div(D(rate)).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toFixed();
 return {state:donorNumber===decimalHalfUp?'NUMBER_AND_DECIMAL_AGREE':'NUMBER_AND_DECIMAL_DIFFER',donorNumber,decimalHalfUp,difference:D(donorNumber).minus(decimalHalfUp).toFixed()};
}
const compare=(a,b)=>!numeric(a)||!numeric(b)?{state:'UNAVAILABLE',actual:null,expected:null,difference:null}:{state:D(a).eq(D(b))?'MATCH':'MISMATCH',actual:D(a).toFixed(),expected:D(b).toFixed(),difference:D(a).minus(D(b)).toFixed()};
const identity=(revenue,wht,payable)=>!numeric(revenue)||!numeric(wht)||!numeric(payable)?{state:'UNAVAILABLE',difference:null}:{state:D(payable).eq(D(revenue).minus(wht))?'MATCH':'MISMATCH',difference:D(payable).minus(D(revenue).minus(wht)).toFixed()};

export function donorRoundingReview(snapshot,decisions){
 const review=revenueReview(snapshot,decisions),finance=financeReview(snapshot,decisions),graph=referenceGraph(snapshot,decisions);
 const addresses=new Map(),raw=new Map();for(const [sheet,t] of Object.entries(snapshot.tables))for(const r of t.rows){const s={sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash};addresses.set(key(s),s);raw.set(key(s),r);}
 const revenues=review.entries.map(e=>{
  const header=e.bindings.Source_Recon_Doc_ID,detail=e.bindings.Source_Recon_Detail_ID,h=header?raw.get(key(header)):null,d=detail?raw.get(key(detail)):null;
  const rate=h?.values.Exchange_Rate??null,v=e.capturedRevenue.values;
  const components=fields.map(([nativeField,detailUsdField,revenueUsdField])=>{
   const native=d?.values[nativeField]??null,detailUsd=d?.values[detailUsdField]??null,revenueUsd=v[revenueUsdField]??null,replay=replayDonorUsd(native,rate);
   return {nativeField,detailUsdField,revenueUsdField,capturedNative:native,capturedDetailUsd:detailUsd,capturedRevenueUsd:revenueUsd,replay,donorToDetail:compare(detailUsd,replay.donorNumber),detailToRevenue:compare(revenueUsd,detailUsd)};
  });
  const capturedUsdIdentity=identity(v.Invoice_Revenue_USD,v.Invoice_WHT_USD,v.Invoice_Payable_USD),nativeIdentity=identity(d?.values.Remuneration_Provider_MZN,d?.values.WHT_MZN,d?.values.Partner_Revenue_MZN);
  const ownIssues=review.issues.filter(i=>key(i.source)===key(e.source)),otherChecks=review.checks.filter(c=>key(c.source)===key(e.source)&&c.code!=='INVOICE_USD_PAYABLE_IDENTITY'&&c.state!=='MATCH');
  const reasons=[];
  if(!header||!detail)reasons.push('SOURCE_BINDING_UNRESOLVED');
  if(components.some(c=>c.replay.donorNumber===null))reasons.push('SOURCE_NATIVE_OR_RATE_UNAVAILABLE');
  if(components.some(c=>c.donorToDetail.state!=='MATCH'))reasons.push('DONOR_NUMBER_REPLAY_DIFFERS_FROM_DETAIL');
  if(components.some(c=>c.detailToRevenue.state!=='MATCH'))reasons.push('DETAIL_AND_REVENUE_USD_DIFFER');
  if(components.some(c=>c.replay.state==='NUMBER_AND_DECIMAL_DIFFER'))reasons.push('NUMBER_TO_DECIMAL_ADAPTATION_DIFFERENCE');
  if(ownIssues.length||otherChecks.length)reasons.push('OTHER_REVENUE_CHECKS_REMAIN');
  let state='CAPTURED_USD_IDENTITY_MATCH';
  if(capturedUsdIdentity.state==='UNAVAILABLE')state='CAPTURED_USD_UNAVAILABLE';
  else if(capturedUsdIdentity.state==='MISMATCH')state=reasons.length?'USD_IDENTITY_DIFFERENCE_REQUIRES_REVIEW':nativeIdentity.state!=='MATCH'?'DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS':'DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED';
  return {source:e.source,sourceHeader:header,sourceDetail:detail,capturedSourceRate:rate,capturedUsdIdentity,nativeIdentity,components,state,reasons,sourceIssueCodes:[...new Set(ownIssues.map(i=>i.code))],otherCheckCodes:[...new Set(otherChecks.map(c=>c.code))],readyToImport:false,gateOverrideAllowed:false};
 });
 const byRevenue=new Map(revenues.map(r=>[key(r.source),r])),links=new Map(graph.links.map(l=>[key(l.source)+'|'+l.field,l]));
 const invoices=snapshot.tables['48_INVOICE_HEADER'].rows.map(row=>{
  const source=addresses.get('48_INVOICE_HEADER|'+row.sourceRow),checks=finance.checks.filter(c=>key(c.source)===key(source)),issues=finance.issues.filter(c=>key(c.source)===key(source));
  const lines=snapshot.tables['49_INVOICE_DETAIL'].rows.filter(d=>{const l=links.get('49_INVOICE_DETAIL|'+d.sourceRow+'|Invoice_ID');return l?.target&&key(l.target)===key(source);}).map(d=>{
   const source=addresses.get('49_INVOICE_DETAIL|'+d.sourceRow),link=links.get(key(source)+'|Revenue_ID'),r=link?.target?byRevenue.get(key(link.target)):null,v=r?raw.get(key(r.source)).values:null;
   return {source,revenueSource:r?.source??null,revenueRoundingState:r?.state??null,revenueHasOtherIssues:!!r&&(r.sourceIssueCodes.length>0||r.otherCheckCodes.length>0),checks:fields.map(([, ,rf,df])=>({field:df,...compare(d.values[df],v?.[rf])})),readyToImport:false};
  });
  const headerCheck=checks.find(c=>c.code==='HEADER_REVENUE_MINUS_WHT'),otherChecks=checks.filter(c=>c.code!=='HEADER_REVENUE_MINUS_WHT'&&c.state!=='MATCH');
  const allLinesBound=lines.length>0&&lines.every(l=>l.revenueSource&&l.checks.every(c=>c.state==='MATCH')&&!l.revenueHasOtherIssues&&['CAPTURED_USD_IDENTITY_MATCH','DONOR_INDEPENDENT_ROUNDING_CHARACTERIZED'].includes(l.revenueRoundingState));
  const lineDelta=allLinesBound?lines.reduce((n,l)=>n.plus(byRevenue.get(key(l.revenueSource)).capturedUsdIdentity.difference??0),D(0)).toFixed():null;
  const deltaReconciles=!!headerCheck&&headerCheck.difference!==null&&lineDelta!==null&&D(headerCheck.difference).eq(lineDelta);
  const state=headerCheck?.state==='MATCH'?'CAPTURED_HEADER_IDENTITY_MATCH':headerCheck?.state==='MISMATCH'&&!issues.length&&!otherChecks.length&&allLinesBound&&deltaReconciles?'CAPTURED_LINE_ROUNDING_PROPAGATES_TO_HEADER':'HEADER_DIFFERENCE_REQUIRES_REVIEW';
  return {source,sourceStatus:row.values.Status??null,state,headerCheck:headerCheck??null,otherChecks,issues,lines,characterizedLineDelta:lineDelta,headerAndLineDeltaReconcile:deltaReconciles,readyToImport:false,gateOverrideAllowed:false};
 });
 const body={format:'dgc-donor-rounding-characterization-v1',snapshotHash:snapshot.snapshotHash,decisionsHash:decisions?digest(decisions):null,revenueReviewHash:review.planHash,financeReviewHash:finance.planHash,referenceGraphHash:graph.planHash,donorRecipe:'DGC_AMOUNT_TO_USD_NUMBER_EPSILON_ROUND_2_INDEPENDENT_COMPONENTS_V61',scope:'READ_ONLY_SOURCE_ARITHMETIC_CHARACTERIZATION_NO_GATE_OVERRIDE',revenues,invoices,revenueStates:revenues.reduce((a,r)=>(a[r.state]=(a[r.state]??0)+1,a),{}),invoiceStates:invoices.reduce((a,r)=>(a[r.state]=(a[r.state]??0)+1,a),{}),referenceArithmeticOnly:true,pdfSemanticsVerified:false,sourceValuesChanged:false,operationalFxDerived:false,postingAllowed:false,acceptance:false,readyToImport:false,gateOverrideAllowed:false,historicalCashPosting:false};
 return {...body,reviewHash:digest(body)};
}
export function verifyDonorRoundingReview(report,snapshot,decisions){const {reviewHash,...body}=report??{};if(reviewHash!==digest(body)||canonical(report)!==canonical(donorRoundingReview(snapshot,decisions)))throw Error('Donor rounding review differs from pinned source');return report;}

export function donorRoundingImpact(snapshot,report,reviewPin,registration,registrationPin,decisions){
 if(!/^[a-f0-9]{64}$/.test(reviewPin??'')||report?.reviewHash!==reviewPin)throw Error('Pinned rounding review differs');verifyDonorRoundingReview(report,snapshot,decisions);
 const {planHash,...body}=registration??{};
 if(!/^[a-f0-9]{64}$/.test(registrationPin??'')||planHash!==registrationPin||digest(body)!==registrationPin||registration.format!=='dgc-reference-registration-plan-v1'||registration.snapshotHash!==snapshot.snapshotHash||registration.acceptance!==false||registration.postingAllowed!==false||registration.registryCommitAllowed!==false||!Array.isArray(registration.unrehearsableInvoices))throw Error('Pinned registration plan differs');
 function bound(source,sheets){const t=snapshot.tables[source?.sheet],r=t?.rows.find(r=>r.sourceRow===source?.sourceRow);return sheets.includes(source?.sheet)&&r&&canonical(source)===canonical({sheet:source.sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});}
 const seen=new Set(),entries=registration.unrehearsableInvoices.map(b=>{
  if(!bound(b.source,['48_INVOICE_HEADER'])||seen.has(key(b.source))||!Array.isArray(b.affectedDocuments)||!b.affectedDocuments.length||b.affectedDocuments.some(s=>!bound(s,['53_SOA_HEADER','55_APPROVAL_PACKAGE'])))throw Error('Blocker source coverage differs');seen.add(key(b.source));
  const invoice=report.invoices.find(i=>canonical(i.source)===canonical(b.source));if(!invoice)throw Error('Missing blocker characterization');
  const focuses=[];
  if(invoice.state==='CAPTURED_LINE_ROUNDING_PROPAGATES_TO_HEADER')focuses.push('PRESERVE_COMPONENTS_REVIEW_HISTORICAL_EXCEPTION_MAPPING');
  if(invoice.state==='HEADER_DIFFERENCE_REQUIRES_REVIEW')focuses.push('REVIEW_HEADER_DETAIL_PAYMENT_AR');
  if(invoice.lines.some(l=>!l.revenueSource))focuses.push('RESOLVE_EXACT_SOURCE_LINK');
  if(invoice.lines.some(l=>l.revenueRoundingState==='DONOR_REPLAY_MATCH_NATIVE_IDENTITY_DIFFERS'))focuses.push('REVIEW_CAPTURED_NATIVE_IDENTITY');
  if(b.restoreReasons.includes('REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD'))focuses.push('COMPLETE_RECON_SOURCE_GATES');
  if(b.restoreReasons.includes('SCOPE_BINDING_REQUIRES_REVIEW'))focuses.push('REVIEW_SCOPE_LINKS');
  return {source:b.source,affectedDocuments:b.affectedDocuments,originalRestoreReasons:b.restoreReasons,roundingState:invoice.state,headerCheck:invoice.headerCheck,characterizedLineDelta:invoice.characterizedLineDelta,nextReviewFocus:focuses,restorationGateUnchanged:true,readyToImport:false,gateOverrideAllowed:false};
 });
 const result={format:'dgc-donor-rounding-impact-v1',snapshotHash:snapshot.snapshotHash,roundingReviewHash:reviewPin,registrationPlanHash:registrationPin,entries,counts:entries.reduce((a,e)=>(a[e.roundingState]=(a[e.roundingState]??0)+1,a),{}),postingAllowed:false,acceptance:false,readyToImport:false,gateOverrideAllowed:false,restorationGateUnchanged:true};return {...result,reviewHash:digest(result)};
}
