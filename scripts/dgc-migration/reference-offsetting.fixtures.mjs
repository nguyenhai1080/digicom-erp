import {invoiceOffsettingInputs} from './invoice-offsetting.fixtures.mjs';
import {invoiceOffsettingPlan} from './invoice-offsetting.mjs';
import {cell} from './fixtures.mjs';

// Each document spans V2 offsetting, V1 nonzero-header and strict Invoices.
export function referenceOffsettingInputs(mutate=()=>{}){
 const o=invoiceOffsettingInputs((captures,ch)=>{
  const sheet=name=>captures.find(e=>e.data.sheets[0].properties.title===name),rows=name=>sheet(name).data.sheets[0].data[0].rowData;
  const adjust=name=>{const e=sheet(name),s=e.data.sheets[0];s.properties.gridProperties.rowCount=rows(name).length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(rows(name).length));};
  for(const [suffix,month,file] of [['3','2026-02','C'],['4','2026-03','D']]){
   const replacements={REV_TOTAL:'REV_TOTAL'+suffix,REV_CHILD:'REV_CHILD'+suffix,REC_TOTAL:'REC_TOTAL'+suffix,REC_CHILD:'REC_CHILD'+suffix,UPLOAD:'UPLOAD'+suffix,DOC:'DOC'+suffix,DETAIL_TOTAL:'DETAIL_TOTAL'+suffix,DETAIL_CHILD:'DETAIL_CHILD'+suffix,INV:'INV'+suffix,LINE:'LINE'+suffix,AR:'AR'+suffix,'TEST-INVOICE':'TEST-INVOICE'+suffix,'2026-01':month,'SYNTH_PARTNER|2026-01|ALL':'SYNTH_PARTNER|'+month+'|ALL',['I'.repeat(25)]:(suffix==='3'?'J':'K').repeat(25),['A'.repeat(25)]:file.repeat(25)};
   for(const name of ['40_MONTHLY_REVENUE','41_RECONCILIATION','42_RECON_PDF_UPLOAD','43_RECON_PDF_HEADER','44_RECON_PDF_DETAIL','48_INVOICE_HEADER','49_INVOICE_DETAIL','50_AR_AP']){
    const data=rows(name),pair=['40_MONTHLY_REVENUE','41_RECONCILIATION','44_RECON_PDF_DETAIL'].includes(name);
    data.push(...data.slice(1,pair?3:2).map(r=>({values:r.values.map(c=>{const v=c.effectiveValue.stringValue??c.effectiveValue.numberValue??c.effectiveValue.boolValue;return cell(typeof v==='string'?(replacements[v]??v.replaceAll('A'.repeat(25),file.repeat(25))):v);})})));adjust(name);
   }
   const strict=suffix==='4',revenue=strict?100:33.33,wht=strict?10:3.67,payable=strict?90:29.67;
   const header=rows('48_INVOICE_HEADER').length-1;
   for(const [f,v] of Object.entries({Total_Revenue_USD:revenue,Total_WHT_USD:wht,Total_Payable_USD:payable,Outstanding_Amount_USD:payable}))ch('48_INVOICE_HEADER',f,v,header);
   for(const f of ['Original_Amount','Outstanding_Amount'])ch('50_AR_AP',f,payable,rows('50_AR_AP').length-1);
   ch('50_AR_AP','ARAP_Type','AR',rows('50_AR_AP').length-1);
   ch('49_INVOICE_DETAIL','Line_No',1,rows('49_INVOICE_DETAIL').length-1);
   if(strict){
    for(const name of ['40_MONTHLY_REVENUE','41_RECONCILIATION','44_RECON_PDF_DETAIL'])for(const n of [rows(name).length-2,rows(name).length-1]){
     const fields=name==='44_RECON_PDF_DETAIL'?{Remuneration_Provider_MZN:300,WHT_MZN:30,Partner_Revenue_MZN:270,Remuneration_Provider_USD:100,WHT_USD:10,Partner_Revenue_USD:90}:name==='40_MONTHLY_REVENUE'?{Gross_Revenue:90,Net_Revenue:90,Company_Share:90,Invoice_Revenue_USD:100,Invoice_WHT_USD:10,Invoice_Payable_USD:90}:{Gross_Revenue:90,Net_Revenue:90,Company_Share:90};
     for(const [f,v] of Object.entries(fields))ch(name,f,v,n);
    }
    for(const [f,v] of Object.entries({Revenue_USD:100,WHT_USD:10,Payable_USD:90}))ch('49_INVOICE_DETAIL',f,v,rows('49_INVOICE_DETAIL').length-1);
   }
  }
  function set(name,headers,data){const e=sheet(name),s=e.data.sheets[0];s.properties.gridProperties={rowCount:data.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+headers.length)}${data.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...data.map(r=>({values:r.map(cell)}))];}
  set('53_SOA_HEADER',['SOA_ID','Partner_ID','Status','Pdf_File_ID','Created_By','Created_At'],[['SOA','SYNTH_PARTNER','Draft','S'.repeat(25),'source-user@example.invalid',46245.657010740746]]);
  set('54_SOA_DETAIL',['SOA_Detail_ID','SOA_ID','Invoice_ID','Invoice_Number'],[['SD','SOA','INV','TEST-INVOICE'],['SD3','SOA','INV3','TEST-INVOICE3'],['SD4','SOA','INV4','TEST-INVOICE4']]);
  set('55_APPROVAL_PACKAGE',['Approval_ID','Partner_ID','Approval_Status','Related_Invoice_IDs','File_ID','Approved_By'],[['PKG','SYNTH_PARTNER','Approved','INV, INV3, INV4','P'.repeat(25),'source-approver@example.invalid']]);
  mutate(captures,ch);
 });
 o.offsettingPlan=invoiceOffsettingPlan(o);return o;
}
