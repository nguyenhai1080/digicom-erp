import {createRequire} from 'node:module';
import {canonical,digest,sourceDate} from './core.mjs';
import {referenceGraph} from './graph.mjs';
import {financeReview} from './finance-review.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const D=Prisma.Decimal.clone({precision:120}),kind='DGC_SOURCE_RECEIPT_V1';
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
export function receiptTargetPlan(snapshot,decisions){
 const graph=referenceGraph(snapshot,decisions),finance=financeReview(snapshot,decisions),table=snapshot.tables['52_INVOICE_PAYMENT'],headers=snapshot.tables['48_INVOICE_HEADER'];
 const parents=new Map(),entries=table.rows.map(row=>{
  const source=addr('52_INVOICE_PAYMENT',table,row),reasons=[],v=row.values;
  const link=graph.links.find(l=>l.source.sheet==='52_INVOICE_PAYMENT'&&l.source.sourceRow===row.sourceRow&&l.field==='Invoice_ID'),header=link?.target&&headers.rows.find(h=>h.sourceRow===link.target.sourceRow);
  if(!row.legacyId||table.rows.filter(r=>r.legacyId===row.legacyId).length!==1)reasons.push('RECEIPT_ID_MISSING_OR_DUPLICATE');
  if(!header)reasons.push('SOURCE_INVOICE_BINDING_HELD');
  let data=null,parent=null;
  try{
   if(!header)throw Error();const h=header.values,invoiceSource=addr('48_INVOICE_HEADER',headers,header);
   if(h.Currency!=='USD'||!['Paid','Issued','Overdue','Partially Paid'].includes(h.Status)||String(h.Is_Current).toUpperCase()!=='TRUE'||v.Invoice_Number!==h.Invoice_Number||v.Partner_ID!==h.Partner_ID)throw Error('RECEIPT_PARENT_CONTEXT_HELD');
   function money(raw,precision,scale){if(!['number','string'].includes(typeof raw)||!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw)))throw Error('RECEIPT_AMOUNT_INVALID');const n=new D(String(raw));if(!n.isFinite()||!n.gt(0)||n.decimalPlaces()>scale||n.gte(new D(10).pow(precision-scale)))throw Error('RECEIPT_AMOUNT_NOT_EXACTLY_REPRESENTABLE');return n.toFixed();}
   const usd=money(v.Paid_Amount_USD,20,2),vnd=money(v.Paid_Amount_VND,30,12),fx=money(v.Payment_FX_Rate,30,12);
   if(typeof v.Payment_Date!=='number'||!['DATE','DATE_TIME'].includes(row.cells.Payment_Date?.effectiveFormat?.numberFormat?.type))throw Error('SOURCE_PAYMENT_DATE_BASIS_HELD');
   const paymentDate=sourceDate(row,'Payment_Date');if(!paymentDate)throw Error('SOURCE_PAYMENT_DATE_MISSING');
   const text=f=>{if(v[f]!=null&&typeof v[f]!=='string')throw Error('SOURCE_RECEIPT_TEXT_HELD');return v[f]??'';};
   data={paymentCode:row.legacyId,paymentDate,allocationCurrency:'USD',allocationAmount:usd,paidUsd:usd,paidVnd:vnd,cashCurrency:'VND',cashAmount:vnd,fxRate:fx,swiftNo:text('Swift_No'),bankAccount:text('Bank_Account'),paymentMethod:text('Payment_Method'),note:text('Note'),cashAccountId:null,approvedById:null,documentId:null,historicalSource:{sourceKind:kind,snapshotHash:snapshot.snapshotHash,source,invoiceSource,reference:'DGC 52_INVOICE_PAYMENT row '+row.sourceRow+' / '+row.legacyId,dateBasis:'SOURCE',rateKind:'SOURCE_INFORMATIONAL',capturedRowJson:canonical(row),sourceActorJson:canonical({createdBy:v.Created_By,createdAt:v.Created_At,timezone:snapshot.source.timezone}),historicalCashPosting:false,localApprovalCreated:false}};
   parent={source:invoiceSource,capturedHeaderJson:canonical(header),partnerKey:h.Partner_ID,invoiceNumber:h.Invoice_Number,currency:h.Currency,invoiceDate:sourceDate(header,'Invoice_Date'),dueDate:sourceDate(header,'Payment_Due_Date'),sourceStatus:h.Status};
   if(!parent.invoiceDate||!parent.dueDate)throw Error('PARENT_DATE_MISSING');
   parents.set(header.sourceRow,parent);
  }catch(e){reasons.push(e.message||'RECEIPT_SHAPE_HELD');}
  const balanceChecks=header?finance.checks.filter(c=>c.source.sheet==='48_INVOICE_HEADER'&&c.source.sourceRow===header.sourceRow&&['PAYMENT_SUM','OUTSTANDING_IDENTITY'].includes(c.code)):[];
  const ledgerBalanceBound=balanceChecks.length===2&&balanceChecks.every(c=>c.state==='MATCH');
  return {source,invoiceSource:header?addr('48_INVOICE_HEADER',headers,header):null,state:reasons.length?'RECEIPT_SHAPE_HELD':'EXACT_SOURCE_RECEIPT_SHAPE',reasons,data,parent,ledgerBalanceBound,readyToImport:false,financialPosting:false};
 });
 const report={format:'dgc-receipt-target-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,entries,parents:[...parents.values()],counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),operationalAcceptance:false,financialPosting:false,recomputeAmounts:false,historicalCashPosting:false,localApprovalCreated:false};
 return {...report,planHash:digest(report)};
}
export function verifyReceiptTargetPlan(plan,snapshot,decisions){const {planHash,...body}=plan??{};if(planHash!==digest(body)||canonical(plan)!==canonical(receiptTargetPlan(snapshot,decisions)))throw Error('Receipt target plan differs from pinned source');return plan;}
