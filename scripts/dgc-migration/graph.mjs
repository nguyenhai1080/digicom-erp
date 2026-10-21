import {verifySnapshot,masterPlan,digest,sourceDate} from './core.mjs';
const specs={
 '30_CONTRACTS':{Partner_ID:'21_DM_PARTNER'},
 '31_CONTRACT_SERVICES':{Contract_ID:'30_CONTRACTS',Service_ID:'20_DM_SERVICE'},
 '40_MONTHLY_REVENUE':{Contract_ID:'30_CONTRACTS',Partner_ID:'21_DM_PARTNER',Service_ID:'20_DM_SERVICE',Parent_Service_ID:'20_DM_SERVICE',Source_Recon_Doc_ID:'43_RECON_PDF_HEADER',Source_Recon_Detail_ID:'44_RECON_PDF_DETAIL'},
 '41_RECONCILIATION':{Partner_ID:'21_DM_PARTNER',Contract_ID:'30_CONTRACTS',Service_ID:'20_DM_SERVICE',Revenue_ID:'40_MONTHLY_REVENUE'},
 '42_RECON_PDF_UPLOAD':{Partner_ID:'21_DM_PARTNER'},
 '43_RECON_PDF_HEADER':{Upload_ID:'42_RECON_PDF_UPLOAD',Partner_ID:'21_DM_PARTNER'},
 '44_RECON_PDF_DETAIL':{Recon_Doc_ID:'43_RECON_PDF_HEADER',Upload_ID:'42_RECON_PDF_UPLOAD',Mapping_Service_ID:'20_DM_SERVICE',Mapping_Contract_ID:'30_CONTRACTS'},
 '45_RECON_PDF_SUMMARY':{Recon_Doc_ID:'43_RECON_PDF_HEADER'},
 '48_INVOICE_HEADER':{Partner_ID:'21_DM_PARTNER',Supersedes_Invoice_ID:'48_INVOICE_HEADER',Superseded_By_Invoice_ID:'48_INVOICE_HEADER'},
 '49_INVOICE_DETAIL':{Invoice_ID:'48_INVOICE_HEADER',Revenue_ID:'40_MONTHLY_REVENUE',Service_ID:'20_DM_SERVICE',Source_Recon_Doc_ID:'43_RECON_PDF_HEADER',Source_Recon_Detail_ID:'44_RECON_PDF_DETAIL'},
 '50_AR_AP':{Partner_ID:'21_DM_PARTNER',Contract_ID:'30_CONTRACTS',Recon_ID:'41_RECONCILIATION',Revenue_ID:'40_MONTHLY_REVENUE',Invoice_ID:'48_INVOICE_HEADER',Supersedes_ARAP_ID:'50_AR_AP',Superseded_By_ARAP_ID:'50_AR_AP'},
 '51_INVOICES':{ARAP_ID:'50_AR_AP',Partner_ID:'21_DM_PARTNER',Contract_ID:'30_CONTRACTS'},
 '52_INVOICE_PAYMENT':{Invoice_ID:'48_INVOICE_HEADER',Partner_ID:'21_DM_PARTNER',ARAP_ID:'50_AR_AP',Account_ID:'22_DM_ACCOUNT'},
 '53_SOA_HEADER':{Partner_ID:'21_DM_PARTNER'},
 '54_SOA_DETAIL':{SOA_ID:'53_SOA_HEADER',Invoice_ID:'48_INVOICE_HEADER'},
 '55_APPROVAL_PACKAGE':{Partner_ID:'21_DM_PARTNER',Related_Recon_Doc_IDs:'43_RECON_PDF_HEADER',Related_Revenue_IDs:'40_MONTHLY_REVENUE',Related_Recon_IDs:'41_RECONCILIATION',Related_Invoice_IDs:'48_INVOICE_HEADER'},
 '56_INPUT_RECONCILIATION':{Source_Revenue_ID:'40_MONTHLY_REVENUE',Source_Recon_Doc_ID:'43_RECON_PDF_HEADER',Source_Recon_Detail_ID:'44_RECON_PDF_DETAIL',Service_ID:'20_DM_SERVICE',Output_Partner_ID:'21_DM_PARTNER',Output_Contract_ID:'30_CONTRACTS',Input_Partner_ID:'21_DM_PARTNER',Input_Contract_ID:'30_CONTRACTS',ARAP_ID:'50_AR_AP'},
 '60_TRANSACTIONS':{Payment_ID:'52_INVOICE_PAYMENT',Account_ID:'22_DM_ACCOUNT',Invoice_ID:'48_INVOICE_HEADER',Partner_ID:'21_DM_PARTNER',Contract_ID:'30_CONTRACTS',ARAP_ID:'50_AR_AP',Category_ID:'23_DM_TRANSACTION_CATEGORY',From_Account_ID:'22_DM_ACCOUNT',To_Account_ID:'22_DM_ACCOUNT'},
 '61_ACCOUNT_BALANCE':{Account_ID:'22_DM_ACCOUNT'},
 '23_SERVICE_3RDPARTY_RULE':{Service_ID:'20_DM_SERVICE',Input_Contract_ID:'30_CONTRACTS',Output_Contract_ID:'30_CONTRACTS',Input_Partner_ID:'21_DM_PARTNER',Output_Partner_ID:'21_DM_PARTNER'}
};
const text=v=>v==null?'':String(v).trim(),name=v=>text(v).normalize('NFKC').toUpperCase().replace(/\s+/g,' ');
const address=(sheet,table,row)=>({sheet,sheetId:table.sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash});
function fileId(v){const s=text(v);if(/^[A-Za-z0-9_-]{20,}$/.test(s))return s;return s.match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/)?.[1]??null;}

