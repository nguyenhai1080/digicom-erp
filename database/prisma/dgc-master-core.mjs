import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(import.meta.url)('@prisma/client');
const D=v=>new Prisma.Decimal(String(v));
export const SOURCE_ID='1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A';
export const TABLES={
 '15_FX_RATE':'FX_ID','20_DM_SERVICE':'Service_ID','21_DM_PARTNER':'Partner_ID','22_DM_ACCOUNT':'Account_ID',
 '23_DM_TRANSACTION_CATEGORY':'Category_ID','23_SERVICE_3RDPARTY_RULE':'Rule_ID','30_CONTRACTS':'Contract_ID',
 '31_CONTRACT_SERVICES':'Contract_Service_ID','40_MONTHLY_REVENUE':'Revenue_ID','41_RECONCILIATION':'Recon_ID',
 '42_RECON_PDF_UPLOAD':'Upload_ID','43_RECON_PDF_HEADER':'Recon_Doc_ID','44_RECON_PDF_DETAIL':'Recon_Detail_ID',
 '45_RECON_PDF_SUMMARY':'Summary_ID','48_INVOICE_HEADER':'Invoice_ID','49_INVOICE_DETAIL':'Invoice_Detail_ID',
 '50_AR_AP':'ARAP_ID','51_INVOICES':'Invoice_ID','52_INVOICE_PAYMENT':'Payment_ID','53_SOA_HEADER':'SOA_ID',
 '54_SOA_DETAIL':'SOA_Detail_ID','55_APPROVAL_PACKAGE':'Approval_ID','56_INPUT_RECONCILIATION':'Input_Recon_ID',
 '60_TRANSACTIONS':'Transaction_ID','61_ACCOUNT_BALANCE':'Account_ID'
};
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
export const digest=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const blank=v=>v===undefined||v===null||typeof v==='string'&&!v.trim();
export const text=v=>blank(v)?'':String(v).trim();
function value(cell){const v=cell.effectiveValue??cell.userEnteredValue??{};if(v.errorValue)throw Error('Source contains a spreadsheet error');return v.numberValue??v.stringValue??v.boolValue??null;}

