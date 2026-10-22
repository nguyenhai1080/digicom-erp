import {canonical,digest} from './core.mjs';
import {memoSourcePlan} from './planning-context.mjs';
import {referenceGraph} from './graph.mjs';
import {invoiceHistoryPlan} from './invoice-history.mjs';
import {revenueLifecyclePlan} from './revenue-lifecycle.mjs';
import {capturedMonth} from './recon-semantics.mjs';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120});
const positive=v=>v!==null&&v!==undefined&&text(v)!==''&&new Decimal(String(v)).gt(0);
const zero=v=>v!==null&&v!==undefined&&text(v)!==''&&new Decimal(String(v)).isZero();

const key=s=>`${s.sheet}|${s.sourceRow}`;
const same=(a,b)=>canonical(a)===canonical(b);
const text=v=>v==null?'':String(v).trim();
const status=v=>text(v).toUpperCase();
const truth=v=>v===true||status(v)==='TRUE';
const archives=new Set(['CANCELLED','CANCELED','SUPERSEDED']);

// Read-only bridge. Direct line coverage is distinct from a TOTAL billing
// container: the donor can expand a TOTAL into CHILD lines. Never allocate an
// invoice-level receipt to a child, add TOTAL + CHILD, or infer Invoice Ready
// from absence of a resolved line. Unresolved links still reserve their scope.
export function revenueBillingPlan(snapshot,targetPlan,combined,pin,decisions){
 return memoSourcePlan(snapshot,'revenue-billing',[snapshot,targetPlan,combined,pin,decisions],()=>buildRevenueBillingPlan(snapshot,targetPlan,combined,pin,decisions));
}
function buildRevenueBillingPlan(snapshot,targetPlan,combined,pin,decisions){
 const lifecycle=revenueLifecyclePlan(snapshot,targetPlan,combined,pin,decisions),graph=referenceGraph(snapshot,decisions),history=invoiceHistoryPlan(snapshot,decisions);
 const raw=new Map(),addresses=new Map();
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const r of t.rows){const a={sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash};raw.set(key(a),r);addresses.set(key(a),a);}
 const links=new Map(graph.links.map(l=>[`${key(l.source)}|${l.field}`,l]));
 const link=(r,f)=>links.get(`${key(r)}|${f}`),targets=l=>l?.target?[l.target]:(l?.evidence??[]).map(e=>e.target);
 const invoices=new Map(history.entries.map(e=>[key(e.source),e])),details=snapshot.tables['49_INVOICE_DETAIL'].rows.map(r=>addresses.get(`49_INVOICE_DETAIL|${r.sourceRow}`));
 const lifecycleRows=new Map(lifecycle.groups.flatMap(g=>g.rows.map(r=>[key(r.source),{group:g,row:r}])));
 const invoiceSourceIssues=new Map(history.entries.map(i=>[key(i.source),i.capturedDetails.flatMap(d=>{
  const source={sheet:d.sheet,sourceRow:d.sourceRow},l=link(source,'Revenue_ID'),r=l?.target?lifecycleRows.get(key(l.target)):null;
  return !r||r.row.sourceStatus!=='Approved'||r.row.proposedRevenueStatus==='SUPERSEDED'||r.group.proposedReconciliationStatus!=='APPROVED'?[{detailSource:addresses.get(key(source)),revenueSource:l?.target??null,code:'INVOICE_SOURCE_LIFECYCLE_REQUIRES_REVIEW'}]:[];
 })]));
 const rows=targetPlan.groups.flatMap(g=>g.entries.map(e=>{
  const state=lifecycleRows.get(key(e.source)),direct=[],scopeReservations=[];
  for(const d of details){
   const rv=link(d,'Revenue_ID'),inv=link(d,'Invoice_ID'),sv=link(d,'Service_ID'),values=raw.get(key(d)).values;
   const directCandidate=targets(rv).some(a=>same(a,e.source));
   // A broken Revenue_ID cannot release a same-partner/service/month Invoice.
   // Keep raw Service_ID as a conservative fallback; do not resolve aliases.
   const serviceMatch=targets(sv).some(a=>same(a,e.bindings.Service_ID))||text(values.Service_ID)===text(e.capturedRevenue.values.Service_ID);
   for(const a of targets(inv)){
    const invoice=invoices.get(key(a));if(!invoice)throw Error('Invoice candidate outside verified history');
    const h=invoice.capturedHeader,scopeMatch=serviceMatch&&text(h.values.Partner_ID)===text(e.capturedRevenue.values.Partner_ID)&&capturedMonth(h,'Revenue_Month')===g.period;
    if(directCandidate)direct.push({detailSource:d,invoiceSource:a,referenceState:rv.target&&inv.target?'RESOLVED':'UNRESOLVED',referenceIssues:[rv,inv].filter(l=>!l?.target).map(l=>({field:l?.field??null,state:l?.state??'MISSING'}))});
    else if(scopeMatch&&!archives.has(status(h.values.Status)))scopeReservations.push({detailSource:d,invoiceSource:a,reason:'SAME_PARTNER_SERVICE_MONTH_WITHOUT_EXACT_REVENUE_LINK'});
   }
   // A line with no invoice candidate must remain visible to the row it names.
   if(directCandidate&&!targets(inv).length)direct.push({detailSource:d,invoiceSource:null,referenceState:'UNRESOLVED',referenceIssues:[{field:'Invoice_ID',state:inv?.state??'MISSING'}]});
   else if(serviceMatch&&!targets(inv).length)scopeReservations.push({detailSource:d,invoiceSource:null,reason:'UNKNOWN_INVOICE_PARENT_WITH_SAME_SERVICE_NO_SCOPE_PROOF'});
  }
  const current=direct.filter(d=>d.invoiceSource&&!archives.has(status(invoices.get(key(d.invoiceSource)).sourceStatus))),archived=direct.filter(d=>d.invoiceSource&&archives.has(status(invoices.get(key(d.invoiceSource)).sourceStatus))),reasons=[];
  const currentKeys=[...new Set(current.map(d=>key(d.invoiceSource)))];
  let proposed=null,classification='NO_DIRECT_CURRENT_INVOICE_REQUIRES_REVIEW';
  if(state.row.proposedRevenueStatus==='SUPERSEDED'){proposed='SUPERSEDED';classification='AUDIT_BOUND_REPLACED_SOURCE';if(current.length)reasons.push('CURRENT_INVOICE_REFERENCES_REPLACED_SOURCE');}
  else if(e.sourceStatus!=='Approved'){classification='PREAPPROVAL_SOURCE';if(current.length)reasons.push('CURRENT_INVOICE_REFERENCES_UNAPPROVED_SOURCE');}
  else if(state.group.proposedReconciliationStatus!=='APPROVED'){classification='SOURCE_LIFECYCLE_REQUIRES_REVIEW';reasons.push('SOURCE_RECONCILIATION_NOT_CONFIRMED_ACTIVE_APPROVED');}
  else if(current.length){
   classification='CURRENT_INVOICE_REQUIRES_REVIEW';
   if(currentKeys.length!==1)reasons.push('MULTIPLE_CURRENT_INVOICE_CANDIDATES');
   if(current.length!==1)reasons.push('REPEATED_REVENUE_LINE_COVERAGE');
   if(current.some(d=>d.referenceState!=='RESOLVED'))reasons.push('UNRESOLVED_CURRENT_LINE_REFERENCE');
   for(const k of currentKeys){const i=invoices.get(k),h=i.capturedHeader.values;
    if(invoiceSourceIssues.get(k).length)reasons.push('INVOICE_SOURCE_LIFECYCLE_REQUIRES_REVIEW');
    if(i.integrity!=='STRUCTURAL_CHECKS_PASSED')reasons.push('INVOICE_STRUCTURE_REQUIRES_REVIEW');
    if(i.amountDifferences.length||i.amountIssues.length)reasons.push('INVOICE_AMOUNTS_REQUIRE_REVIEW');
    if(!truth(h.Is_Current))reasons.push('INVOICE_NOT_EXPLICITLY_CURRENT');
    if(truth(h.Needs_Regeneration))reasons.push('INVOICE_NEEDS_REGENERATION');
    if(status(h.Status)==='DRAFT')reasons.push('UNISSUED_DRAFT_RESERVES_SOURCE');
    if(!['ISSUED','OVERDUE','PARTIALLY PAID','PAID','DRAFT'].includes(status(h.Status)))reasons.push('UNSUPPORTED_INVOICE_STATUS');
    if(text(h.Currency)!==g.currency)reasons.push('INVOICE_CURRENCY_CONFLICT');
    for(const ar of i.capturedReceivables.filter(r=>!archives.has(status(r.values.Status))&&status(r.values.Is_Current)!=='FALSE')){
     if(!truth(ar.values.Is_Current))reasons.push('AR_NOT_EXPLICITLY_CURRENT');
     const expected=status(h.Status)==='PAID'?'PAID':status(h.Status)==='PARTIALLY PAID'?'PARTIAL':'OPEN';
     if(status(ar.values.Status)!==expected)reasons.push('AR_STATUS_CONFLICT');
    }
   }
   if(!reasons.length){const i=invoices.get(currentKeys[0]);proposed=({'ISSUED':'INVOICED','OVERDUE':'INVOICED','PARTIALLY PAID':'PARTIALLY_PAID','PAID':'PAID'})[status(i.sourceStatus)]??null;
    // Preserve captured status; do not invoke either donor tolerance function
    // or current-date overdue calculation. Exact ledger review remains a gate.
    const h=i.capturedHeader.values;
    if(proposed==='PAID'&&!(positive(h.Total_Payable_USD)&&zero(h.Outstanding_Amount_USD))||proposed==='PARTIALLY_PAID'&&!(positive(h.Paid_Amount_USD)&&positive(h.Outstanding_Amount_USD))||proposed==='INVOICED'&&!(zero(h.Paid_Amount_USD)&&positive(h.Outstanding_Amount_USD))){reasons.push('CAPTURED_STATUS_BALANCE_CONFLICT');proposed=null;}
    classification=proposed?'DIRECT_CURRENT_INVOICE_STATE_PROPOSED':'CURRENT_INVOICE_REQUIRES_REVIEW';
   }
  }
  if(scopeReservations.length){reasons.push('BUSINESS_SCOPE_RESERVATION_REQUIRES_REVIEW');if(proposed!=='SUPERSEDED'){proposed=null;classification='BUSINESS_SCOPE_REQUIRES_REVIEW';}}
  if(direct.some(d=>!d.invoiceSource)){reasons.push('UNRESOLVED_INVOICE_PARENT');if(proposed!=='SUPERSEDED'){proposed=null;classification='CURRENT_INVOICE_REQUIRES_REVIEW';}}
  return {source:e.source,groupKey:g.groupKey,sourceStatus:e.sourceStatus,sourceRowType:e.aggregationMapping.rowType,sourceIncludeInMonthlyTotal:e.aggregationMapping.includeInMonthlyTotal,evidenceState:state.group.evidenceState,businessState:g.state,classification,proposedRevenueStatus:proposed,reasons:[...new Set(reasons)],directCurrentLines:current,archivedLines:archived,unresolvedParentLines:direct.filter(d=>!d.invoiceSource),scopeReservations,
   capturedRevenueJson:state.row.capturedRevenueJson,invoiceReceiptAllocation:null,targetScopeMappingAccepted:false,rebillingAllowed:false,readyToImport:false,safeRehearsalStatus:'BLOCKED',safeRehearsalIsCurrent:false};
 }));
 // Informational parent/child coverage only; it must not assign a TOTAL the
 // settlement state of one child or count both as billed amounts.
 const sourceEntries=new Map(targetPlan.groups.flatMap(g=>g.entries.map(e=>[key(e.source),e])));
 for(const r of rows){const e=sourceEntries.get(key(r.source));r.childCoverage=r.sourceRowType==='TOTAL'&&e.bindings.Service_ID?rows.filter(c=>c.groupKey===r.groupKey&&c.sourceRowType==='CHILD'&&same(sourceEntries.get(key(c.source)).bindings.Parent_Service_ID,e.bindings.Service_ID)).map(c=>({source:c.source,directCurrentLines:c.directCurrentLines,proposedRevenueStatus:c.proposedRevenueStatus})):[];}
 const report={format:'dgc-revenue-billing-proposal-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,combinedReviewHash:pin,revenueLifecyclePlanHash:lifecycle.planHash,invoiceHistoryPlanHash:history.planHash,referencePlanHash:graph.planHash,mode:'PROPOSAL_ONLY_NO_DATABASE_WRITER',paymentScope:'ALL_CAPTURED_PAYMENTS_NO_AS_OF_CUTOFF',rows,
  invoices:history.entries.map(i=>({source:i.source,disposition:i.disposition,integrity:i.integrity,issues:i.issues,sourceLifecycleIssues:invoiceSourceIssues.get(key(i.source)),amountDifferences:i.amountDifferences,amountIssues:i.amountIssues,capturedHeaderJson:canonical(i.capturedHeader),capturedDetailsJson:canonical(i.capturedDetails),capturedReceivablesJson:canonical(i.capturedReceivables),capturedPaymentsJson:canonical(i.capturedPayments),historicalCashPosting:false,createCurrentAr:i.disposition==='PREPARE_CURRENT_LEDGER'?'REQUIRES_SEPARATE_RESTORE_ADAPTER':false})),
  counts:rows.reduce((a,r)=>(a[r.proposedRevenueStatus??'REQUIRES_REVIEW']=(a[r.proposedRevenueStatus??'REQUIRES_REVIEW']??0)+1,a),{}),reasonCounts:rows.flatMap(r=>r.reasons).reduce((a,r)=>(a[r]=(a[r]??0)+1,a),{}),readyToImport:false,postingAllowed:false,acceptance:false,recomputeAmounts:false,historicalCashPosting:false,localApprovalCreated:false};
 return {...report,planHash:digest(report)};
}

export function verifyRevenueBillingPlan(plan,...inputs){
 const {planHash,...body}=plan??{};
 if(planHash!==digest(body))throw Error('Revenue billing proposal checksum differs');
 const expected=revenueBillingPlan(...inputs);
 if(!same(plan,expected))throw Error('Revenue billing proposal differs from pinned source evidence');
 return plan;
}
