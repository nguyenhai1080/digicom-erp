import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture} from './core.mjs';
export function revenueCaptures(){
 const capture=fixture();
 const set=(name,headers,data)=>{const e=capture.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];let col='',n=headers.length;while(n){col=String.fromCharCode(65+(n-1)%26)+col;n=Math.floor((n-1)/26);}s.properties.gridProperties={rowCount:data.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${col}${data.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...data.map(v=>({values:v.map(cell)}))];};
 set('20_DM_SERVICE',['Service_ID','Service_Code','Service_Name','Service_Category','Status'],[['SYNTH_SERVICE','SYNTH_CODE','Synthetic service','Other','Active'],['SYNTH_CHILD','SYNTH_CHILD','Synthetic child','Other','Active']]);
 set('31_CONTRACT_SERVICES',['Contract_Service_ID','Contract_ID','Service_ID','Revenue_Share_Rate','Fixed_Fee','Status'],[['SYNTH_CS','SYNTH_CONTRACT','SYNTH_SERVICE',0.15,0,'Active'],['SYNTH_CS_CHILD','SYNTH_CONTRACT','SYNTH_CHILD',0.15,0,'Active']]);
 set('40_MONTHLY_REVENUE',['Revenue_ID','Revenue_Month','Partner_ID','Contract_ID','Service_ID','Currency','Status','Revenue_Row_Type','Include_In_Monthly_Total','Parent_Service_ID','Gross_Revenue','Tax_Amount','Net_Revenue','Share_Rate','Partner_Share','Company_Share','Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD','Source_Recon_Doc_ID','Source_Recon_Detail_ID'],[
  ['REV_TOTAL','2026-01','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_SERVICE','USD','Approved','Total','Y','','90','0','90','1','0','90','100','10','90','DOC','DETAIL_TOTAL'],
  ['REV_CHILD','2026-01','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_CHILD','USD','Approved','Child','N','SYNTH_SERVICE','90','0','90','1','0','90','100','10','90','DOC','DETAIL_CHILD']]);
 set('41_RECONCILIATION',['Recon_ID','Revenue_ID','Recon_Month','Partner_ID','Contract_ID','Service_ID','Status','Gross_Revenue','Net_Revenue','Partner_Share','Company_Share'],[
  ['REC_TOTAL','REV_TOTAL','2026-01','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_SERVICE','Approved','90','90','0','90'],['REC_CHILD','REV_CHILD','2026-01','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_CHILD','Approved','90','90','0','90']]);
 set('42_RECON_PDF_UPLOAD',['Upload_ID','Partner_ID','File_ID'],[['UPLOAD','SYNTH_PARTNER','AAAAAAAAAAAAAAAAAAAAAAAAA']]);
 set('43_RECON_PDF_HEADER',['Recon_Doc_ID','Upload_ID','Partner_ID','Period_Month','Service_Header','Source_File_URL','Status'],[['DOC','UPLOAD','SYNTH_PARTNER','2026-01','SYNTH_SERVICE','https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAAA/view','Revenue_Recon_Imported']]);
 set('44_RECON_PDF_DETAIL',['Recon_Detail_ID','Recon_Doc_ID','Upload_ID','Service_Name','Mapping_Service_ID','Mapping_Contract_ID','Remuneration_Provider_USD','WHT_USD','Partner_Revenue_USD'],[
  ['DETAIL_TOTAL','DOC','UPLOAD','Synthetic service','SYNTH_SERVICE','SYNTH_CONTRACT','100','10','90'],['DETAIL_CHILD','DOC','UPLOAD','Synthetic child','SYNTH_CHILD','SYNTH_CONTRACT','100','10','90']]);
 return capture;
}
export function changeRevenueCapture(captures,sheet,row,field,value){const s=captures.find(e=>e.data.sheets[0].properties.title===sheet).data.sheets[0],column=s.data[0].rowData[0].values.findIndex(c=>c.effectiveValue.stringValue===field);if(column<0)throw Error('Unknown fixture column');s.data[0].rowData[row].values[column]=cell(value);return captures;}
export const revenueSnapshot=()=>normalizeCapture(revenueCaptures());
