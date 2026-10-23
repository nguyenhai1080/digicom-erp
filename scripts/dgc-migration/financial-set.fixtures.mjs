import assert from 'node:assert/strict';
import {referenceOffsettingInputs} from './reference-offsetting.fixtures.mjs';
import {invoiceSourceRoundingInputs} from './invoice-source-rounding.fixtures.mjs';
import {invoiceBalanceInputs} from './invoice-balance.fixtures.mjs';
import {cell} from './fixtures.mjs';
export function financialSetInputs(mutate=()=>{}){
 const extras=[];for(const [prefix,month,file,build] of [['V3_','2026-04','E',invoiceSourceRoundingInputs],['V4_','2026-05','F',invoiceBalanceInputs]])build((c)=>extras.push({prefix,month,file,c:structuredClone(c)}),true);
 return referenceOffsettingInputs((c,ch)=>{
  const table=(c,n)=>c.find(e=>e.data.sheets[0].properties.title===n),rows=(c,n)=>table(c,n).data.sheets[0].data[0].rowData;
  const names=['20_DM_SERVICE','31_CONTRACT_SERVICES','40_MONTHLY_REVENUE','41_RECONCILIATION','42_RECON_PDF_UPLOAD','43_RECON_PDF_HEADER','44_RECON_PDF_DETAIL','48_INVOICE_HEADER','49_INVOICE_DETAIL','50_AR_AP'];
  const ids=[];
  for(const x of extras){
   const replace=new Map();for(const n of names)for(const r of rows(x.c,n).slice(1)){const v=r.values[0].effectiveValue.stringValue;if(v)replace.set(v,x.prefix+v);}
   replace.set('TEST-INVOICE',x.prefix+'TEST-INVOICE');replace.set('2026-01',x.month);replace.set('I'.repeat(25),(x.prefix==='V3_'?'L':'M').repeat(25));
   for(const n of names){
    const target=rows(c,n),source=rows(x.c,n),th=target[0].values.map(c=>c.effectiveValue.stringValue),sh=source[0].values.map(c=>c.effectiveValue.stringValue);assert.deepEqual(th,sh);
    for(const r of source.slice(1))target.push({values:r.values.map((original,j)=>{const v=original.effectiveValue.stringValue??original.effectiveValue.numberValue??original.effectiveValue.boolValue;let mapped=v;if(typeof v==='string')mapped=replace.get(v)??v.replaceAll('A'.repeat(25),x.file.repeat(25)).replaceAll('SYNTH_PARTNER|2026-01|ALL','SYNTH_PARTNER|'+x.month+'|ALL');if(th[j]==='ARAP_Type')mapped=v;if(th[j]==='Service_Code'&&typeof v==='string'&&v)mapped=x.prefix+v;return cell(mapped);})});
    const e=table(c,n);e.data.sheets[0].properties.gridProperties.rowCount=target.length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(target.length));
   }
   ids.push(x.prefix+'INV');
  }
  const soa=rows(c,'54_SOA_DETAIL');for(const id of ids)soa.push({values:['SD_'+id,'SOA',id,id.replace('INV','TEST-INVOICE')].map(cell)});
  const s=table(c,'54_SOA_DETAIL');s.data.sheets[0].properties.gridProperties.rowCount=soa.length;s.requestedRange=s.requestedRange.replace(/\d+$/,String(soa.length));
  ch('55_APPROVAL_PACKAGE','Related_Invoice_IDs','INV, INV3, INV4, '+ids.join(', '));
  const headers=['Payment_ID','Invoice_ID','Invoice_Number','Partner_ID','Payment_Date','Paid_Amount_USD','Paid_Amount_VND','Payment_FX_Rate','Swift_No','Bank_Account','Payment_Method','Note','Created_By','Created_At'];
  const values=[['V3_PAY',ids[0],'V3_TEST-INVOICE','SYNTH_PARTNER',46063,90,'2250000.12345678','25000.123456789123','','','Bank Transfer','','source@example.invalid',46063.5],['V4_PAY',ids[1],'V4_TEST-INVOICE','SYNTH_PARTNER',46063,54,1350000,25000,'','','Bank Transfer','','source@example.invalid',46063.5]];
  const e=table(c,'52_INVOICE_PAYMENT'),t=e.data.sheets[0];t.properties.gridProperties={rowCount:3,columnCount:headers.length};e.requestedRange="'52_INVOICE_PAYMENT'!A1:N3";t.data[0].rowData=[{values:headers.map(cell)},...values.map(row=>({values:row.map((v,i)=>{const x=cell(v);if([4,13].includes(i))x.effectiveFormat={numberFormat:{type:i===4?'DATE':'DATE_TIME',pattern:'yyyy-mm-dd'}};return x;})}))];
  mutate(c,ch);
 });
}
