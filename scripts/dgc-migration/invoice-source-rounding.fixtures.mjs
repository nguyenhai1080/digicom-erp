import {invoiceRoundingInputs} from './invoice-rounding.fixtures.mjs';
import {cell} from './fixtures.mjs';
export function invoiceSourceRoundingInputs(mutate=()=>{},paid=false){
 return invoiceRoundingInputs((c,ch)=>{
  const sheet=name=>c.find(e=>e.data.sheets[0].properties.title===name),rows=name=>sheet(name).data.sheets[0].data[0].rowData;
  for(const suffix of ['2','3'])for(const name of ['20_DM_SERVICE','31_CONTRACT_SERVICES','40_MONTHLY_REVENUE','41_RECONCILIATION','44_RECON_PDF_DETAIL']){
   const data=rows(name),replacements={SYNTH_CHILD:'SYNTH_CHILD'+suffix,SYNTH_CS_CHILD:'SYNTH_CS_CHILD'+suffix,REV_CHILD:'REV_CHILD'+suffix,REC_CHILD:'REC_CHILD'+suffix,DETAIL_CHILD:'DETAIL_CHILD'+suffix,'Synthetic child':'Synthetic child '+suffix};
   data.push({values:data[2].values.map(x=>{const v=x.effectiveValue.stringValue??x.effectiveValue.numberValue??x.effectiveValue.boolValue;return cell(typeof v==='string'?(replacements[v]??v):v);})});
   const e=sheet(name);e.data.sheets[0].properties.gridProperties.rowCount=data.length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(data.length));
  }
  for(const [n,revenue,wht,payable,nativeRevenue,nativeWht,nativePayable] of [[1,100,10,90,300,30,270],[3,33.67,3.33,30.33,101,10,91],[4,33,3,30,99,9,90]]){
   for(const [f,v] of Object.entries({Gross_Revenue:payable,Net_Revenue:payable,Company_Share:payable,Invoice_Revenue_USD:revenue,Invoice_WHT_USD:wht,Invoice_Payable_USD:payable}))ch('40_MONTHLY_REVENUE',f,v,n);
   for(const f of ['Gross_Revenue','Net_Revenue','Company_Share'])ch('41_RECONCILIATION',f,payable,n);
   for(const [f,v] of Object.entries({Remuneration_Provider_MZN:nativeRevenue,WHT_MZN:nativeWht,Partner_Revenue_MZN:nativePayable,Remuneration_Provider_USD:revenue,WHT_USD:wht,Partner_Revenue_USD:payable}))ch('44_RECON_PDF_DETAIL',f,v,n);
  }
  for(const [f,v] of Object.entries({Total_Revenue_USD:100,Total_WHT_USD:10,Total_Payable_USD:90,Paid_Amount_USD:paid?90:0,Outstanding_Amount_USD:paid?0:90}))ch('48_INVOICE_HEADER',f,v);
  for(const [f,v] of Object.entries({Revenue_ID:'REV_TOTAL',Service_ID:'SYNTH_SERVICE',Source_Recon_Detail_ID:'DETAIL_TOTAL',Revenue_USD:100,WHT_USD:10,Payable_USD:90}))ch('49_INVOICE_DETAIL',f,v);
  for(const [f,v] of Object.entries({Original_Amount:90,Paid_Amount:paid?90:0,Outstanding_Amount:paid?0:90}))ch('50_AR_AP',f,v);
  if(paid){ch('52_INVOICE_PAYMENT','Paid_Amount_USD',90);ch('52_INVOICE_PAYMENT','Paid_Amount_VND',2250000);}
  mutate(c,ch);
 },paid);
}