export function normalizeCapture(envelopes){
 const tables={},times=[],ids=new Set();let title,timezone,locale;
 for(const envelope of envelopes){
  const data=envelope.data;
  if(data.spreadsheetId!==SOURCE_ID||data.properties?.title!=='DGC_ERP_2026_PROD_RC1_CLONE')throw Error('Wrong DGC source workbook');
  if(!envelope.capturedAt||!Number.isFinite(Date.parse(envelope.capturedAt)))throw Error('Capture timestamp required');
  if(timezone&&timezone!==data.properties.timeZone)throw Error('Source timezone changed during capture');
  timezone=data.properties.timeZone;locale=data.properties.locale;title=data.properties.title;times.push(envelope.capturedAt);
  for(const sheet of data.sheets){
   const {sheetId,title:name,gridProperties}=sheet.properties;
   if(!Object.hasOwn(TABLES,name)||tables[name]||ids.has(sheetId))throw Error('Unknown or repeated source sheet');
   ids.add(sheetId);
   if(sheet.data.length!==1||(sheet.data[0].startRow??0)!==0||(sheet.data[0].startColumn??0)!==0)throw Error('Capture must start at A1 and include one contiguous grid');
   // The stored request must cover the complete metadata bounds, not a filtered row list.
   const range=envelope.requestedRange?.match(/^'([^']+)'!A1:([A-Z]+)(\d+)$/);
   const col=range?.[2].split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
   if(!range||range[1]!==name||Number(range[3])!==gridProperties.rowCount||col!==gridProperties.columnCount)throw Error('Incomplete source capture range');
   const grid=sheet.data[0].rowData??[],headers=(grid[0]?.values??[]).map(c=>text(value(c))),named=headers.filter(Boolean);
   if(named.length!==new Set(named).size||!headers.includes(TABLES[name]))throw Error('Invalid or duplicate source headers: '+name);
   const rows=[];
   for(let i=1;i<grid.length;i++){
    const cells=grid[i].values??[];
    if(!cells.some(c=>!blank(value(c))||c.userEnteredValue?.formulaValue))continue;
    if(cells.some((c,j)=>!headers[j]&&(!blank(value(c))||c.userEnteredValue?.formulaValue)))throw Error('Populated cell without a header: '+name+' row '+(i+1));
    const values=Object.fromEntries(headers.flatMap((h,j)=>h?[[h,value(cells[j]??{})]]:[]));
    const cellMetadata=Object.fromEntries(headers.flatMap((h,j)=>h?[[h,cells[j]??{}]]:[]));
    const sourceRow=i+1,legacyId=text(values[TABLES[name]]);
    rows.push({sourceRow,legacyId,values,cells:cellMetadata,rowHash:digest({values,cells:cellMetadata})});
   }
   tables[name]={sheetId,headers:named,gridBounds:gridProperties,requestedRange:envelope.requestedRange,rows};
  }
 }
 const missing=Object.keys(TABLES).filter(k=>!tables[k]);if(missing.length)throw Error('Missing source tables: '+missing.join(', '));
 times.sort();
 const snapshot={format:'dgc-snapshot-v1',source:{spreadsheetId:SOURCE_ID,title,timezone,locale,captureStartedAt:times[0],captureEndedAt:times.at(-1),consistency:'MULTI_REQUEST_NOT_FROZEN'},tables};
 return {...snapshot,snapshotHash:digest(snapshot)};
}
export function verifySnapshot(snapshot){
 const {snapshotHash,...body}=snapshot;
 if(body.format!=='dgc-snapshot-v1'||body.source.spreadsheetId!==SOURCE_ID||body.source.title!=='DGC_ERP_2026_PROD_RC1_CLONE'||snapshotHash!==digest(body))throw Error('Invalid source or snapshot checksum');
 for(const [name,table] of Object.entries(snapshot.tables)){
  if(!Object.hasOwn(TABLES,name))throw Error('Unknown table');
  const seen=new Set();
  for(const row of table.rows){if(!Number.isInteger(row.sourceRow)||row.sourceRow<2||row.sourceRow>table.gridBounds.rowCount||seen.has(row.sourceRow)||row.legacyId!==text(row.values[TABLES[name]])||table.headers.some(h=>canonical(row.values[h])!==canonical(value(row.cells[h]??{})))||row.rowHash!==digest({values:row.values,cells:row.cells}))throw Error('Invalid source row');seen.add(row.sourceRow);}
 }
 if(Object.keys(TABLES).some(k=>!snapshot.tables[k]))throw Error('Missing table');
 return snapshot;
}
const refs=[
 ['30_CONTRACTS','Partner_ID','21_DM_PARTNER'],['31_CONTRACT_SERVICES','Contract_ID','30_CONTRACTS'],['31_CONTRACT_SERVICES','Service_ID','20_DM_SERVICE'],
 ['40_MONTHLY_REVENUE','Contract_ID','30_CONTRACTS'],['40_MONTHLY_REVENUE','Partner_ID','21_DM_PARTNER'],['40_MONTHLY_REVENUE','Service_ID','20_DM_SERVICE'],['40_MONTHLY_REVENUE','Source_Recon_Doc_ID','43_RECON_PDF_HEADER'],['40_MONTHLY_REVENUE','Source_Recon_Detail_ID','44_RECON_PDF_DETAIL'],
 ['41_RECONCILIATION','Revenue_ID','40_MONTHLY_REVENUE'],['42_RECON_PDF_UPLOAD','Partner_ID','21_DM_PARTNER'],['43_RECON_PDF_HEADER','Upload_ID','42_RECON_PDF_UPLOAD'],
 ['44_RECON_PDF_DETAIL','Recon_Doc_ID','43_RECON_PDF_HEADER'],['44_RECON_PDF_DETAIL','Upload_ID','42_RECON_PDF_UPLOAD'],['45_RECON_PDF_SUMMARY','Recon_Doc_ID','43_RECON_PDF_HEADER'],
 ['48_INVOICE_HEADER','Partner_ID','21_DM_PARTNER'],['49_INVOICE_DETAIL','Invoice_ID','48_INVOICE_HEADER'],['49_INVOICE_DETAIL','Revenue_ID','40_MONTHLY_REVENUE'],['49_INVOICE_DETAIL','Source_Recon_Doc_ID','43_RECON_PDF_HEADER'],['49_INVOICE_DETAIL','Source_Recon_Detail_ID','44_RECON_PDF_DETAIL'],
 ['50_AR_AP','Partner_ID','21_DM_PARTNER'],['51_INVOICES','ARAP_ID','50_AR_AP'],['52_INVOICE_PAYMENT','Invoice_ID','48_INVOICE_HEADER'],
 ['54_SOA_DETAIL','SOA_ID','53_SOA_HEADER'],['54_SOA_DETAIL','Invoice_ID','48_INVOICE_HEADER'],['56_INPUT_RECONCILIATION','Source_Revenue_ID','40_MONTHLY_REVENUE'],['56_INPUT_RECONCILIATION','Input_Contract_ID','30_CONTRACTS'],['56_INPUT_RECONCILIATION','ARAP_ID','50_AR_AP'],
 ['60_TRANSACTIONS','Payment_ID','52_INVOICE_PAYMENT'],['60_TRANSACTIONS','Account_ID','22_DM_ACCOUNT'],['60_TRANSACTIONS','Invoice_ID','48_INVOICE_HEADER']
];
export function preflight(snapshot){
 verifySnapshot(snapshot);const indexes={},issues=[],counts={};
 for(const [name,t] of Object.entries(snapshot.tables)){
  counts[name]=t.rows.length;const index=new Map();indexes[name]=index;
  for(const r of t.rows){if(!r.legacyId){issues.push({code:'MISSING_ID',sheet:name,sourceRow:r.sourceRow});continue;}const rows=index.get(r.legacyId)??[];rows.push(r);index.set(r.legacyId,rows);}
  for(const [legacyId,rows] of index)if(rows.length>1)issues.push({code:'DUPLICATE_ID',sheet:name,legacyId,sourceRows:rows.map(r=>r.sourceRow),distinctContents:new Set(rows.map(r=>r.rowHash)).size});
 }
 for(const [sheet,field,target] of refs)for(const r of snapshot.tables[sheet].rows){const id=text(r.values[field]);if(!id)continue;const candidates=indexes[target].get(id)??[];if(candidates.length!==1)issues.push({code:candidates.length?'AMBIGUOUS_REFERENCE':'MISSING_REFERENCE',sheet,sourceRow:r.sourceRow,field,target,legacyId:id,candidateRows:candidates.map(r=>r.sourceRow)});}
 const totals={};
 // Inventory totals, not accepted balances. Keep each currency/status/row type separate.
 for(const [sheet,fields] of Object.entries({'40_MONTHLY_REVENUE':['Gross_Revenue','Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'],'48_INVOICE_HEADER':['Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD','Paid_Amount_USD','Outstanding_Amount_USD'],'50_AR_AP':['Original_Amount','Paid_Amount','Outstanding_Amount'],'52_INVOICE_PAYMENT':['Paid_Amount_USD','Paid_Amount_VND'],'60_TRANSACTIONS':['Amount','Signed_Amount']})){
  for(const r of snapshot.tables[sheet].rows){const v=r.values;const group=canonical([sheet,text(v.Currency)||'UNSPECIFIED',text(v.Status)||'UNSPECIFIED',text(v.Revenue_Row_Type),text(v.Include_In_Monthly_Total),text(v.Is_Current),text(v.ARAP_Type)]);totals[group]??={};
   for(const field of fields){if(blank(v[field]))continue;try{const n=D(v[field]);if(!n.isFinite())throw Error();totals[group][field]=D(totals[group][field]??0).plus(n).toFixed();}catch{issues.push({code:'INVALID_AMOUNT',sheet,sourceRow:r.sourceRow,field});}}
  }
 }
 const documentIds=new Set();let documentReferences=0;
 for(const t of Object.values(snapshot.tables))for(const row of t.rows)for(const [field,v] of Object.entries(row.values)){
  if(!/file|attachment|pdf|source_file/i.test(field)||blank(v))continue;
  const raw=text(v),matches=[...raw.matchAll(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/g)].map(m=>m[1]);
  if(/File_ID$/i.test(field)&&/^[A-Za-z0-9_-]{20,}$/.test(raw))matches.push(raw);
  if(matches.length){documentReferences++;matches.forEach(id=>documentIds.add(id));}
 }
 return {format:'dgc-preflight-v1',snapshotHash:snapshot.snapshotHash,source:snapshot.source,counts,issues,inventoryTotals:totals,documentReferences,uniqueDocumentIds:documentIds.size,documentIds:[...documentIds].sort(),acceptance:false};
}

