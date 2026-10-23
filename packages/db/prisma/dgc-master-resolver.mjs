import {SOURCE_ID,canonical,digest,masterPlan} from './dgc-master-core.mjs';
const identity=s=>s.sheetId+'|'+s.sourceRow;
const value=v=>v instanceof Date?v.toISOString():v?.toFixed?v.toFixed():v;
export async function masterResolver(tx,snapshot,companyId,decisions){
 const plan=masterPlan(snapshot,decisions),cache=new Map();
 async function resolve(source,expectedModel){
  if(!source)throw Error('Missing master source');const k=identity(source);
  const item=plan.items.find(i=>i.sheetId===source.sheetId&&i.sourceRow===source.sourceRow&&i.rowHash===source.rowHash&&i.legacyId===source.legacyId);
  if(!item||expectedModel&&item.model!==expectedModel||plan.issues.some(i=>i.sheet===item.sheet&&i.sourceRow===item.sourceRow))throw Error('Unresolved master mapping');
  if(cache.has(k))return cache.get(k);
  const links=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:item.sheetId,OR:[{sourceRow:item.sourceRow},{legacyId:item.legacyId}]}});
  const link=links[0];if(links.length!==1||link.sourceRow!==item.sourceRow||link.legacyId!==item.legacyId||link.rowHash!==item.rowHash||link.targetModel!==item.model)throw Error('Missing, stale or ambiguous master provenance');
  const manifest=await tx.dgcImportSnapshot.findUnique({where:{companyId_snapshotHash:{companyId,snapshotHash:link.snapshotHash}}}),meta=manifest?.sourceMetadata;
  const full=link.snapshotHash===snapshot.snapshotHash;
  const earlierFull=!full&&meta&&canonical(Object.keys(meta).sort())===canonical(Object.keys(snapshot.source).sort())&&['spreadsheetId','title','timezone','locale','consistency'].every(k=>meta[k]===snapshot.source[k])&&Number.isFinite(Date.parse(meta.captureStartedAt))&&Number.isFinite(Date.parse(meta.captureEndedAt))&&manifest.rowCount>0&&await tx.dgcImportRow.count({where:{companyId,snapshotHash:link.snapshotHash}})===manifest.rowCount;
  if(!manifest||manifest.sourceSpreadsheetId!==SOURCE_ID||full&&(manifest.rowCount!==Object.values(snapshot.tables).reduce((n,t)=>n+t.rows.length,0)||canonical(meta)!==canonical(snapshot.source))||!full&&!earlierFull&&(manifest.rowCount!==plan.items.length||meta?.format!=='dgc-master-transfer-v1'||meta.masterOnly!==true||meta.financialRecordsIncluded!==false||meta.sourceSnapshotHash!==snapshot.snapshotHash||meta.planHash!==plan.planHash||meta.decisionsHash!==plan.decisionsHash||canonical(Object.fromEntries(Object.keys(snapshot.source).map(k=>[k,meta[k]])))!==canonical(snapshot.source)))throw Error('Master source manifest does not bind the reviewed financial snapshot');
  const evidence=await tx.dgcImportRow.findUnique({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId,snapshotHash:link.snapshotHash,sheetId:item.sheetId,sourceRow:item.sourceRow}}}),raw=snapshot.tables[item.sheet].rows.find(r=>r.sourceRow===item.sourceRow);
  if(!evidence||evidence.sheetName!==item.sheet||evidence.legacyId!==item.legacyId||evidence.rowHash!==item.rowHash||canonical(evidence.payload)!==canonical(raw))throw Error('Imported master raw evidence differs');
  const data={...item.data};for(const dep of item.dependencies){const t=snapshot.tables[dep.sheet],rs=t.rows.filter(r=>r.legacyId===dep.legacyId);if(rs.length!==1)throw Error('Ambiguous master dependency');data[dep.field]=await resolve({sheetId:t.sheetId,...rs[0]});}
  const row=await tx[item.model].findFirst({where:{companyId,id:link.targetId}});
  const normalized=Object.fromEntries(Object.keys(data).map(k=>[k,row?.[k] instanceof Date?row[k].toISOString().slice(0,10):value(row?.[k])]));
  if(!row||digest(normalized)!==link.targetHash||digest(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)])))!==link.targetHash)throw Error('Imported master target or mapping changed');
  cache.set(k,link.targetId);return link.targetId;
 }
 return resolve;
}

