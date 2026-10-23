import {TABLES,SOURCE_ID,canonical,digest,normalizeCapture,verifySnapshot} from './core.mjs';

export const DELTA_CELL_FIELDS='userEnteredValue,effectiveValue,formattedValue,effectiveFormat(numberFormat),hyperlink';
// Sparse captures retain physical row numbers. Never align duplicate IDs by value.
export function expandDeltaCapture(capture){
 if(capture?.format!=='dgc-live-cells-delta-capture-v1'||capture.spreadsheetId!==SOURCE_ID||capture.source?.title!=='DGC_ERP_2026_PROD_RC1_CLONE'||capture.consistency!=='MULTI_REQUEST_NOT_FROZEN'||capture.cellFields!==DELTA_CELL_FIELDS||!Array.isArray(capture.captures)||!Array.isArray(capture.sheets))throw Error('Invalid live source capture');
 const requests=new Map();
 for(const batch of capture.captures){
  if(!Number.isFinite(Date.parse(batch.capturedAt))||!Array.isArray(batch.ranges))throw Error('Invalid capture request');
  for(const range of batch.ranges){const name=range.match(/^'([^']+)'!A1:[A-Z]+\d+$/)?.[1];if(!Object.hasOwn(TABLES,name)||requests.has(name))throw Error('Invalid or repeated capture range');requests.set(name,{range,at:batch.capturedAt});}
 }
 if(requests.size!==Object.keys(TABLES).length||capture.sheets.length!==requests.size)throw Error('Incomplete live capture');
 const seen=new Set();
 return capture.sheets.map(s=>{
  const name=s.properties?.title,request=requests.get(name),bounds=s.properties?.gridProperties;
  if(!request||seen.has(name)||!Number.isSafeInteger(bounds?.rowCount)||!Number.isSafeInteger(bounds?.columnCount)||bounds.rowCount<1||bounds.rowCount>100000||bounds.columnCount<1||bounds.columnCount>1000||!Array.isArray(s.blocks))throw Error('Invalid capture sheet');
  seen.add(name);const rowData=[],rows=new Set();
  for(const b of s.blocks){if(!Number.isSafeInteger(b.sourceRow)||b.sourceRow<1||b.sourceRow>bounds.rowCount||rows.has(b.sourceRow)||b.startColumn!==0||!Array.isArray(b.values)||b.values.length>bounds.columnCount)throw Error('Invalid physical capture row');rows.add(b.sourceRow);rowData[b.sourceRow-1]={values:b.values};}
  for(let i=0;i<rowData.length;i++)rowData[i]??={};
  return {capturedAt:request.at,requestedRange:request.range,data:{spreadsheetId:capture.spreadsheetId,properties:capture.source,sheets:[{properties:s.properties,data:[{rowData}]}]}};
 });
}

export function sourceDelta(baseline,capture){
 verifySnapshot(baseline);const current=normalizeCapture(expandDeltaCapture(capture));
 if(current.source.timezone!==baseline.source.timezone||current.source.locale!==baseline.source.locale)throw Error('Source calendar/locale changed');
 const tables=[],summary={unchangedRows:0,changedRows:0,addedRows:0,removedRows:0,changedHeaders:0,changedBounds:0};
 for(const name of Object.keys(TABLES)){
  const before=baseline.tables[name],after=current.tables[name];
  if(before.sheetId!==after.sheetId)throw Error('Source sheet identity changed: '+name);
  const headersChanged=canonical(before.headers)!==canonical(after.headers),boundsChanged=canonical(before.gridBounds)!==canonical(after.gridBounds),rows=[];
  if(headersChanged)summary.changedHeaders++;if(boundsChanged)summary.changedBounds++;
  const oldRows=new Map(before.rows.map(r=>[r.sourceRow,r])),newRows=new Map(after.rows.map(r=>[r.sourceRow,r]));let unchangedRows=0;
  for(const sourceRow of [...new Set([...oldRows.keys(),...newRows.keys()])].sort((a,b)=>a-b)){
   const old=oldRows.get(sourceRow),next=newRows.get(sourceRow);
   if(old&&next&&old.rowHash===next.rowHash){unchangedRows++;summary.unchangedRows++;continue;}
   const kind=!old?'ADDED':!next?'REMOVED':'CHANGED';summary[kind==='ADDED'?'addedRows':kind==='REMOVED'?'removedRows':'changedRows']++;
   const fields=[...new Set([...Object.keys(old?.cells??{}),...Object.keys(next?.cells??{})])].filter(k=>canonical(old?.cells[k]??null)!==canonical(next?.cells[k]??null));
   rows.push({sourceRow,kind,beforeRowHash:old?.rowHash??null,afterRowHash:next?.rowHash??null,fields});
  }
  tables.push({sheet:name,sheetId:before.sheetId,beforeCount:before.rows.length,afterCount:after.rows.length,headersChanged,boundsChanged,unchangedRows,rows});
 }
 const contentUnchanged=Object.entries(summary).every(([k,v])=>k==='unchangedRows'||v===0);
 const report={format:'dgc-source-delta-v1',baselineSnapshotHash:baseline.snapshotHash,currentCaptureHash:digest(capture),currentSnapshotHash:current.snapshotHash,source:current.source,summary,tables,contentUnchanged,finalFrozenSnapshot:false,decisionsRebased:false,financialPosting:false};
 return {...report,reportHash:digest(report)};
}