export function sourceDate(row,field){
 const v=row.values[field];if(blank(v))return null;
 const cell=row.cells[field]??{},type=cell.effectiveFormat?.numberFormat?.type;
 let date;
 if(typeof v==='number'&&['DATE','DATE_TIME'].includes(type))date=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
 else if(/^\d{4}-\d{2}-\d{2}$/.test(text(v)))date=text(v);
 else {const m=text(cell.formattedValue??v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)date=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
 if(!date||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Unresolved calendar date '+field);
 return date;
}
const optional=v=>text(v)||null;
function required(v,field){const s=text(v);if(!s)throw Error('Required '+field);return s;}
function choice(v,allowed,field){const s=required(v,field);if(!allowed.includes(s))throw Error('Unmapped '+field+': '+s);return s;}
function number(v,field,{scale=6,rate=false,integer=false}={}){if(blank(v))return null;const n=D(v);if(!n.isFinite()||n.lt(0)||rate&&n.gt(1)||n.decimalPlaces()>scale||integer&&!n.isInteger())throw Error('Invalid '+field);return n.toFixed();}

export function masterPlan(snapshot,resolutions){
 const report=preflight(snapshot),issues=[],items=[];
 const sheets=['20_DM_SERVICE','21_DM_PARTNER','30_CONTRACTS','31_CONTRACT_SERVICES'];
 const decisions=resolutions?.decisions??[],overrides=new Map();
 if(resolutions&&(resolutions.format!=='dgc-master-decisions-v1'||resolutions.snapshotHash!==snapshot.snapshotHash||!Array.isArray(decisions)))throw Error('Decisions must match the exact source snapshot');
 for(const d of decisions){
  const table=snapshot.tables[d.sheet],row=table?.rows.find(r=>r.sourceRow===d.sourceRow),key=d.sheet+'|'+d.sourceRow+'|'+d.field;
  const supported=d.field==='Status'||d.sheet==='30_CONTRACTS'&&d.field==='Tax_Rate'||d.sheet==='31_CONTRACT_SERVICES'&&d.field==='Service_ID';
  if(!sheets.includes(d.sheet)||!row||table.sheetId!==d.sheetId||row.legacyId!==d.legacyId||row.rowHash!==d.expectedRowHash||!supported||!Object.hasOwn(row.values,d.field)||canonical(row.values[d.field])!==canonical(d.expectedValue)||d.approvedBy!=='OWNER'||!text(d.reason)||!Number.isFinite(Date.parse(d.approvedAt))||overrides.has(key))throw Error('Invalid, stale or unsupported master decision');
  overrides.set(key,d.value);
 }
 const index=Object.fromEntries(sheets.map(s=>[s,new Map(snapshot.tables[s].rows.map(r=>[r.legacyId,r]))]));
 for(const sheet of sheets)for(const row of snapshot.tables[sheet].rows){
  try{
   if(!row.legacyId||report.issues.some(i=>i.sheet===sheet&&(i.code==='DUPLICATE_ID'&&i.legacyId===row.legacyId||i.code==='MISSING_ID'&&i.sourceRow===row.sourceRow)))throw Error('Missing or duplicate identity');
   const v={...row.values};for(const field of ['Status','Tax_Rate','Service_ID'])if(overrides.has(sheet+'|'+row.sourceRow+'|'+field))v[field]=overrides.get(sheet+'|'+row.sourceRow+'|'+field);
   const nullable={createdBy:optional(v.Created_By),updatedBy:optional(v.Updated_By)};let model,data,dependencies=[];
   if(sheet==='20_DM_SERVICE'){
    model='service';data={...nullable,serviceKey:row.legacyId,serviceCode:text(v.Service_Code)||row.legacyId,serviceName:required(v.Service_Name,'Service_Name'),category:'OTHER',dgcCategory:choice(v.Service_Category,['Basic','Application','Content','Utility','Other'],'Service_Category'),keyword:optional(v.Keyword),description:optional(v.Description),status:choice(text(v.Status).toUpperCase(),['ACTIVE','INACTIVE','SUSPENDED'],'Status'),startDate:sourceDate(row,'Start_Date'),endDate:sourceDate(row,'End_Date')};
   }else if(sheet==='21_DM_PARTNER'){
    model='partner';const types={Output:'CUSTOMER',Input:'SUPPLIER',Both:'BOTH',Other:'OTHER'},sourceType=choice(v.Partner_Type,Object.keys(types),'Partner_Type');
    // Preserve blank status as inactive-in-runtime until explicitly resolved; do not invent historical Active.
    data={...nullable,partnerKey:row.legacyId,partnerCode:text(v.Partner_Code)||row.legacyId,legalName:required(v.Partner_Name,'Partner_Name'),partnerType:types[sourceType],partnerCategory:optional(v.Partner_Category),countryName:optional(v.Country),registrationNumber:optional(v.Business_Registration_No),taxCode:optional(v.Tax_Registration_No)||optional(v.Tax_Code),contactName:optional(v.Contact_Name)||optional(v.Invoice_Attention_Name),invoiceRecipient:optional(v.Invoice_Attention_Name)||optional(v.Contact_Name),email:optional(v.Contact_Email)||optional(v.Invoice_Email),invoiceEmail:optional(v.Invoice_Email)||optional(v.Contact_Email),phone:optional(v.Contact_Phone),registeredAddress:optional(v.Address),billingAddress:optional(v.Billing_Address)||optional(v.Address),paymentTermDays:Number(number(v.Payment_Term_Days??0,'Payment_Term_Days',{scale:0,integer:true})??0),status:choice(text(v.Status).toUpperCase(),['ACTIVE','INACTIVE','BLACKLISTED','BLACKLIST','SUSPENDED'],'Status')};
    if(data.status==='BLACKLIST')data.status='BLACKLISTED';
   }else if(sheet==='30_CONTRACTS'){
    model='contract';const partner=required(v.Partner_ID,'Partner_ID');dependencies=[{field:'partnerId',sheet:'21_DM_PARTNER',legacyId:partner}];
    data={...nullable,contractCode:row.legacyId,contractNumber:optional(v.Contract_No),contractName:required(v.Contract_Name,'Contract_Name'),dgcDirection:choice(v.Contract_Type,['Input','Output','Other'],'Contract_Type'),businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',currency:choice(v.Currency,['USD','VND'],'Currency'),signingDate:sourceDate(row,'Contract_Date'),effectiveDate:sourceDate(row,'Start_Date'),expiryDate:sourceDate(row,'End_Date'),revenueShareRate:number(v.Revenue_Share_Rate,'Revenue_Share_Rate',{rate:true}),fixedFee:number(v.Fixed_Fee,'Fixed_Fee',{scale:4}),taxRate:number(v.Tax_Rate,'Tax_Rate',{rate:true}),paymentTermDays:Number(number(v.Payment_Term_Days??0,'Payment_Term_Days',{scale:0,integer:true})??0),billingCycle:optional(v.Billing_Cycle),status:choice(text(v.Status).toUpperCase(),['DRAFT','ACTIVE','EXPIRED','TERMINATED','SUSPENDED'],'Status'),ownerEmail:optional(v.Owner),attachmentUrl:optional(v.Attachment_URL),notes:optional(v.Note)};
   }else{
    model='contractService';const contract=required(v.Contract_ID,'Contract_ID'),service=required(v.Service_ID,'Service_ID'),parent=index['30_CONTRACTS'].get(contract);
    const rateValue=!blank(v.Revenue_Share_Rate)?v.Revenue_Share_Rate:v.Share_Rate;
    if(!blank(v.Revenue_Share_Rate)&&!blank(v.Share_Rate)&&!D(v.Revenue_Share_Rate).eq(D(v.Share_Rate)))throw Error('Conflicting share rate columns');
    dependencies=[{field:'contractId',sheet:'30_CONTRACTS',legacyId:contract},{field:'serviceId',sheet:'20_DM_SERVICE',legacyId:service}];
    data={createdBy:undefined,businessModel:'REVENUE_SHARE',currency:choice(parent?.values.Currency,['USD','VND'],'Contract Currency'),revenueShareRate:number(rateValue,'Revenue_Share_Rate',{rate:true}),fixedFee:number(v.Fixed_Fee,'Fixed_Fee',{scale:4}),effectiveFrom:sourceDate(row,'Start_Date'),effectiveTo:sourceDate(row,'End_Date'),dgcStatus:choice(text(v.Status).toUpperCase(),['ACTIVE','INACTIVE','SUSPENDED','EXPIRED','TERMINATED'],'Status')};
    delete data.createdBy;data.status=data.dgcStatus==='ACTIVE'?'ACTIVE':data.dgcStatus==='SUSPENDED'?'SUSPENDED':'INACTIVE';
   }
   for(const dep of dependencies)if(!index[dep.sheet].has(dep.legacyId))throw Error('Unresolved dependency '+dep.sheet+'/'+dep.legacyId);
   items.push({sheet,sheetId:snapshot.tables[sheet].sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash,model,data,dependencies});
  }catch(error){issues.push({sheet,sourceRow:row.sourceRow,legacyId:row.legacyId,reason:error.message});}
 }
 const keys=new Set();for(const item of items){const k=[item.model,item.data.serviceCode??item.data.partnerCode??item.data.contractCode??canonical(item.dependencies)].join('|');if(keys.has(k))issues.push({sheet:item.sheet,sourceRow:item.sourceRow,legacyId:item.legacyId,reason:'Duplicate target business key'});keys.add(k);}
 const decisionsHash=digest(decisions);
 return {format:'dgc-master-plan-v1',snapshotHash:snapshot.snapshotHash,decisionsHash,items,issues,ready:issues.length===0,planHash:digest({snapshotHash:snapshot.snapshotHash,decisionsHash,items,issues})};
}
