import {createRequire} from 'node:module';
import {canonical,digest,verifySnapshot} from './core.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {invoiceHistoryPlan} from './invoice-history.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),fields=['revenue','wht','payable'];
const sourceFields=['Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'],detailFields=['Revenue_USD','WHT_USD','Payable_USD'];
const same=(a,b)=>canonical(a)===canonical(b),addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const amounts=(v,names)=>Object.fromEntries(fields.map((f,i)=>[f,v[names[i]]]));
import {replayDonorInvoiceBalance,validInvoiceBalanceMoney as valid} from '../../packages/db/prisma/dgc-invoice-balance.mjs';
export {replayDonorInvoiceBalance};

// Read-only arithmetic evidence. This does not clear scope/PDF/lifecycle/AR
// holds, change a previous plan, authorize import or execute donor repair code.
export function invoiceBalanceReview(snapshot,targetPlan,combined,reviewPin,decisions){return withSourcePlanningCache(()=>{
 verifySnapshot(snapshot);verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 const scopes=revenueScopePlan(snapshot,targetPlan,combined,reviewPin,decisions);
 const raw=s=>{const t=snapshot.tables[s?.sheet],r=t?.rows.find(r=>r.sourceRow===s.sourceRow);if(!r||!same(addr(s.sheet,t,r),s))throw Error('Unbound captured Invoice balance source');return r;};
 const entries=scopes.invoices.map(inv=>{
  const groups=inv.scopes.flatMap(s=>s.items).filter(item=>item.presentationMode==='CHILD_EXPANDED_CAPTURED').map(item=>{
   const reasons=[],total=raw(item.source),own=inv.lineMappings.filter(m=>same(m.totalSource,item.source)),g=targetPlan.groups.find(g=>g.groupKey===item.sourceGroupKey);
   const children=g.entries.filter(e=>e.aggregationMapping.rowType==='CHILD'&&same(e.bindings.Parent_Service_ID,g.entries.find(e=>same(e.source,item.source))?.bindings.Service_ID)&&e.sourceStatus==='Approved'&&valid(e.capturedInvoiceUsd.Invoice_Payable_USD)&&D(e.capturedInvoiceUsd.Invoice_Payable_USD).gt(0));
   if(!children.length||children.length!==own.length||children.some(e=>!own.some(m=>same(m.revenueSource,e.source))))reasons.push('INCOMPLETE_CAPTURED_CHILD_MEMBERSHIP');
   let replay=null,lines=[];
   try{
    replay=replayDonorInvoiceBalance(amounts(total.values,sourceFields),children.map(e=>{const r=raw(e.source);return {...amounts(r.values,sourceFields),orderKey:String(r.values.Source_Recon_Detail_ID||r.values.Revenue_ID||'')};}));
    lines=own.map(m=>{const r=raw(m.revenueSource),d=raw(m.detailSource),key=String(r.values.Source_Recon_Detail_ID||r.values.Revenue_ID||''),expected=replay.lines.find(l=>l.orderKey===key),captured=amounts(d.values,detailFields);if(!fields.every(f=>valid(captured[f])))throw Error('Invalid captured presentation money');return {source:m.detailSource,revenueSource:m.revenueSource,lineNo:d.values.Line_No,orderKey:key,before:expected?.before??null,expected:expected?.after??null,captured:Object.fromEntries(fields.map(f=>[f,D(captured[f]).toFixed()])),delta:expected?.delta??null,matches:!!expected&&same(expected.after,Object.fromEntries(fields.map(f=>[f,D(captured[f]).toFixed()])))};}).sort((a,b)=>Number(a.lineNo)-Number(b.lineNo));
    if(lines.some((l,i)=>!Number.isSafeInteger(l.lineNo)||l.lineNo<1||(i&&l.lineNo===lines[i-1].lineNo))||!same(lines.map(l=>l.orderKey),replay.lines.map(l=>l.orderKey)))reasons.push('CAPTURED_LINE_ORDER_DIFFERS_FROM_DONOR');
    if(lines.some(l=>!l.matches)||!replay.totalsMatch||!replay.numberAndDecimalAgree)reasons.push('CAPTURED_COMPONENTS_DO_NOT_MATCH_DONOR_BALANCING');
   }catch{reasons.push('DONOR_BALANCING_INPUT_UNAVAILABLE');}
   const changed=!!replay?.lines.some(l=>fields.some(f=>l.delta[f]!=='0'));
   return {totalSource:item.source,sourceGroupKey:item.sourceGroupKey,state:reasons.length?'CAPTURED_GROUP_BALANCING_HELD':changed?'CAPTURED_DONOR_GROUP_BALANCING_MATCH':'CAPTURED_CHILD_COMPONENTS_ALREADY_EXACT',reasons,replay,lines,sourceGroupState:g.state,sourceEvidenceState:item.sourceEvidenceState};
  });
  return {source:inv.source,state:!groups.length?'NO_CHILD_EXPANSION':groups.some(g=>g.reasons.length)?'CAPTURED_GROUP_BALANCING_HELD':groups.some(g=>g.state==='CAPTURED_DONOR_GROUP_BALANCING_MATCH')?'CAPTURED_DONOR_GROUP_BALANCING_MATCH':'CAPTURED_CHILD_COMPONENTS_ALREADY_EXACT',groups,originalScopeIssues:inv.issues,originalFinancialReasons:inv.financialReasons,headerChecks:inv.headerChecks??[],readyToImport:false,gateOverrideAllowed:false};
 });
 const body={format:'dgc-donor-invoice-group-balance-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,combinedReviewHash:reviewPin,scopePlanHash:scopes.planHash,decisionsHash:decisions?digest(decisions):null,recipe:'V61_GROUP_LAST_CHILD_INDEPENDENT_COMPONENT_BALANCE',entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),sourceValuesChanged:false,originalGatesUnchanged:true,pdfSemanticsVerified:false,postingAllowed:false,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...body,reviewHash:digest(body)};
});}
export function verifyInvoiceBalanceReview(review,...args){const {reviewHash,...body}=review??{};if(reviewHash!==digest(body)||!same(review,invoiceBalanceReview(...args)))throw Error('Invoice balancing review differs from pinned source');return review;}

export function invoiceBalancePlan(options){return withSourcePlanningCache(()=>{
 const {invoiceOptions:i}=options,base=invoiceRoundingPlan(options),review=invoiceBalanceReview(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),history=invoiceHistoryPlan(i.snapshot,i.decisions);
 const entries=base.entries.map(e=>{
  const b=review.entries.find(b=>same(b.source,e.source)),c=options.rounding.invoices.find(c=>same(c.source,e.source)),reasons=[];
  if(!same(e.reasons,['HEADER_LINE_ROUNDING_NOT_CHARACTERIZED','OTHER_CAPTURED_FINANCE_DIFFERENCE']))reasons.push('OTHER_INVOICE_SOURCE_SCOPE_OR_FINANCIAL_HOLD');
  if(b?.state!=='CAPTURED_DONOR_GROUP_BALANCING_MATCH'||b.originalScopeIssues.length||b.originalFinancialReasons.some(r=>r!=='CAPTURED_INVOICE_FINANCE_REQUIRES_REVIEW')||b.headerChecks.some(c=>c.state!=='MATCH'))reasons.push('DONOR_BALANCE_OR_SCOPE_NOT_EXACT');
  if(c?.headerCheck?.state!=='MATCH'||c.headerCheck.difference!=='0'||c.otherChecks.length||c.issues.length)reasons.push('OTHER_CAPTURED_HEADER_HOLD');
  const h=history.entries.find(h=>same(h.source,e.source));
  if(!h||h.issues.length||h.amountIssues.length||h.amountDifferences.some(d=>!['LINE_REVENUE_MINUS_WHT','REVENUE_SOURCE_Revenue_USD','REVENUE_SOURCE_WHT_USD','REVENUE_SOURCE_Payable_USD'].includes(d.code)))reasons.push('OTHER_CAPTURED_FINANCIAL_DIFFERENCE');
  const balanced=new Map((b?.groups??[]).flatMap(g=>g.lines.map(l=>[canonical(l.source),l])));
  const lines=(c?.lines??[]).map(l=>{
   const adjusted=balanced.get(canonical(l.source)),prior=e.invoiceRounding?.lines?.find(x=>same(x.source,l.source));
   const source=i.snapshot.tables['40_MONTHLY_REVENUE'].rows.find(r=>r.sourceRow===l.revenueSource?.sourceRow),sourceComponents=source&&sourceFields.every(f=>valid(source.values[f]))?Object.fromEntries(fields.map((f,n)=>[f,D(source.values[sourceFields[n]]).toFixed()])):null;
   if(!adjusted&&l.checks.some(c=>c.state!=='MATCH'))reasons.push('OTHER_PRESENTATION_SOURCE_DIFFERENCE');
   const components=Object.fromEntries(l.checks.map(c=>[({Revenue_USD:'revenue',WHT_USD:'wht',Payable_USD:'payable'})[c.field],c.actual]));
   const totalSource=adjusted?b.groups.find(g=>g.lines.includes(adjusted)).totalSource:prior?.totalSource;
   if(!sourceComponents||!totalSource||!fields.every(f=>valid(components[f])))reasons.push('INCOMPLETE_PRESENTATION_BINDING');
   return {source:l.source,revenueSource:l.revenueSource,totalSource,components,sourceComponents,identityDelta:fields.every(f=>valid(components[f]))?D(components.payable).minus(D(components.revenue).minus(components.wht)).toFixed():null};
  });
  const sourceRevenueSet=i.targetPlan.groups.filter(g=>e.revenueGroupKeys.includes(g.groupKey)).flatMap(g=>g.entries.map(r=>r.source)).sort((a,b)=>a.sheetId-b.sheetId||a.sourceRow-b.sourceRow);
  const candidate=!reasons.length,invoiceRounding=candidate?{format:'DGC_CAPTURED_INVOICE_ROUNDING_V4',headerArithmetic:'DONOR_GROUP_LAST_CHILD_BALANCING',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:i.snapshot.snapshotHash,source:e.source,sourceRestorePlanHash:i.restorePlan.planHash,characterizationReviewHash:options.roundingPin,revenueExceptionPlanHash:options.exceptionPlan.planHash,balanceReviewHash:review.reviewHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components:{revenue:e.invoice.revenueAmount,wht:e.invoice.whtAmount,payable:e.invoice.payableAmount},identityDelta:'0',characterizedLineDelta:'0',lines,sourceRevenueSet,sourceReceivable:e.receivable.source,sourceValuesChanged:false,historicalCashPosting:false,localApprovalCreated:false,acceptance:false}:null;
  return {...e,state:candidate?'INVOICE_GROUP_BALANCE_SHAPE_CANDIDATE':'INVOICE_GROUP_BALANCE_SHAPE_HELD',originalRoundingReasons:e.reasons,reasons:[...new Set(reasons)],invoiceRounding,readyToImport:false};
 });
 const body={format:'dgc-invoice-group-balance-shape-plan-v1',snapshotHash:i.snapshot.snapshotHash,originalRoundingPlanHash:base.planHash,balanceReviewHash:review.reviewHash,entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),originalGatesUnchanged:true,postingAllowed:false,acceptance:false,commitAllowed:false,historicalCashPosting:false};return {...body,planHash:digest(body)};
});}
export function verifyInvoiceBalancePlan(plan,options){const {planHash,...body}=plan??{};if(planHash!==digest(body)||!same(plan,invoiceBalancePlan(options)))throw Error('Invoice balancing shape plan differs from pinned source');return plan;}
