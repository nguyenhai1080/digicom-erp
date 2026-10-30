import {createRequire} from 'node:module';
import {canonical,digest,verifySnapshot} from './core.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120});
const decisionPin='ac4d3276cf8afe545aa88136d38aaf83576ff87b788b71508e23e4385e7e3455';
const same=(a,b)=>canonical(a)===canonical(b);
const address=(t,r)=>({sheet:t.name,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
function money(v){if(!['number','string'].includes(typeof v)||!/^\d+(?:\.\d+)?$/.test(String(v)))throw Error('Invalid captured ledger amount');const n=new Decimal(String(v));if(!n.isFinite()||n.decimalPlaces()>4||n.gte('10000000000000000'))throw Error('Invalid captured ledger precision');return n;}
const fields={revenue:['Total_Revenue_USD','Revenue_USD','Invoice_Revenue_USD'],wht:['Total_WHT_USD','WHT_USD','Invoice_WHT_USD'],payable:['Total_Payable_USD','Payable_USD','Invoice_Payable_USD']};

// A narrow source adapter, not financial admission. It keeps header, presented
// lines and authoritative revenue amounts independently; it never manufactures
// an adjustment line, another receivable or a local approval.
export function invoiceLedgerAuthority(snapshot,decision){
 const {decisionHash,...body}=decision??{};
 if(decisionHash!==decisionPin||digest(body)!==decisionPin||decision.approvedBy!=='OWNER'||decision.financialCommitAllowed!==false)throw Error('Unrecognized Invoice ledger authority');
 verifySnapshot(snapshot);
 if(snapshot.snapshotHash!==decision.snapshotHash||decision.source.sourceRow!==14||decision.source.legacyId!=='INV0020')throw Error('Invoice authority source snapshot differs');
 const table=name=>({...snapshot.tables[name],name}),headers=table('48_INVOICE_HEADER'),header=headers.rows.find(r=>r.sourceRow===decision.source.sourceRow);
 if(!same(header,decision.source))throw Error('Invoice authority header differs');
 const invoiceId=header.legacyId,sets={};
 if(!same(Object.keys(decision.sourceRows).sort(),['48_INVOICE_HEADER','49_INVOICE_DETAIL','50_AR_AP','52_INVOICE_PAYMENT']))throw Error('Invoice authority source table set differs');
 for(const [name,expected] of Object.entries(decision.sourceRows)){const rows=table(name).rows.filter(r=>name==='48_INVOICE_HEADER'?r.legacyId===invoiceId:r.values.Invoice_ID===invoiceId);if(!same(rows,expected))throw Error('Invoice authority complete source set differs');sets[name]=rows;}
 const details=sets['49_INVOICE_DETAIL'],ars=sets['50_AR_AP'].filter(r=>r.values.ARAP_Type==='AR'&&String(r.values.Is_Current).toUpperCase()==='TRUE'&&!['Cancelled','Superseded'].includes(r.values.Status));
 if(!details.length||ars.length!==1||header.values.Status!=='Paid'||header.values.Currency!=='USD')throw Error('Invoice authority lifecycle differs');
 const ar=ars[0],paid=money(header.values.Paid_Amount_USD),outstanding=money(ar.values.Outstanding_Amount),receiptTotal=sets['52_INVOICE_PAYMENT'].reduce((n,r)=>n.plus(money(r.values.Paid_Amount_USD)),money(0));
 const ledger={...Object.fromEntries(Object.entries(fields).map(([k,[field]])=>[k,money(header.values[field]).toFixed()])),paid:paid.toFixed(),outstanding:outstanding.toFixed(),status:header.values.Status};
 if(!same(ledger,decision.capturedLedger)||!paid.eq(ledger.payable)||!receiptTotal.eq(paid)||!outstanding.isZero()||!money(ar.values.Original_Amount).eq(ledger.payable)||!money(ar.values.Paid_Amount).eq(paid))throw Error('Invoice authority ledger/AR/receipt balance differs');
 const revenues=table('40_MONTHLY_REVENUE'),seen=new Set(),lines=details.map(d=>{const candidates=revenues.rows.filter(r=>r.legacyId===d.values.Revenue_ID);if(candidates.length!==1)throw Error('Invoice authority physical revenue is ambiguous');const r=candidates[0];if(seen.has(r.sourceRow)||r.values.Partner_ID!==header.values.Partner_ID||r.values.Status!=='Approved'||r.values.Revenue_Row_Type!=='Total'||r.values.Include_In_Monthly_Total!=='Y')throw Error('Invoice authority revenue scope differs');seen.add(r.sourceRow);const components=Object.fromEntries(Object.entries(fields).map(([k,[,detailField,revenueField]])=>{const value=money(d.values[detailField]);if(!value.eq(money(r.values[revenueField])))throw Error('Invoice authority captured line/revenue differs');return [k,value.toFixed()];}));return {source:address(table('49_INVOICE_DETAIL'),d),revenueSource:address(revenues,r),components};});
 const presented=Object.fromEntries(Object.keys(fields).map(k=>[k,lines.reduce((n,l)=>n.plus(l.components[k]),money(0)).toFixed()]));
 if(Object.keys(fields).some(k=>!money(presented[k]).eq(money(decision.printed[k]))))throw Error('Invoice authority presented components differ from pinned observation');
 const componentDifferences=Object.keys(fields).map(k=>({component:k,ledger:ledger[k],presented:presented[k],presentedMinusLedger:money(presented[k]).minus(ledger[k]).toFixed()}));
 if(componentDifferences.some(d=>d.presentedMinusLedger!=='0.01'))throw Error('Invoice authority exact captured variance differs');
 const report={format:'dgc-invoice-ledger-authority-source-v1',snapshotHash:snapshot.snapshotHash,decisionHash,source:address(headers,header),ledger,presented,printed:decision.printed,originalPdf:decision.originalPdf,lines,componentDifferences,receiptTotal:receiptTotal.toFixed(),warning:'CAPTURED_LEDGER_AND_ORIGINAL_PDF_DIFFER',headerAndScopesEqual:false,amountPolicy:'PRESERVE_LEDGER_LINES_REVENUE_AND_PDF_SEPARATELY',adjustmentCreated:false,additionalReceivableCreated:false,sourceValuesChanged:false,otherHoldsUnchanged:true,originalPdfBytesVerified:false,operationalUseAllowed:false,readyToImport:false,commitAllowed:false,acceptance:false,historicalCashPosting:false};
 return {...report,reviewHash:digest(report)};
}
