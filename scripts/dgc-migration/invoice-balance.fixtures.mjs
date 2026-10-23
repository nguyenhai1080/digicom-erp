import {invoiceSourceRoundingInputs} from './invoice-source-rounding.fixtures.mjs';
import {cell} from './fixtures.mjs';
export function invoiceBalanceInputs(mutate=()=>{},paid=false){return invoiceSourceRoundingInputs((c,ch)=>{
 const rows=n=>c.find(e=>e.data.sheets[0].properties.title===n).data.sheets[0].data[0].rowData;
 for(const [n,r,w,p,nr,nw,np] of [[1,60,6,54,180,18,162],[2,10.01,1,9,30.02,3.01,27.01],[3,20,2,18,60,6,54],[4,30,3,27,90,9,81]]){
  for(const [f,v] of Object.entries({Gross_Revenue:p,Net_Revenue:p,Company_Share:p,Invoice_Revenue_USD:r,Invoice_WHT_USD:w,Invoice_Payable_USD:p}))ch('40_MONTHLY_REVENUE',f,v,n);
  for(const f of ['Gross_Revenue','Net_Revenue','Company_Share'])ch('41_RECONCILIATION',f,p,n);
  for(const [f,v] of Object.entries({Remuneration_Provider_MZN:nr,WHT_MZN:nw,Partner_Revenue_MZN:np,Remuneration_Provider_USD:r,WHT_USD:w,Partner_Revenue_USD:p}))ch('44_RECON_PDF_DETAIL',f,v,n);
 }
 for(const [f,v] of Object.entries({Total_Revenue_USD:60,Total_WHT_USD:6,Total_Payable_USD:54,Outstanding_Amount_USD:54}))ch('48_INVOICE_HEADER',f,v);
 for(const f of ['Original_Amount','Outstanding_Amount'])ch('50_AR_AP',f,54);
 const data=rows('49_INVOICE_DETAIL'),headers=data[0].values.map(c=>c.effectiveValue.stringValue),base=structuredClone(data[1]);
 data.push(structuredClone(base),structuredClone(base));
 const e=c.find(e=>e.data.sheets[0].properties.title==='49_INVOICE_DETAIL');e.data.sheets[0].properties.gridProperties.rowCount=data.length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(data.length));
 for(const [n,suffix,r,w,p] of [[1,'',10.01,1,9],[2,'2',20,2,18],[3,'3',29.99,3,27]])for(const [f,v] of Object.entries({Invoice_Detail_ID:'LINE_BALANCE_'+n,Line_No:n,Revenue_ID:'REV_CHILD'+suffix,Service_ID:'SYNTH_CHILD'+suffix,Source_Recon_Detail_ID:'DETAIL_CHILD'+suffix,Revenue_USD:r,WHT_USD:w,Payable_USD:p}))data[n].values[headers.indexOf(f)]=cell(v);
 if(paid){for(const [f,v] of Object.entries({Paid_Amount_USD:54,Outstanding_Amount_USD:0}))ch('48_INVOICE_HEADER',f,v);for(const [f,v] of Object.entries({Paid_Amount:54,Outstanding_Amount:0}))ch('50_AR_AP',f,v);ch('52_INVOICE_PAYMENT','Paid_Amount_USD',54);ch('52_INVOICE_PAYMENT','Paid_Amount_VND',1350000);}
 mutate(c,ch);
},paid);}
