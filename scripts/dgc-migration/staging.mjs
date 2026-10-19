import {randomUUID} from 'node:crypto';
import {SOURCE_ID,verifySnapshot,masterPlan,digest,canonical} from './core.mjs';

export function requireStaging(url){
 const u=new URL(url);
 if(!['postgresql:','postgres:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/dgc_migration_staging_[a-z0-9_]+$/.test(u.pathname)||u.searchParams.get('schema')&&u.searchParams.get('schema')!=='public')throw Error('Only a dedicated local dgc_migration_staging_* database is allowed');
}
async function company(tx,companyId){
 const c=await tx.company.findUnique({where:{id:companyId}});
 if(!c||c.companyCode!=='DGC'||await tx.company.count()!==1)throw Error('Staging requires exactly one DGC tenant');
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
}
export async function stageSnapshot(prisma,snapshot,companyId){
 requireStaging(process.env.DATABASE_URL??'');
 verifySnapshot(snapshot);
 return prisma.$transaction(async tx=>{
  await company(tx,companyId);
  const old=await tx.$queryRaw`SELECT row_count FROM dgc_import_snapshots WHERE company_id=${companyId}::uuid AND snapshot_hash=${snapshot.snapshotHash}`;
  const rowCount=Object.values(snapshot.tables).reduce((n,t)=>n+t.rows.length,0);
  if(old.length){
   const actual=await tx.$queryRaw`SELECT sheet_id,source_row,legacy_id,row_hash,payload FROM dgc_import_rows WHERE company_id=${companyId}::uuid AND snapshot_hash=${snapshot.snapshotHash}`;
   const expected=new Map(Object.values(snapshot.tables).flatMap(t=>t.rows.map(r=>[t.sheetId+'|'+r.sourceRow,r])));
   if(old[0].row_count!==rowCount||actual.length!==rowCount||actual.some(r=>{const e=expected.get(r.sheet_id+'|'+r.source_row);return !e||r.legacy_id!==e.legacyId||r.row_hash!==e.rowHash||canonical(r.payload)!==canonical(e);}))throw Error('Stored staging snapshot integrity mismatch');
   return {created:false,rows:rowCount};
  }
  await tx.$executeRaw`INSERT INTO dgc_import_snapshots(company_id,snapshot_hash,source_spreadsheet_id,source_metadata,row_count) VALUES(${companyId}::uuid,${snapshot.snapshotHash},${SOURCE_ID},${JSON.stringify(snapshot.source)}::jsonb,${rowCount})`;
  for(const [name,t] of Object.entries(snapshot.tables))for(let i=0;i<t.rows.length;i+=200){
   const rows=t.rows.slice(i,i+200).map(r=>({sheet_id:t.sheetId,sheet_name:name,source_row:r.sourceRow,legacy_id:r.legacyId,row_hash:r.rowHash,payload:r}));
   await tx.$executeRaw`INSERT INTO dgc_import_rows(company_id,snapshot_hash,sheet_id,sheet_name,source_row,legacy_id,row_hash,payload) SELECT ${companyId}::uuid,${snapshot.snapshotHash},x.sheet_id,x.sheet_name,x.source_row,x.legacy_id,x.row_hash,x.payload FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(sheet_id integer,sheet_name text,source_row integer,legacy_id text,row_hash text,payload jsonb)`;
  }
  await tx.auditLog.create({data:{companyId,action:'DGC_STAGE_SNAPSHOT',entityType:'DgcImportSnapshot',newValue:{snapshotHash:snapshot.snapshotHash,rowCount},reason:'Read-only source capture staged; no operational finance generated'}});
  return {created:true,rows:rowCount};
 },{timeout:60000});
}
const modelScopes={services:['service'],partners:['partner'],contracts:['contract','contractService'],all:['service','partner','contract','contractService']};
const dates=new Set(['startDate','endDate','signingDate','effectiveDate','expiryDate','effectiveFrom','effectiveTo']);
const cast=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,dates.has(k)&&v?new Date(v+'T00:00:00Z'):v]));
function targetHash(row,data){return digest(Object.fromEntries(Object.keys(data).map(k=>[k,dates.has(k)&&row[k]?row[k].toISOString().slice(0,10):row[k]?.toFixed?row[k].toFixed():row[k]])));}

