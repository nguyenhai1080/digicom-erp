import {referenceRoundingInputs} from './reference-rounding.fixtures.mjs';
import {cell} from './fixtures.mjs';
export function invoiceOffsettingInputs(mutate=()=>{},paid=false){
 return referenceRoundingInputs((c,ch)=>{
  const sheet=name=>c.find(e=>e.data.sheets[0].properties.title===name),rows=name=>sheet(name).data.sheets[0].data[0].rowData;
  const adjust=name=>{const e=sheet(name),s=e.data.sheets[0];s.properties.gridProperties.rowCount=s.data[0].rowData.length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(s.properties.gridProperties.rowCount));};
  for(const name of ['30_CONTRACTS','31_CONTRACT_SERVICES']){const data=rows(name);data.push(...data.slice(1).filter(r=>r.values).map(r=>({values:r.values.map(x=>{const v=x.effectiveValue.stringValue??x.effectiveValue.numberValue??x.effectiveValue.boolValue;return cell(typeof v==='string'?({SYNTH_CONTRACT:'SYNTH_CONTRACT2','SYNTHETIC-001':'SYNTHETIC-002',SYNTH_CS:'SYNTH_CS2',SYNTH_CS_CHILD:'SYNTH_CS_CHILD2'}[v]??v):v);})})));adjust(name);}
  rows('20_DM_SERVICE').push(...rows('20_DM_SERVICE').slice(1).map(r=>({values:r.values.map(x=>{const v=x.effectiveValue.stringValue??x.effectiveValue.numberValue??x.effectiveValue.boolValue;return cell(typeof v==='string'?({SYNTH_SERVICE:'SYNTH_SERVICE2',SYNTH_CODE:'SYNTH_CODE2',SYNTH_CHILD:'SYNTH_CHILD2','Synthetic service':'Synthetic service 2','Synthetic child':'Synthetic child 2'}[v]??v):v);})})));adjust('20_DM_SERVICE');
  ch('31_CONTRACT_SERVICES','Service_ID','SYNTH_SERVICE2',3);ch('31_CONTRACT_SERVICES','Service_ID','SYNTH_CHILD2',4);
  for(const n of [3,4]){
   for(const [f,v] of Object.entries({Revenue_Month:'2026-01',Contract_ID:'SYNTH_CONTRACT2',Gross_Revenue:30.33,Net_Revenue:30.33,Company_Share:30.33,Invoice_Revenue_USD:33.67,Invoice_WHT_USD:3.33,Invoice_Payable_USD:30.33}))ch('40_MONTHLY_REVENUE',f,v,n);
   for(const [f,v] of Object.entries({Recon_Month:'2026-01',Contract_ID:'SYNTH_CONTRACT2',Gross_Revenue:30.33,Net_Revenue:30.33,Company_Share:30.33}))ch('41_RECONCILIATION',f,v,n);
   for(const [f,v] of Object.entries({Mapping_Contract_ID:'SYNTH_CONTRACT2',Remuneration_Provider_MZN:101,WHT_MZN:10,Partner_Revenue_MZN:91,Remuneration_Provider_USD:33.67,WHT_USD:3.33,Partner_Revenue_USD:30.33}))ch('44_RECON_PDF_DETAIL',f,v,n);
  }
  for(const [n,service,name] of [[3,'SYNTH_SERVICE2','Synthetic service 2'],[4,'SYNTH_CHILD2','Synthetic child 2']]){ch('40_MONTHLY_REVENUE','Service_ID',service,n);ch('41_RECONCILIATION','Service_ID',service,n);ch('44_RECON_PDF_DETAIL','Mapping_Service_ID',service,n);ch('44_RECON_PDF_DETAIL','Service_Name',name,n);}
  ch('40_MONTHLY_REVENUE','Parent_Service_ID','SYNTH_SERVICE2',4);ch('43_RECON_PDF_HEADER','Service_Header','SYNTH_SERVICE2',2);ch('49_INVOICE_DETAIL','Service_ID','SYNTH_CHILD2',2);
  ch('43_RECON_PDF_HEADER','Period_Month','2026-01',2);
  for(const [f,v] of Object.entries({Total_Revenue_USD:67,Total_WHT_USD:7,Total_Payable_USD:60,Outstanding_Amount_USD:60}))ch('48_INVOICE_HEADER',f,v);
  rows('48_INVOICE_HEADER').splice(2);adjust('48_INVOICE_HEADER');
  for(const [f,v] of Object.entries({Invoice_ID:'INV',Revenue_USD:33.67,WHT_USD:3.33,Payable_USD:30.33,Line_No:2}))ch('49_INVOICE_DETAIL',f,v,2);
  for(const f of ['Original_Amount','Outstanding_Amount'])ch('50_AR_AP',f,60);rows('50_AR_AP').splice(2);adjust('50_AR_AP');
  for(const name of ['53_SOA_HEADER','54_SOA_DETAIL','55_APPROVAL_PACKAGE']){rows(name).splice(1);adjust(name);}
  if(paid){for(const [f,v] of Object.entries({Status:'Paid',Paid_Amount_USD:60,Outstanding_Amount_USD:0}))ch('48_INVOICE_HEADER',f,v);for(const [f,v] of Object.entries({Status:'Paid',Paid_Amount:60,Outstanding_Amount:0}))ch('50_AR_AP',f,v);rows('52_INVOICE_PAYMENT').push({values:['PAY','INV','SYNTH_PARTNER',60,1500000,25000,'2026-02-10'].map(cell)});adjust('52_INVOICE_PAYMENT');}
  mutate(c,ch);
 },false);
}
