import {canonical,digest,verifySnapshot,TABLES,text} from './core.mjs';
import {capturedMonth} from './recon-semantics.mjs';
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const value=c=>{const v=c?.effectiveValue??c?.userEnteredValue??{};if(v.errorValue)throw Error('Cannot represent spreadsheet error as ledger amount');return v.numberValue??v.stringValue??v.boolValue??null;};
// Preserve earlier row/decision identities. A new captured appendix adds records
// without rewriting, rebasing or applying old owner decisions to new rows.
export function capturedAppendix(base,cells,readReport){
 verifySnapshot(base);if(readReport.sourceSnapshotHash!==base.snapshotHash||readReport.changes.some(c=>c.kind!=='ADDED'))throw Error('This transfer extension only accepts unchanged base plus new rows');
 const snapshot=structuredClone(base),rows=[];
 for(const sh of cells.sheets){const name=sh.properties.title,t=snapshot.tables[name];if(!t||t.sheetId!==sh.properties.sheetId)throw Error('Source sheet differs');
  for(const b of sh.data??[])for(const [i,row] of (b.rowData??[]).entries()){
   const sourceRow=(b.startRow??0)+i+1,cs=Object.fromEntries(t.headers.map((h,j)=>[h,row.values?.[j]??{}])),values=Object.fromEntries(t.headers.map(h=>[h,value(cs[h])])),legacyId=text(values[TABLES[name]]);if(!legacyId)continue;
   if(t.rows.some(r=>r.sourceRow===sourceRow)||!readReport.changes.some(c=>c.sheet===name&&c.sourceRow===sourceRow&&c.kind==='ADDED'))throw Error('Appendix would replace an earlier row');
   const r={sourceRow,legacyId,values,cells:cs,rowHash:digest({values,cells:cs})};t.rows.push(r);rows.push({sheetName:name,sheetId:t.sheetId,payload:r});
  }
 }
 if(rows.length!==readReport.changes.length)throw Error('Incomplete appended source rows');
 const body={format:'dgc-captured-book-appendix-v1',baseSnapshotHash:base.snapshotHash,capturedAt:readReport.readAt,sourceMetadata:{...base.source,captureStartedAt:readReport.readAt,captureEndedAt:readReport.readAt},rows};
 const appendix={...body,appendixHash:digest(body)};snapshot.source={...body.sourceMetadata};delete snapshot.snapshotHash;snapshot.snapshotHash=digest(snapshot);verifySnapshot(snapshot);
 return {snapshot,appendix};
}
export function appendCapturedTargets(snapshot,baseTarget,appendix){
 const target=structuredClone(baseTarget),source=(sheet,row)=>({...addr(sheet,snapshot.tables[sheet],row),...(appendix.rows.some(x=>x.sheetName===sheet&&x.payload.sourceRow===row.sourceRow)?{snapshotHash:appendix.appendixHash}:{})});
 const one=(sheet,id)=>{if(!text(id))return null;const t=snapshot.tables[sheet],found=t.rows.filter(r=>r.legacyId===id);if(found.length!==1)throw Error('Cannot map ambiguous new source relation '+sheet+' '+id);return source(sheet,found[0]);};
 const groups=new Map();for(const r of appendix.rows.filter(r=>r.sheetName==='40_MONTHLY_REVENUE')){
  const raw=r.payload,v=raw.values,period=capturedMonth(raw,'Revenue_Month'),bindings={Contract_ID:one('30_CONTRACTS',v.Contract_ID),Partner_ID:one('21_DM_PARTNER',v.Partner_ID),Service_ID:one('20_DM_SERVICE',v.Service_ID),Parent_Service_ID:one('20_DM_SERVICE',v.Parent_Service_ID),Source_Recon_Doc_ID:one('43_RECON_PDF_HEADER',v.Source_Recon_Doc_ID),Source_Recon_Detail_ID:one('44_RECON_PDF_DETAIL',v.Source_Recon_Detail_ID)};
  const groupKey=digest({period,document:bindings.Source_Recon_Doc_ID,contract:bindings.Contract_ID,partner:bindings.Partner_ID}),g=groups.get(groupKey)??{groupKey,period,currency:v.Currency,partnerSource:bindings.Partner_ID,contractSource:bindings.Contract_ID,documentSource:bindings.Source_Recon_Doc_ID,sourceFileId:null,entries:[],reasons:[]};
  const doc=bindings.Source_Recon_Doc_ID&&snapshot.tables['43_RECON_PDF_HEADER'].rows.find(r=>r.sourceRow===bindings.Source_Recon_Doc_ID.sourceRow),url=doc?.values.Source_File_URL??'';g.sourceFileId=String(url).match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/)?.[1]??null;
  g.entries.push({source:source('40_MONTHLY_REVENUE',raw),capturedRevenue:raw,sourceStatus:v.Status,bindings,aggregationMapping:{rowType:String(v.Revenue_Row_Type).toUpperCase(),includeInMonthlyTotal:String(v.Include_In_Monthly_Total).toUpperCase()==='Y'},capturedManagement:Object.fromEntries(['Gross_Revenue','Tax_Amount','Net_Revenue','Partner_Share','Company_Share'].map(k=>[k,String(v[k])])),rehearsalReasons:[]});groups.set(groupKey,g);
 }
 target.groups.push(...groups.values());return target;
}