// Review evidence only. All physical rows survive; this does not import, dedupe,
// repair a source ID, or establish that a financial amount is accepted.
export function referenceGraph(snapshot,resolutions){
 verifySnapshot(snapshot);
 if(resolutions)masterPlan(snapshot,resolutions); // exact snapshot/row/owner decision validation
 const aliases=new Map((resolutions?.decisions??[]).filter(d=>d.sheet==='31_CONTRACT_SERVICES'&&d.field==='Service_ID').map(d=>[name(d.expectedValue),d.value]));
 const indexes={},duplicates=[],nodes=[];
 for(const [sheet,t] of Object.entries(snapshot.tables)){
  const index=new Map();indexes[sheet]=index;
  for(const row of t.rows){nodes.push({...address(sheet,t,row),status:text(row.values.Status||row.values.Parse_Status),isCurrent:row.values.Is_Current??null});if(row.legacyId){const all=index.get(row.legacyId)??[];all.push(row);index.set(row.legacyId,all);}}
  for(const [legacyId,all] of index)if(all.length>1)duplicates.push({sheet,legacyId,rows:all.map(r=>address(sheet,t,r))});
 }
 const serviceNames=new Map();
 for(const r of snapshot.tables['20_DM_SERVICE'].rows)for(const key of [r.legacyId,r.values.Service_Code,r.values.Service_Name])if(text(key)){const k=name(key),ids=serviceNames.get(k)??new Set();ids.add(r.legacyId);serviceNames.set(k,ids);}
 const service=v=>{const k=name(v),alias=aliases.get(k);if(alias)return alias;const ids=serviceNames.get(k);return ids?.size===1?[...ids][0]:text(v)?'unmapped:'+k:null;};
 const unique=(sheet,id)=>{const rows=indexes[sheet]?.get(text(id))??[];return rows.length===1?rows[0]:null;};
 const contextCache=new Map(),calendarIssues=[];
 function month(sheet,row){for(const field of ['Revenue_Month','Recon_Month','Period_Month','Period']){const v=row.values[field];if(!text(v))continue;if(/^\d{4}-(0[1-9]|1[0-2])$/.test(text(v)))return text(v);try{return sourceDate(row,field)?.slice(0,7)??null;}catch{calendarIssues.push({...address(sheet,snapshot.tables[sheet],row),field,reason:'UNRESOLVED_PERIOD'});return null;}}return null;}
 function context(sheet,row,seen=new Set()){
  const key=sheet+'|'+row.sourceRow;if(contextCache.has(key))return contextCache.get(key);if(seen.has(key))return {};seen=new Set([...seen,key]);
  const v=row.values;let inherited={};
  const parent=sheet==='44_RECON_PDF_DETAIL'||sheet==='45_RECON_PDF_SUMMARY'?['43_RECON_PDF_HEADER',v.Recon_Doc_ID]:sheet==='49_INVOICE_DETAIL'||sheet==='52_INVOICE_PAYMENT'||sheet==='50_AR_AP'?['48_INVOICE_HEADER',v.Invoice_ID]:null;
  if(parent){const p=unique(...parent);if(p){inherited={...context(parent[0],p,seen)};if(parent[0]==='48_INVOICE_HEADER')delete inherited.period;}}
  // A mapped service can be the contract's parent bundle; Service_Name is the
  // physical PDF line. Invoice headers can span several revenue months.
  let serviceKey=service(v.Service_ID||v.Mapping_Service_ID||v.Service_Header||v.Service_Name);
  if(sheet==='44_RECON_PDF_DETAIL'){
   const physical=service(v.Service_Name);
   // Recognized child names identify the PDF line. Other display labels use
   // the donor's explicit mapping, not punctuation-based guessed aliases.
   serviceKey=physical&&!physical.startsWith('unmapped:')?physical:service(v.Mapping_Service_ID)||physical;
  }
  const own={partner:text(v.Partner_ID||v.Output_Partner_ID)||null,contract:sheet==='30_CONTRACTS'?row.legacyId:text(v.Contract_ID||v.Output_Contract_ID||v.Mapping_Contract_ID)||null,period:month(sheet,row),service:sheet==='30_CONTRACTS'?null:serviceKey,doc:text(v.Source_Recon_Doc_ID||v.Recon_Doc_ID)||null};
  const files=sheet==='42_RECON_PDF_UPLOAD'?[v.File_ID,v.File_URL,row.cells.File_URL?.hyperlink]:sheet==='43_RECON_PDF_HEADER'?[v.Source_File_URL,row.cells.Source_File_URL?.hyperlink]:[];
  own.file=files.map(fileId).find(Boolean)??null;
  const result={...inherited,...Object.fromEntries(Object.entries(own).filter(([,v])=>v!==null))};contextCache.set(key,result);return result;
 }
 const links=[];
 for(const [sheet,fields] of Object.entries(specs))for(const row of snapshot.tables[sheet].rows)for(const [field,targetSheet] of Object.entries(fields)){
  const raw=text(row.values[field]);if(!raw)continue;
  const ids=field.startsWith('Related_')?[...new Set(raw.split(/[,;\n]/).map(text).filter(Boolean))]:[raw];
  for(const legacyId of ids){
   const alias=targetSheet==='20_DM_SERVICE'?aliases.get(name(legacyId)):null,lookupId=alias??legacyId,candidates=indexes[targetSheet].get(lookupId)??[];
   const from={...context(sheet,row)};
   if(targetSheet==='21_DM_PARTNER')from.partner=lookupId;
   if(targetSheet==='30_CONTRACTS'){from.contract=lookupId;if(field.startsWith('Input_'))from.partner=text(row.values.Input_Partner_ID)||null;delete from.service;}
   // Input AP belongs to the input partner/contract. Its Revenue_ID points to
   // output revenue, whose counterparty/contract are different by design.
   if(sheet==='56_INPUT_RECONCILIATION'&&targetSheet==='50_AR_AP'){from.partner=text(row.values.Input_Partner_ID)||null;from.contract=text(row.values.Input_Contract_ID)||null;}
   if(sheet==='50_AR_AP'&&text(row.values.ARAP_Type).toUpperCase()==='AP'&&targetSheet==='40_MONTHLY_REVENUE'){delete from.partner;delete from.contract;}
   if(targetSheet==='20_DM_SERVICE')from.service=service(lookupId);
   // A PDF header/upload may cover multiple child services and contracts.
   // These dimensions cannot contradict a child's explicit parent reference.
   if(['42_RECON_PDF_UPLOAD','43_RECON_PDF_HEADER'].includes(targetSheet)){delete from.service;delete from.contract;delete from.doc;}
   // Package month is an approval cycle, not an invoice's revenue period.
   if(sheet==='55_APPROVAL_PACKAGE'&&targetSheet==='48_INVOICE_HEADER')delete from.period;
   const evaluations=candidates.map(candidate=>{
    const to=context(targetSheet,candidate),matched=[],conflicts=[];
    for(const k of ['partner','contract','period','service','doc','file'])if(from[k]&&to[k]){(from[k]===to[k]?matched:conflicts).push(k);}
    return {target:address(targetSheet,snapshot.tables[targetSheet],candidate),matched,conflicts};
   });
   const compatible=evaluations.filter(e=>!e.conflicts.length);
   let state='MISSING',selected=null;
   if(candidates.length===1){state=evaluations[0].conflicts.length?'CONTEXT_CONFLICT':alias?'OWNER_ALIAS_COMPARISON':'UNIQUE_ID';if(state!=='CONTEXT_CONFLICT')selected=evaluations[0].target;}
   else if(candidates.length>1){state='AMBIGUOUS';if(compatible.length===1){const e=compatible[0],strong=e.matched.includes('file')||e.matched.includes('doc')||e.matched.includes('period')&&(e.matched.includes('partner')||e.matched.includes('service')||e.matched.includes('contract'));if(strong){state='CONTEXT_MATCH';selected=e.target;}}}
   links.push({source:address(sheet,snapshot.tables[sheet],row),field,targetSheet,legacyId,...(alias?{comparisonAlias:alias}:{}),state,target:selected,evidence:evaluations});
  }
 }
 const counts=links.reduce((a,l)=>(a[l.state]=(a[l.state]??0)+1,a),{}),issues=links.filter(l=>!l.target);
 const report={format:'dgc-reference-review-v1',snapshotHash:snapshot.snapshotHash,decisionsHash:resolutions?digest(resolutions):null,source:snapshot.source,postingAllowed:false,acceptance:false,nodes,duplicatesRetained:duplicates,links,calendarIssues,counts,unresolved:issues.length};
 return {...report,planHash:digest(report)};
}
