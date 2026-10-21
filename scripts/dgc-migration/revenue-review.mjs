import {createRequire} from 'node:module';
import {canonical,digest,sourceDate,text} from './core.mjs';
import {referenceGraph} from './graph.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:240}),D=v=>new Decimal(String(v));
const managementFields=['Gross_Revenue','Tax_Amount','Net_Revenue','Partner_Share','Company_Share'];
const invoiceFields=['Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'];
const key=r=>r.sheet+'|'+r.sourceRow;

// Source characterization and migration mapping only. Neither a runtime revenue
// generator nor an importer: no status promotion, missing-value default or FX.
export function revenueReview(snapshot,decisions){
 const graph=referenceGraph(snapshot,decisions),rows=new Map(),issues=[],checks=[],entries=[],groups=new Map();
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const r of t.rows)rows.set(key({sheet,...r}),{sheet,sheetId:t.sheetId,...r});
 const revenues=[...rows.values()].filter(r=>r.sheet==='40_MONTHLY_REVENUE');
 const addr=r=>({sheet:r.sheet,sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
 const outgoing=new Map();for(const l of graph.links){const list=outgoing.get(key(l.source))??[];list.push(l);outgoing.set(key(l.source),list);}
 const target=(r,field)=>{const link=(outgoing.get(key(r))??[]).find(l=>l.field===field);return link?.target?rows.get(key(link.target)):null;};
 const issue=(r,code,extra={})=>issues.push({source:addr(r),code,...extra});
 function number(r,field,{precision=20,scale=4}={}){
  const raw=r.values[field];if(raw===null||raw===undefined||text(raw)===''){issue(r,'MISSING_NUMBER',{field});return null;}
  if(!['string','number'].includes(typeof raw)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw))||String(raw).replace(/\D/g,'').length>80){issue(r,'INVALID_NUMBER',{field});return null;}
  const n=D(raw);if(!n.isFinite()){issue(r,'INVALID_NUMBER',{field});return null;}
  if(n.lt(0))issue(r,'NEGATIVE_NUMBER',{field});
  // Do not silently let PostgreSQL round a captured number during migration.
  if(n.decimalPlaces()>scale||n.abs().gte(D(10).pow(precision-scale)))issue(r,'TARGET_DECIMAL_PRECISION_LOSS',{field,precision,scale});
  return n;
 }
 function check(r,code,actual,expected,evidence=[],extra={}){checks.push({source:addr(r),code,state:actual===null||expected===null?'UNAVAILABLE':actual.eq(expected)?'MATCH':'MISMATCH',actual:actual?.toFixed()??null,expected:expected?.toFixed()??null,difference:actual!==null&&expected!==null?actual.minus(expected).toFixed():null,evidence:evidence.map(addr),...extra});}
 const subtract=(a,b)=>a!==null&&b!==null?a.minus(b):null;
 for(const r of revenues){
  const start=issues.length,v=r.values,currency=text(v.Currency),rowType=text(v.Revenue_Row_Type).toUpperCase(),flag=text(v.Include_In_Monthly_Total).toUpperCase();
  if(!r.legacyId||revenues.filter(x=>x.legacyId===r.legacyId).length!==1)issue(r,'MISSING_OR_DUPLICATE_REVENUE_ID');
  if(!['Draft','Submitted','Approved'].includes(v.Status))issue(r,'UNSUPPORTED_REVENUE_STATUS');
  if(!['USD','VND'].includes(currency))issue(r,'UNSUPPORTED_OPERATIONAL_CURRENCY',{currency});
  if(!((rowType==='TOTAL'&&flag==='Y')||(rowType==='CHILD'&&flag==='N')))issue(r,'NONCANONICAL_AGGREGATION_FLAGS',{rowType:v.Revenue_Row_Type??null,flag:v.Include_In_Monthly_Total??null});
  let period=null;
  try{period=/^\d{4}-(0[1-9]|1[0-2])$/.test(text(v.Revenue_Month))?text(v.Revenue_Month):sourceDate(r,'Revenue_Month')?.slice(0,7)??null;}catch{ /* unresolved dates stay private evidence */ }
  if(!period)issue(r,'UNRESOLVED_REVENUE_PERIOD');
  const bindings={};
  for(const field of ['Partner_ID','Contract_ID','Service_ID']){const t=target(r,field);bindings[field]=t?addr(t):null;if(!t)issue(r,'UNRESOLVED_REVENUE_MASTER',{field});}
  const contract=target(r,'Contract_ID');if(contract&&text(contract.values.Contract_Type).toUpperCase()!=='OUTPUT')issue(r,'NON_OUTPUT_REVENUE_CONTRACT');
  const parent=target(r,'Parent_Service_ID');if(text(v.Parent_Service_ID)&&!parent)issue(r,'UNRESOLVED_PARENT_SERVICE');
  if(rowType==='CHILD'&&!parent)issue(r,'CHILD_WITHOUT_PARENT_SERVICE');
  bindings.Parent_Service_ID=parent?addr(parent):null;
  const doc=target(r,'Source_Recon_Doc_ID'),detail=target(r,'Source_Recon_Detail_ID'),hasSource=Boolean(text(v.Source_Recon_Doc_ID)||text(v.Source_Recon_Detail_ID));
  bindings.Source_Recon_Doc_ID=doc?addr(doc):null;bindings.Source_Recon_Detail_ID=detail?addr(detail):null;
  if(hasSource&&(!doc||!detail))issue(r,'UNRESOLVED_REVENUE_PDF_SOURCE');
  if(doc&&detail&&key(target(detail,'Recon_Doc_ID')??{})!==key(doc))issue(r,'REVENUE_DETAIL_DOCUMENT_CONFLICT');
  const nums=Object.fromEntries([...managementFields,...invoiceFields].map(f=>[f,number(r,f,invoiceFields.includes(f)?{precision:20,scale:2}:undefined)]));
  check(r,'MANAGEMENT_NET_IDENTITY',nums.Net_Revenue,subtract(nums.Gross_Revenue,nums.Tax_Amount));
  check(r,'MANAGEMENT_COMPANY_IDENTITY',nums.Company_Share,subtract(nums.Net_Revenue,nums.Partner_Share));
  check(r,'INVOICE_USD_PAYABLE_IDENTITY',nums.Invoice_Payable_USD,subtract(nums.Invoice_Revenue_USD,nums.Invoice_WHT_USD));
  const share=number(r,'Share_Rate',{precision:9,scale:6});if(share!==null&&(share.lt(0)||share.gt(1)))issue(r,'SHARE_RATE_OUTSIDE_TARGET_RANGE');
  // The donor PDF importer writes Share_Rate=1, Partner_Share=0. Do not apply
  // the manual-entry share formula to those captured PDF-imported records.
  if(!hasSource){issue(r,'REVENUE_ORIGIN_REQUIRES_REVIEW');check(r,'MANUAL_PARTNER_SHARE_IDENTITY',nums.Partner_Share,nums.Net_Revenue!==null&&share!==null?nums.Net_Revenue.times(share):null,[],{scope:'ADVISORY_FORMULA_ONLY_NO_MANUAL_ORIGIN_ASSERTION'});}
  if(detail)for(const [rf,df] of [['Invoice_Revenue_USD','Remuneration_Provider_USD'],['Invoice_WHT_USD','WHT_USD'],['Invoice_Payable_USD','Partner_Revenue_USD']]){
   // Direct USD source only; missing values do not trigger the donor MZN/FX fallback.
   const value=number(detail,df,{precision:20,scale:2});check(r,'DIRECT_PDF_'+rf,nums[rf],value,[detail]);
  }
  const dependencies=[],unresolved=[],seen=new Set(),pending=[r];
  while(pending.length){const next=pending.pop();if(seen.has(key(next)))continue;seen.add(key(next));dependencies.push(addr(next));for(const l of outgoing.get(key(next))??[]){if(l.target)pending.push(rows.get(key(l.target)));else unresolved.push(l);}}
  if(unresolved.length)issue(r,'UNRESOLVED_REVENUE_DEPENDENCIES',{count:unresolved.length});
  const localChecks=checks.filter(c=>key(c.source)===key(r));
  const sourceKind=hasSource?'CAPTURED_PDF_REVENUE':'CAPTURED_WITHOUT_PDF_LINK';
  entries.push({source:addr(r),capturedRevenue:r,sourceStatus:v.Status,period,currency,rowType:v.Revenue_Row_Type??null,includeFlag:v.Include_In_Monthly_Total??null,monthlyInventoryIncluded:v.Status==='Approved'&&rowType==='TOTAL'&&flag==='Y',sourceKind,bindings,
   capturedManagement:Object.fromEntries(managementFields.map(f=>[f,nums[f]?.toFixed()??null])),capturedInvoiceUsd:Object.fromEntries(invoiceFields.map(f=>[f,nums[f]?.toFixed()??null])),capturedShareRate:share?.toFixed()??null,
   aggregationMapping:{rowType:['TOTAL','CHILD'].includes(rowType)?rowType:null,includeInMonthlyTotal:['Y','N'].includes(flag)?flag==='Y':null,parentServiceSource:parent?addr(parent):null},
   reviewState:issues.length>start||localChecks.some(c=>c.state!=='MATCH')?'REVIEW_REQUIRED':'STRUCTURALLY_PREPARED',dependencies,unresolvedDependencies:unresolved,readyToImport:false,postingAllowed:false,recomputeAmounts:false,
   remainingGates:['VERIFIED_ORIGINAL_RECON_FILES','RECONCILIATION_AND_REVENUE_TARGET_MAPPING','PRESERVE_STATUS_AND_HISTORY','REPLAY_ROLLBACK_REHEARSAL','FINAL_FINANCIAL_RECONCILIATION']});
  if(v.Status==='Approved'&&rowType==='TOTAL'&&flag==='Y'){
   const groupKey=canonical([period,currency]),g=groups.get(groupKey)??{period,currency,rows:[],values:Object.fromEntries([...managementFields,...invoiceFields].map(f=>[f,[]]))};
   g.rows.push(addr(r));for(const f of Object.keys(g.values))g.values[f].push(nums[f]);groups.set(groupKey,g);
  }
 }
 const uniqueIssues=[...new Map(issues.map(i=>[digest(i),i])).values()];
 const totals=[...groups.values()].sort((a,b)=>canonical([a.period,a.currency]).localeCompare(canonical([b.period,b.currency]))).map(g=>({period:g.period,managementCurrency:g.currency,invoiceCurrency:'USD',sourceRows:g.rows,rows:g.rows.length,
  management:Object.fromEntries(managementFields.map(f=>[f,g.values[f].some(n=>n===null)?null:g.values[f].reduce((a,b)=>a.plus(b),D(0)).toFixed()])),
  invoiceUsd:Object.fromEntries(invoiceFields.map(f=>[f,g.values[f].some(n=>n===null)?null:g.values[f].reduce((a,b)=>a.plus(b),D(0)).toFixed()])),acceptance:false}));
 const report={format:'dgc-revenue-review-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,postingAllowed:false,acceptance:false,recomputeAmounts:false,historicalCashPosting:false,
  scope:'CAPTURED_REVENUE_BASES_AND_MONTHLY_INVENTORY_NO_RUNTIME_IMPORT',revenueRows:revenues.length,entries,checks,issues:uniqueIssues,monthlyTotals:totals,
  monthlyScope:'PHYSICAL_APPROVED_TOTAL_Y_ROWS_NOT_ACCEPTED_CURRENT_LEDGER',counts:checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{}),issueCounts:uniqueIssues.reduce((a,i)=>(a[i.code]=(a[i.code]??0)+1,a),{}),reviewStates:entries.reduce((a,e)=>(a[e.reviewState]=(a[e.reviewState]??0)+1,a),{})};
 return {...report,planHash:digest(report)};
}
export function verifyRevenueReview(report,snapshot,decisions){const {planHash,...body}=report??{};if(report?.format!=='dgc-revenue-review-v1'||planHash!==digest(body))throw Error('Revenue review checksum mismatch');if(canonical(report)!==canonical(revenueReview(snapshot,decisions)))throw Error('Revenue review differs from verified snapshot and decisions');return report;}