export async function applyMasters(prisma,snapshot,companyId,scope,expectedPlanHash,resolutions){
 requireStaging(process.env.DATABASE_URL??'');
 verifySnapshot(snapshot);const plan=masterPlan(snapshot,resolutions),models=modelScopes[scope];
 if(!models||plan.planHash!==expectedPlanHash)throw Error('Unknown scope or stale master plan digest');
 const selected=plan.items.filter(i=>models.includes(i.model));
 const sheetModels={'20_DM_SERVICE':'service','21_DM_PARTNER':'partner','30_CONTRACTS':'contract','31_CONTRACT_SERVICES':'contractService'};
 if(plan.issues.some(i=>models.includes(sheetModels[i.sheet])))throw Error('Selected master scope has unresolved source decisions; see master-plan.json');
 return prisma.$transaction(async tx=>{
  await company(tx,companyId);
  const staged=await tx.$queryRaw`SELECT snapshot_hash FROM dgc_import_snapshots WHERE company_id=${companyId}::uuid AND snapshot_hash=${snapshot.snapshotHash}`;
  if(staged.length!==1)throw Error('Stage and verify snapshot before applying master data');
  let created=0,unchanged=0;
  async function decisionAudit(item,targetId){
   const decisions=(resolutions?.decisions??[]).filter(d=>d.sheet===item.sheet&&d.sourceRow===item.sourceRow);if(!decisions.length)return;
   const traceId=digest({snapshotHash:snapshot.snapshotHash,decisions});
   if(!await tx.auditLog.findFirst({where:{companyId,action:'DGC_IMPORT_DECISION',traceId}}))await tx.auditLog.create({data:{companyId,action:'DGC_IMPORT_DECISION',entityType:item.model,entityId:targetId,traceId,newValue:{snapshotHash:snapshot.snapshotHash,decisions},reason:'Explicit owner mapping applied locally; source workbook unchanged'}});
  }
  for(const item of selected){
   const data={...item.data};
   for(const dep of item.dependencies){
    const sheetId=snapshot.tables[dep.sheet].sheetId;
    const links=await tx.$queryRaw`SELECT target_id FROM dgc_import_links WHERE company_id=${companyId}::uuid AND source_spreadsheet_id=${SOURCE_ID} AND sheet_id=${sheetId} AND legacy_id=${dep.legacyId}`;
    if(links.length!==1)throw Error('Missing or ambiguous imported dependency '+dep.sheet+'/'+dep.legacyId);
    data[dep.field]=links[0].target_id;
   }
   const links=await tx.$queryRaw`SELECT * FROM dgc_import_links WHERE company_id=${companyId}::uuid AND source_spreadsheet_id=${SOURCE_ID} AND sheet_id=${item.sheetId} AND (source_row=${item.sourceRow} OR legacy_id=${item.legacyId})`;
   if(links.length){
    const link=links[0];
    if(links.length!==1||link.source_row!==item.sourceRow||link.legacy_id!==item.legacyId||link.row_hash!==item.rowHash||link.target_model!==item.model)throw Error('Source changed or moved; explicit mapping review required');
    const target=await tx[item.model].findFirst({where:{companyId,id:link.target_id}});
    if(!target||link.target_hash!==targetHash(target,data)||link.target_hash!==targetHash(cast(data),data))throw Error('Imported target or mapping changed; explicit review required');
    await decisionAudit(item,link.target_id);unchanged++;continue;
   }
   // An unlinked existing business key must not be adopted or overwritten by import.
   const lookup=item.model==='service'?{OR:[{serviceCode:data.serviceCode},{serviceKey:data.serviceKey}]}:item.model==='partner'?{OR:[{partnerCode:data.partnerCode},{partnerKey:data.partnerKey}]}:item.model==='contract'?{contractCode:data.contractCode}:{contractId:data.contractId,serviceId:data.serviceId};
   if(await tx[item.model].findFirst({where:{companyId,...lookup}}))throw Error('Existing target has no migration provenance; review required');
   const id=randomUUID(),target=await tx[item.model].create({data:{...cast(data),companyId,id}}),hash=targetHash(target,data);
   await tx.$executeRaw`INSERT INTO dgc_import_links(company_id,source_spreadsheet_id,sheet_id,source_row,legacy_id,row_hash,snapshot_hash,target_model,target_id,target_hash) VALUES(${companyId}::uuid,${SOURCE_ID},${item.sheetId},${item.sourceRow},${item.legacyId},${item.rowHash},${snapshot.snapshotHash},${item.model},${id}::uuid,${hash})`;
   await tx.auditLog.create({data:{companyId,action:'DGC_IMPORT_MASTER',entityType:item.model,entityId:id,newValue:{snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,decisionsHash:plan.decisionsHash,appliedDecisions:(resolutions?.decisions??[]).filter(d=>d.sheet===item.sheet&&d.sourceRow===item.sourceRow),sheetId:item.sheetId,sourceRow:item.sourceRow,legacyId:item.legacyId,rowHash:item.rowHash,targetHash:hash},reason:'Preserved source master data with explicit reviewed mappings; no financial posting'}});
   await decisionAudit(item,id);
   created++;
  }
  return {created,unchanged,scope,planHash:plan.planHash};
 },{timeout:60000});
}
