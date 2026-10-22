import {canonical,digest} from './core.mjs';
import {memoSourcePlan} from './planning-context.mjs';
import {referenceGraph} from './graph.mjs';
import {revenueBillingPlan} from './revenue-billing.mjs';
import {capturedMonth} from './recon-semantics.mjs';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v));
const key=s=>`${s.sheet}|${s.sourceRow}`,same=(a,b)=>canonical(a)===canonical(b);
const money=v=>{try{if(!['number','string'].includes(typeof v)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v))||String(v).replace(/\D/g,'').length>80)return null;return D(v);}catch{return null;}};
const sum=values=>{const parsed=values.map(money);return parsed.some(v=>v===null)?null:parsed.reduce((a,v)=>a.plus(v),D(0)).toFixed();};
const fields=[['revenue','Invoice_Revenue_USD','Revenue_USD','Total_Revenue_USD'],['wht','Invoice_WHT_USD','WHT_USD','Total_WHT_USD'],['payable','Invoice_Payable_USD','Payable_USD','Total_Payable_USD']];

// Target InvoiceScopeItem links authoritative TOTAL revenue, while immutable
// Invoice snapshots retain the ACTUAL donor lines. Never call a generator to
// recreate old child expansion, rounding adjustments, or a cancelled revision.
export function revenueScopePlan(snapshot,targetPlan,combined,pin,decisions){
 return memoSourcePlan(snapshot,'revenue-scopes',[snapshot,targetPlan,combined,pin,decisions],()=>buildRevenueScopePlan(snapshot,targetPlan,combined,pin,decisions));
}
function buildRevenueScopePlan(snapshot,targetPlan,combined,pin,decisions){
 const billing=revenueBillingPlan(snapshot,targetPlan,combined,pin,decisions),graph=referenceGraph(snapshot,decisions),links=new Map(graph.links.map(l=>[`${key(l.source)}|${l.field}`,l]));
 const entries=new Map(targetPlan.groups.flatMap(g=>g.entries.map(e=>[key(e.source),{entry:e,group:g}]))),billed=new Map(billing.rows.map(r=>[key(r.source),r]));
 const active=billing.invoices.filter(i=>i.disposition!=='PRESERVE_HISTORY_ONLY'),invoices=[];
 for(const inv of billing.invoices){
  const header=JSON.parse(inv.capturedHeaderJson),details=JSON.parse(inv.capturedDetailsJson),archive=inv.disposition==='PRESERVE_HISTORY_ONLY',issues=[],lineMappings=[];
  if(archive){invoices.push({source:inv.source,disposition:inv.disposition,bindingState:'ARCHIVE_ONLY_NO_CURRENT_SCOPE',scopes:[],lineMappings:[],issues:[],financialReasons:[],proposedRevenueStatuses:[],capturedHeaderJson:inv.capturedHeaderJson,capturedDetailsJson:inv.capturedDetailsJson,readyToImport:false,createCurrentScope:false});continue;}
  const invoiceMode=({all:'CONSOLIDATED',consolidated:'CONSOLIDATED',service:'PER_SERVICE',per_service:'PER_SERVICE'})[String(header.values.Invoice_Mode??'').trim().toLowerCase()]??null;
  if(!invoiceMode)issues.push({code:'UNKNOWN_CAPTURED_INVOICE_MODE'});
  for(const d of details){
   const source={sheet:d.sheet,sheetId:d.sheetId,sourceRow:d.sourceRow,legacyId:d.legacyId,rowHash:d.rowHash},link=links.get(`${key(source)}|Revenue_ID`),bound=link?.target?entries.get(key(link.target)):null;
   if(!bound){issues.push({code:'UNRESOLVED_DETAIL_REVENUE',detailSource:source});lineMappings.push({detailSource:source,revenueSource:null,totalSource:null});continue;}
   const {entry:e,group:g}=bound,kind=e.aggregationMapping.rowType;
   if(g.period!==capturedMonth(header,'Revenue_Month')||g.currency!==String(header.values.Currency)||String(e.capturedRevenue.values.Partner_ID)!==String(header.values.Partner_ID))issues.push({code:'INVOICE_AND_SOURCE_SCOPE_CONFLICT',detailSource:source});
   const parents=kind==='TOTAL'?[e]:kind==='CHILD'&&e.bindings.Parent_Service_ID?g.entries.filter(t=>t.aggregationMapping.rowType==='TOTAL'&&t.bindings.Service_ID&&same(t.bindings.Service_ID,e.bindings.Parent_Service_ID)):[];
   const parent=parents.length===1?parents[0]:null;
   if(!parent)issues.push({code:'AUTHORITATIVE_TOTAL_NOT_UNIQUE_IN_SOURCE_GROUP',detailSource:source});
   if(parent&&parent.aggregationMapping.includeInMonthlyTotal!==true)issues.push({code:'AUTHORITATIVE_TOTAL_NOT_BILLABLE_Y',totalSource:parent.source});
   if(!g.partnerSource||!g.contractSource||!e.bindings.Service_ID||!parent?.bindings.Service_ID)issues.push({code:'UNRESOLVED_SCOPE_MASTER',detailSource:source});
   if(e.sourceStatus!=='Approved'||parent?.sourceStatus!=='Approved')issues.push({code:'PREAPPROVAL_SCOPE_SOURCE',detailSource:source});
   lineMappings.push({detailSource:source,revenueSource:e.source,totalSource:parent?.source??null,sourceGroupKey:g.groupKey,presentationKind:kind,capturedAmounts:Object.fromEntries(fields.map(([f,,line])=>[f,d.values[line]??null]))});
  }
  const totals=new Map(lineMappings.filter(l=>l.totalSource).map(l=>[key(l.totalSource),entries.get(key(l.totalSource))])),items=[];
  for(const [k,{entry:e,group:g}] of totals){
   const own=lineMappings.filter(l=>l.totalSource&&key(l.totalSource)===k),totalLines=own.filter(l=>l.presentationKind==='TOTAL'),childLines=own.filter(l=>l.presentationKind==='CHILD');
   const children=g.entries.filter(c=>c.aggregationMapping.rowType==='CHILD'&&c.bindings.Parent_Service_ID&&same(c.bindings.Parent_Service_ID,e.bindings.Service_ID));
   // The donor selects positive Approved child rows. Other captured children
   // remain evidence; do not erase them or infer new arithmetic for their money.
   const expectedChildren=children.filter(c=>c.sourceStatus==='Approved'&&money(c.capturedInvoiceUsd.Invoice_Payable_USD)?.gt(0));
   if(children.some(c=>c.sourceStatus==='Approved'&&!money(c.capturedInvoiceUsd.Invoice_Payable_USD)))issues.push({code:'CHILD_BILLING_ELIGIBILITY_UNKNOWN',totalSource:e.source});
   const mode=totalLines.length&&childLines.length?'MIXED':totalLines.length?'TOTAL_ONLY_CAPTURED':'CHILD_EXPANDED_CAPTURED';
   if(mode==='MIXED')issues.push({code:'TOTAL_AND_CHILD_BILLED_TOGETHER',totalSource:e.source});
   if(totalLines.length>1||new Set(childLines.map(l=>key(l.revenueSource))).size!==childLines.length)issues.push({code:'DUPLICATE_PRESENTATION_COVERAGE',totalSource:e.source});
   if(mode==='CHILD_EXPANDED_CAPTURED'&&(childLines.length!==expectedChildren.length||expectedChildren.some(c=>!childLines.some(l=>same(l.revenueSource,c.source)))))issues.push({code:'INCOMPLETE_OR_EXTRA_CHILD_EXPANSION',totalSource:e.source});
   const reservations=[e,...children].flatMap(c=>{const b=billed.get(key(c.source));return [...b.scopeReservations,...b.unresolvedParentLines,...b.directCurrentLines.filter(l=>!same(l.invoiceSource,inv.source))].map(r=>({revenueSource:c.source,evidence:r}));});
   if(reservations.length)issues.push({code:'SOURCE_SCOPE_RESERVED_OR_REFERENCED_ELSEWHERE',totalSource:e.source,reservations});
   const comparisons=fields.map(([field,sourceField])=>{const capturedTotal=e.capturedInvoiceUsd[sourceField],capturedLineSum=sum(own.map(l=>l.capturedAmounts[field]));return {field,capturedTotal,capturedLineSum,state:capturedTotal===null||capturedLineSum===null?'UNAVAILABLE':D(capturedTotal).eq(capturedLineSum)?'MATCH':'MISMATCH',difference:capturedTotal===null||capturedLineSum===null?null:D(capturedLineSum).minus(D(capturedTotal)).toFixed()};});
   items.push({source:e.source,sourceGroupKey:g.groupKey,partnerSource:g.partnerSource,contractSource:g.contractSource,period:g.period,currency:g.currency,presentationMode:mode,detailSources:own.map(l=>l.detailSource),presentationRevenueSources:own.map(l=>l.revenueSource),capturedTotalBasis:e.capturedInvoiceUsd,scopeItemAmount:e.capturedInvoiceUsd.Invoice_Payable_USD,comparisons,unusedChildSources:mode==='TOTAL_ONLY_CAPTURED'?children.map(c=>c.source):[],sourceBusinessState:g.state,sourceEvidenceState:billed.get(k).evidenceState});
  }
  if(!details.length||!items.length)issues.push({code:'EMPTY_INVOICE_SCOPE'});
  const financialReasons=[];
  if(inv.integrity!=='STRUCTURAL_CHECKS_PASSED')issues.push({code:'INVOICE_STRUCTURE_REQUIRES_REVIEW'});
  if(inv.sourceLifecycleIssues.length)issues.push({code:'INVOICE_SOURCE_LIFECYCLE_REQUIRES_REVIEW'});
  if(inv.amountDifferences.length||inv.amountIssues.length)financialReasons.push('CAPTURED_INVOICE_FINANCE_REQUIRES_REVIEW');
  if(items.some(i=>i.comparisons.some(c=>c.state!=='MATCH')))financialReasons.push('CAPTURED_TOTAL_AND_PRESENTATION_DIFFER');
  const headerChecks=fields.map(([field,sourceField,,headerField])=>{const actual=header.values[headerField]??null,expected=sum(items.map(i=>i.capturedTotalBasis[sourceField]));return {field,actual,expected,state:money(actual)===null||expected===null?'UNAVAILABLE':D(actual).eq(expected)?'MATCH':'MISMATCH'};});
  if(headerChecks.some(c=>c.state!=='MATCH'))financialReasons.push('AUTHORITATIVE_TOTALS_AND_INVOICE_HEADER_DIFFER');
  if(invoiceMode==='PER_SERVICE'&&new Set(items.map(i=>canonical(entries.get(key(i.source)).entry.bindings.Service_ID))).size!==1)issues.push({code:'PER_SERVICE_INVOICE_HAS_MULTIPLE_TOTAL_SERVICES'});
  const contracts=new Map();for(const item of items){const contractKey=canonical([item.partnerSource,item.contractSource,item.period,item.currency]),list=contracts.get(contractKey)??[];list.push(item);contracts.set(contractKey,list);}
  const scopes=[...contracts.entries()].map(([scopeKey,items])=>({proposalScopeKey:digest(['DGC_HISTORY_SCOPE',inv.source,scopeKey]),partnerSource:items[0].partnerSource,contractSource:items[0].contractSource,period:items[0].period,currency:items[0].currency,capturedInvoiceMode:header.values.Invoice_Mode??null,proposedInvoiceMode:invoiceMode,proposedScopeStatus:inv.disposition==='PREPARE_UNISSUED_DRAFT'?'INVOICE_READY':'INVOICED',totalAmount:sum(items.map(i=>i.scopeItemAmount)),items:items.map((item,idx)=>({...item,proposedLineNo:idx+1})),readyToImport:false,isCurrent:false}));
  const status=String(header.values.Status).toUpperCase(),mapped=({'PAID':'PAID','PARTIALLY PAID':'PARTIALLY_PAID','ISSUED':'INVOICED','OVERDUE':'INVOICED'})[status]??null;
  // All direct presentation rows must already have passed the billing bridge;
  // status is proposed only for authoritative TOTALs, never copied to children.
  const presentationStatuses=lineMappings.map(l=>l.revenueSource?billed.get(key(l.revenueSource))?.proposedRevenueStatus:null);
  const statusValid=!issues.length&&!financialReasons.length&&mapped&&presentationStatuses.length&&presentationStatuses.every(s=>s===mapped);
  invoices.push({source:inv.source,disposition:inv.disposition,bindingState:issues.length?'SCOPE_BINDING_REQUIRES_REVIEW':'STRUCTURAL_SCOPE_BOUND',scopes,lineMappings,headerChecks,issues,financialReasons,proposedRevenueStatuses:items.map(i=>({source:i.source,status:statusValid?mapped:null})),statusPropagationScope:'AUTHORITATIVE_TOTAL_SCOPE_ITEMS_ONLY',capturedHeaderJson:inv.capturedHeaderJson,capturedDetailsJson:inv.capturedDetailsJson,readyToImport:false,createCurrentScope:false});
 }
 // Current invoices cannot share the same authoritative TOTAL, even when their
 // printed lines reference different children or different invoice modes.
 const ownership=new Map();for(const inv of invoices.filter(i=>i.disposition!=='PRESERVE_HISTORY_ONLY'))for(const s of inv.scopes)for(const item of s.items){const all=ownership.get(key(item.source))??[];all.push(inv);ownership.set(key(item.source),all);}
 for(const [sourceKey,owners] of ownership)if(owners.length>1)for(const inv of owners){inv.issues.push({code:'MULTIPLE_CURRENT_INVOICES_CLAIM_TOTAL',sourceKey,invoiceSources:owners.map(i=>i.source)});inv.bindingState='SCOPE_BINDING_REQUIRES_REVIEW';for(const r of inv.proposedRevenueStatuses)r.status=null;}
 const report={format:'dgc-revenue-scope-proposal-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,billingPlanHash:billing.planHash,combinedReviewHash:pin,mode:'PROPOSAL_ONLY_NO_DATABASE_WRITER',invoices,counts:invoices.reduce((a,i)=>(a[i.bindingState]=(a[i.bindingState]??0)+1,a),{}),activeInvoiceCount:active.length,presentationModeCounts:invoices.flatMap(i=>i.scopes.flatMap(s=>s.items)).reduce((a,i)=>(a[i.presentationMode]=(a[i.presentationMode]??0)+1,a),{}),readyToImport:false,postingAllowed:false,acceptance:false,historicalCashPosting:false,recomputeAmounts:false,targetScopeMappingAccepted:false,localApprovalCreated:false};
 return {...report,planHash:digest(report)};
}

export function verifyRevenueScopePlan(plan,...inputs){const {planHash,...body}=plan??{};if(planHash!==digest(body))throw Error('Revenue scope proposal checksum differs');if(!same(plan,revenueScopePlan(...inputs)))throw Error('Revenue scope proposal differs from pinned source evidence');return plan;}
