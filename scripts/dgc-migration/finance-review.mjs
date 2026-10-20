import {createRequire} from 'node:module';
import {digest} from './core.mjs';
import {referenceGraph} from './graph.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v));
const text=v=>v==null?'':String(v).trim();
const key=a=>`${a.sheet}|${a.sourceRow}`;
const inactive=r=>text(r.values.Is_Current).toUpperCase()==='FALSE'||['CANCELLED','CANCELED','SUPERSEDED','DELETED','REJECTED'].includes(text(r.values.Status).toUpperCase());

// Diagnostics of captured amounts, never a posting/import plan. No FX, cutoff
// inference, balance repair, missing-value zero fill or historical cash posting.
export function financeReview(snapshot,decisions){
 const graph=referenceGraph(snapshot,decisions),checks=[],rows=new Map(),issues=[];
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const row of t.rows)rows.set(key({sheet,...row}),{sheet,sheetId:t.sheetId,...row});
 const addr=r=>({sheet:r.sheet,sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash,status:r.values.Status??null,isCurrent:r.values.Is_Current??null,invoiceId:r.values.Invoice_ID??null});
 const linkMap=new Map(graph.links.map(l=>[`${key(l.source)}|${l.field}`,l]));
 const linked=(r,field)=>{const l=linkMap.get(`${key(r)}|${field}`);return l?.target?rows.get(key(l.target)):null;};
 const table=sheet=>[...rows.values()].filter(r=>r.sheet===sheet);
 function amount(r,field){
  const v=r.values[field];if(v==null||text(v)===''){issues.push({source:addr(r),field,code:'MISSING_AMOUNT'});return null;}
  try{if(!['number','string'].includes(typeof v)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v))||String(v).replace(/\D/g,'').length>80)throw Error();const n=D(v);if(!n.isFinite())throw Error();if(n.isNegative())issues.push({source:addr(r),field,code:'NEGATIVE_AMOUNT'});return n;}catch{issues.push({source:addr(r),field,code:'INVALID_AMOUNT'});return null;}
 }
 function check(r,code,actual,expected,evidence=[],notes={}){
  const state=actual===null||expected===null?'UNAVAILABLE':actual.eq(expected)?'MATCH':'MISMATCH';
  checks.push({source:addr(r),code,state,actual:actual?.toFixed()??null,expected:expected?.toFixed()??null,difference:actual!==null&&expected!==null?actual.minus(expected).toFixed():null,evidence:evidence.map(addr),...notes});
 }
 const sum=(items,field)=>{const amounts=items.map(r=>amount(r,field));return amounts.some(v=>v===null)?null:amounts.reduce((a,b)=>a.plus(b),D(0));};
 const details=table('49_INVOICE_DETAIL'),payments=table('52_INVOICE_PAYMENT'),ars=table('50_AR_AP');
 for(const p of payments)if(!linked(p,'Invoice_ID'))issues.push({source:addr(p),code:'UNRESOLVED_PAYMENT_INVOICE'});
 for(const ar of ars)if(text(ar.values.ARAP_Type).toUpperCase()==='AR'&&!inactive(ar)&&!linked(ar,'Invoice_ID'))issues.push({source:addr(ar),code:'UNRESOLVED_CURRENT_AR_INVOICE'});
 for(const inv of table('48_INVOICE_HEADER')){
  const ownDetails=details.filter(r=>linked(r,'Invoice_ID')===inv),ownPayments=payments.filter(r=>linked(r,'Invoice_ID')===inv);
  const currency=text(inv.values.Currency);
  if(currency!=='USD'){
   issues.push({source:addr(inv),field:'Currency',code:'UNSUPPORTED_INVOICE_CURRENCY',value:currency});continue;
  }
  const revenue=amount(inv,'Total_Revenue_USD'),wht=amount(inv,'Total_WHT_USD'),total=amount(inv,'Total_Payable_USD');
  check(inv,'HEADER_REVENUE_MINUS_WHT',total,revenue!==null&&wht!==null?revenue.minus(wht):null);
  if(!ownDetails.length)issues.push({source:addr(inv),code:'NO_INVOICE_DETAILS'});
  for(const [header,line] of [['Total_Revenue_USD','Revenue_USD'],['Total_WHT_USD','WHT_USD'],['Total_Payable_USD','Payable_USD']]){
   const actual=header==='Total_Revenue_USD'?revenue:header==='Total_WHT_USD'?wht:total;
   const expected=ownDetails.length?sum(ownDetails,line):null;
   check(inv,`DETAIL_SUM_${line}`,actual,expected,ownDetails,{donorIssueTolerance:'0.02',withinDonorIssueTolerance:actual!==null&&expected!==null?actual.minus(expected).abs().lte('0.02'):null});
  }
  const paid=sum(ownPayments,'Paid_Amount_USD'),storedPaid=amount(inv,'Paid_Amount_USD'),outstanding=amount(inv,'Outstanding_Amount_USD');
  check(inv,'PAYMENT_SUM',storedPaid,paid,ownPayments,{scope:'ALL_CAPTURED_PAYMENTS_NO_AS_OF_CUTOFF'});
  // Exact ledger identity intentionally exposes donor's max(0, outstanding)
  // clamp instead of accepting an overpayment or silently writing it off.
  check(inv,'OUTSTANDING_IDENTITY',outstanding,total!==null&&paid!==null?total.minus(paid):null,ownPayments);
  const activeAr=ars.filter(r=>text(r.values.ARAP_Type).toUpperCase()==='AR'&&!inactive(r)&&linked(r,'Invoice_ID')===inv);
  const requiresAr=!inactive(inv)&&['ISSUED','PAID','PARTIALLY PAID','OVERDUE'].includes(text(inv.values.Status).toUpperCase());
  if(requiresAr||activeAr.length){
   checks.push({source:addr(inv),code:'CURRENT_AR_CARDINALITY',state:requiresAr&&activeAr.length===1?'MATCH':'MISMATCH',actual:String(activeAr.length),expected:requiresAr?'1':'0',evidence:activeAr.map(addr)});
   for(const ar of activeAr){
    if(text(ar.values.Currency)!==currency){issues.push({source:addr(ar),code:'AR_CURRENCY_CONFLICT',invoice:addr(inv)});continue;}
    check(ar,'AR_ORIGINAL_VS_INVOICE',amount(ar,'Original_Amount'),total,[inv]);
    check(ar,'AR_PAID_VS_PAYMENTS',amount(ar,'Paid_Amount'),paid,ownPayments);
    check(ar,'AR_OUTSTANDING_VS_INVOICE',amount(ar,'Outstanding_Amount'),outstanding,[inv]);
   }
  }
  if(ownPayments.length&&(inactive(inv)||text(inv.values.Status).toUpperCase()==='DRAFT'))issues.push({source:addr(inv),code:'PAYMENTS_ON_INACTIVE_OR_DRAFT_INVOICE',payments:ownPayments.map(addr)});
 }
 for(const line of details){
  const revenue=amount(line,'Revenue_USD'),wht=amount(line,'WHT_USD'),payable=amount(line,'Payable_USD');
  check(line,'LINE_REVENUE_MINUS_WHT',payable,revenue!==null&&wht!==null?revenue.minus(wht):null);
  const source=linked(line,'Revenue_ID');
  if(!source){issues.push({source:addr(line),code:'UNRESOLVED_REVENUE_SOURCE'});continue;}
  for(const [lineField,sourceField] of [['Revenue_USD','Invoice_Revenue_USD'],['WHT_USD','Invoice_WHT_USD'],['Payable_USD','Invoice_Payable_USD']])check(line,`REVENUE_SOURCE_${lineField}`,amount(line,lineField),amount(source,sourceField),[source]);
 }
 const counts=checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{});
 const uniqueIssues=[...new Map(issues.map(i=>[digest(i),i])).values()],issueCounts=uniqueIssues.reduce((a,c)=>(a[c.code]=(a[c.code]??0)+1,a),{});
 const report={format:'dgc-finance-review-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,postingAllowed:false,acceptance:false,historicalCashPosting:false,scope:'CAPTURED_USD_INVOICE_DETAIL_PAYMENT_AR_NO_AS_OF_CUTOFF',checks,issues:uniqueIssues,counts,issueCounts,unresolvedReferences:graph.unresolved};
 return {...report,planHash:digest(report)};
}
