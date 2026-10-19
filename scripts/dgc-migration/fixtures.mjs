import {TABLES,SOURCE_ID} from './core.mjs';
const col=n=>n<=26?String.fromCharCode(64+n):'A'+String.fromCharCode(64+n-26);
export const cell=v=>typeof v==='number'?{effectiveValue:{numberValue:v},formattedValue:String(v)}:typeof v==='boolean'?{effectiveValue:{boolValue:v},formattedValue:String(v)}:{effectiveValue:{stringValue:v},formattedValue:v};
export function fixture(){
 let id=1;
 return Object.entries(TABLES).map(([name,key])=>{
  const header=name==='20_DM_SERVICE'?[key,'Service_Code','Service_Name','Service_Category','Status','Start_Date']:name==='21_DM_PARTNER'?[key,'Partner_Code','Partner_Name','Partner_Type','Status','Payment_Term_Days']:name==='30_CONTRACTS'?[key,'Contract_No','Contract_Name','Contract_Type','Partner_ID','Currency','Revenue_Share_Rate','Fixed_Fee','Tax_Rate','Status','Payment_Term_Days']:name==='31_CONTRACT_SERVICES'?[key,'Contract_ID','Service_ID','Revenue_Share_Rate','Fixed_Fee','Status']:[key];
  const values=name==='20_DM_SERVICE'?['SYNTH_SERVICE','SYNTH_CODE','Synthetic service','Other','Active','2026-01-01']:name==='21_DM_PARTNER'?['SYNTH_PARTNER','SYNTH_PARTNER','Synthetic partner','Output','Active',30]:name==='30_CONTRACTS'?['SYNTH_CONTRACT','SYNTHETIC-001','Synthetic contract','Output','SYNTH_PARTNER','USD',0.15,0,0.1,'Active',45]:name==='31_CONTRACT_SERVICES'?['SYNTH_CS','SYNTH_CONTRACT','SYNTH_SERVICE',0.15,0,'Active']:null;
  const rowData=[{values:header.map(cell)},{},...(values?[{values:values.map(cell)}]:[])];
  return {capturedAt:'2026-10-19T00:00:00Z',requestedRange:`'${name}'!A1:${col(header.length)}5`,data:{spreadsheetId:SOURCE_ID,properties:{title:'DGC_ERP_2026_PROD_RC1_CLONE',timeZone:'America/Los_Angeles',locale:'en_GB'},sheets:[{properties:{sheetId:id++,title:name,gridProperties:{rowCount:5,columnCount:header.length}},data:[{rowData}]}]}};
 });
}
