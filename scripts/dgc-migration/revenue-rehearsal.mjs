import {createRequire} from 'node:module';
import {SOURCE_ID,canonical,digest,masterPlan} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const models=['reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','dgcImportLink','auditLog'];
const counts=async db=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
const uuid=(company,kind,source)=>{const h=digest(['DGC_REVENUE_REHEARSAL',company,kind,source]);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const value=v=>v instanceof Date?v.toISOString():v?.toFixed?v.toFixed():v;
const hash=(row,data)=>digest(Object.fromEntries(Object.keys(data).map(k=>[k,value(row[k])])));
const identity=s=>s.sheetId+'|'+s.sourceRow;
function diffPaths(a,b,path='',found=[]){if(found.length>=4||canonical(a)===canonical(b))return found;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diffPaths(a[k],b[k],path+'.'+k,found);}else found.push(path);return found;}
class RollbackOnly extends Error{constructor(result){super('DGC rehearsal rollback');this.result=result;}}

async function staged(tx,snapshot,companyId){
 const found=await tx.dgcImportSnapshot.findUnique({where:{companyId_snapshotHash:{companyId,snapshotHash:snapshot.snapshotHash}}});
 const expected=new Map(Object.values(snapshot.tables).flatMap(t=>t.rows.map(r=>[t.sheetId+'|'+r.sourceRow,r])));
 if(!found||found.sourceSpreadsheetId!==SOURCE_ID||found.rowCount!==expected.size||canonical(found.sourceMetadata)!==canonical(snapshot.source))throw Error('Stage and verify the exact snapshot before rehearsal');
 const rows=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:snapshot.snapshotHash}});
 if(rows.length!==expected.size||rows.some(r=>{const e=expected.get(identity(r));return !e||r.legacyId!==e.legacyId||r.rowHash!==e.rowHash||canonical(r.payload)!==canonical(e);}))throw Error('Stored staging snapshot integrity mismatch');
}

async function masterResolver(tx,snapshot,companyId,decisions){
 const plan=masterPlan(snapshot,decisions),cache=new Map();
 async function resolve(source){
  if(!source)throw Error('Missing master source');const k=identity(source);if(cache.has(k))return cache.get(k);
  const item=plan.items.find(i=>i.sheetId===source.sheetId&&i.sourceRow===source.sourceRow&&i.rowHash===source.rowHash&&i.legacyId===source.legacyId);
  if(!item||plan.issues.some(i=>i.sheet===item.sheet&&i.sourceRow===item.sourceRow))throw Error('Unresolved master mapping');
  const links=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:item.sheetId,OR:[{sourceRow:item.sourceRow},{legacyId:item.legacyId}]}});
  const link=links[0];if(links.length!==1||link.sourceRow!==item.sourceRow||link.legacyId!==item.legacyId||link.rowHash!==item.rowHash||link.targetModel!==item.model)throw Error('Missing, stale or ambiguous master provenance');
  const data={...item.data};for(const dep of item.dependencies){const t=snapshot.tables[dep.sheet],rs=t.rows.filter(r=>r.legacyId===dep.legacyId);if(rs.length!==1)throw Error('Ambiguous master dependency');data[dep.field]=await resolve({sheetId:t.sheetId,...rs[0]});}
  const row=await tx[item.model].findFirst({where:{companyId,id:link.targetId}});
  const normalized=Object.fromEntries(Object.keys(data).map(k=>[k,row?.[k] instanceof Date?row[k].toISOString().slice(0,10):value(row?.[k])]));
  if(!row||digest(normalized)!==link.targetHash||digest(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)])))!==link.targetHash)throw Error('Imported master target or mapping changed');
  cache.set(k,link.targetId);return link.targetId;
 }
 return resolve;
}

async function materialize(tx,snapshot,companyId,plan,selected,resolve){
 let created=0,unchanged=0,groupsCreated=0;
 async function record(model,data,adopt){const old=await tx[model].findFirst({where:{companyId,id:data.id}});if(old){if(!adopt||hash(old,data)!==hash(data,data)){const fields=Object.keys(data).flatMap(k=>diffPaths(value(old[k]),value(data[k]),k));throw Error('Rehearsal target drift or unlinked existing record: '+model+' ['+fields.join(',')+']');}return old;}return tx[model].create({data});}
 for(const g of selected){
  const partnerId=await resolve(g.partnerSource),contractId=await resolve(g.contractSource),recId=uuid(companyId,'reconciliation',g.groupKey),start=new Date(g.period+'-01T00:00:00Z'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
  const sources=g.entries.map(e=>e.source),existingLinks=await tx.dgcImportLink.findMany({where:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:sources[0].sheetId,sourceRow:{in:sources.map(s=>s.sourceRow)}}});
  const allLinked=existingLinks.length===g.entries.length;
  if(existingLinks.length&&!allLinked)throw Error('Partial rehearsal provenance is not adoptable');
  if(!allLinked&&await tx.reconciliation.findFirst({where:{companyId,OR:[{id:recId},{reconCode:'DGC-TRIAL-'+g.groupKey.slice(0,24)}]}}))throw Error('Existing reconciliation has no complete rehearsal provenance');
  // Canonical strings protect raw spreadsheet serials/float representations
  // from Prisma JSON numeric serialization. Hash validation remains exact.
  const meta={sourceKind:'DGC_REHEARSAL_ONLY',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,groupKey:g.groupKey,filesVerified:false,sourceFileId:g.sourceFileId,documentJson:canonical(g.documentEvidence),sourceLifecycles:g.entries.map(e=>({source:e.source,status:e.sourceStatus,legacyReconciliationsJson:canonical(e.legacyReconciliations)})),noApprovalOrPosting:true};
  await record('reconciliation',{id:recId,companyId,reconCode:'DGC-TRIAL-'+g.groupKey.slice(0,24),logicalGroupId:uuid(companyId,'recon-group',g.groupKey),revisionNo:1,isCurrent:false,supersedesId:null,partnerId,contractId,periodType:'MONTHLY',periodStart:start,periodEnd:end,currency:g.currency,sourceType:'SYSTEM_IMPORT',sourceAttachmentId:null,sourceChecksum:null,sourceReportedTotal:null,ocrRawJson:meta,...g.managementHeader,totalWht:'0',status:'BLOCKED',createdById:null,approvedById:null,approvedAt:null,validatedById:null,validatedAt:null},allLinked);
  if(!allLinked)groupsCreated++;
  for(const [index,e] of g.entries.entries()){
   const s=e.source,serviceId=await resolve(e.bindings.Service_ID),parentServiceId=e.bindings.Parent_Service_ID?await resolve(e.bindings.Parent_Service_ID):null,itemId=uuid(companyId,'item',identity(s)),id=uuid(companyId,'revenue',identity(s)),scope=[partnerId,serviceId,g.period].join('|');
   const calc={dgc:true,sourceKind:'DGC_REHEARSAL_ONLY',filesVerified:false,snapshotHash:snapshot.snapshotHash,source:s,sourceStatus:e.sourceStatus,capturedRevenueJson:canonical(e.capturedRevenue),capturedManagement:e.capturedManagement,legacyReconciliationsJson:canonical(e.legacyReconciliations),legacyReconBases:e.legacyReconBases,rowType:e.aggregationMapping.rowType,includeInMonthlyTotal:e.aggregationMapping.includeInMonthlyTotal,parentServiceId,invoiceRevenueUsd:e.capturedInvoiceUsd.Invoice_Revenue_USD,invoiceWhtUsd:e.capturedInvoiceUsd.Invoice_WHT_USD,invoicePayableUsd:e.capturedInvoiceUsd.Invoice_Payable_USD,noApprovalOrPosting:true};
   const m=e.capturedManagement;
   await record('reconciliationItem',{id:itemId,companyId,reconciliationId:recId,serviceId,lineNo:index+1,businessScopeKey:scope,periodStart:start,periodEnd:end,isCurrent:false,grossRevenue:m.Gross_Revenue,partnerShareAmount:m.Partner_Share,companyShareAmount:m.Company_Share,taxAmount:m.Tax_Amount,whtAmount:'0',netRevenue:m.Company_Share,sourceRowReference:canonical(s),calculationJson:calc},allLinked);
   const data={id,companyId,revenueCode:s.legacyId,logicalGroupId:uuid(companyId,'revenue-group',identity(s)),revisionNo:1,isCurrent:false,supersedesId:null,reconciliationId:recId,reconciliationItemId:itemId,partnerId,contractId,serviceId,businessScopeKey:scope,periodType:'MONTHLY',periodStart:start,periodEnd:end,currency:g.currency,grossAmount:m.Gross_Revenue,partnerShareAmount:m.Partner_Share,companyShareAmount:m.Company_Share,taxAmount:m.Tax_Amount,whtAmount:'0',adjustmentAmount:'0',netAmount:m.Company_Share,calculationJson:calc,status:'BLOCKED'};
   const link=existingLinks.find(l=>l.sourceRow===s.sourceRow);
   if(link&&(link.rowHash!==s.rowHash||link.legacyId!==s.legacyId||link.targetModel!=='revenue'||link.targetId!==id||link.snapshotHash!==snapshot.snapshotHash||link.targetHash!==hash(data,data)))throw Error('Changed rehearsal source or target mapping');
   if(!link&&await tx.revenue.findFirst({where:{companyId,revenueCode:s.legacyId}}))throw Error('Existing revenue business key has no rehearsal provenance');
   const row=await record('revenue',data,Boolean(link));
   if(link){if(link.targetHash!==hash(row,data))throw Error('Rehearsal target drift');unchanged++;}
   else {await tx.dgcImportLink.create({data:{companyId,sourceSpreadsheetId:SOURCE_ID,sheetId:s.sheetId,sourceRow:s.sourceRow,legacyId:s.legacyId,rowHash:s.rowHash,snapshotHash:snapshot.snapshotHash,targetModel:'revenue',targetId:id,targetHash:hash(row,data)}});created++;}
  }
  if(!allLinked)await tx.auditLog.create({data:{companyId,action:'DGC_REHEARSE_REVENUE',entityType:'Reconciliation',entityId:recId,newValue:{snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,groupKey:g.groupKey,sourceRows:sources,filesVerified:false,status:'BLOCKED'},reason:'Rollback-only mapping trial; no financial import, approval, Invoice or cash posting'}});
 }
 return {groupsCreated,created,unchanged};
}

// Deliberately exposes no commit flag or committing import function. All trial
// records, provenance and audit are rolled back, even after successful replay.
export async function rehearseRevenue(prisma,snapshot,companyId,plan,groupKeys,expectedPlanHash,decisions){
 requireStaging(process.env.DATABASE_URL??'');verifyRevenueTargetPlan(plan,snapshot,decisions);
 if(plan.planHash!==expectedPlanHash)throw Error('Stale revenue target plan digest');
 if(!Array.isArray(groupKeys)||!groupKeys.length||new Set(groupKeys).size!==groupKeys.length)throw Error('Select complete, unique rehearsal groups');
 const selected=groupKeys.map(k=>plan.groups.find(g=>g.groupKey===k));
 if(selected.some(g=>!g||g.state!=='REHEARSABLE'))throw Error('Selected group is held or missing; no partial group import');
 let result;
 try {await prisma.$transaction(async tx=>{
  const actual=await tx.$queryRaw`SELECT current_database() AS name`;
  if(actual[0].name!==new URL(process.env.DATABASE_URL).pathname.slice(1))throw Error('Client database does not match dedicated staging URL');
  await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
  const c=await tx.company.findUnique({where:{id:companyId}});if(!c||c.companyCode!=='DGC'||await tx.company.count()!==1)throw Error('Rehearsal requires exactly one DGC tenant');
  await staged(tx,snapshot,companyId);const before=await counts(tx);
  const first=await materialize(tx,snapshot,companyId,plan,selected,await masterResolver(tx,snapshot,companyId,decisions));
  await staged(tx,snapshot,companyId);
  const replay=await materialize(tx,snapshot,companyId,plan,selected,await masterResolver(tx,snapshot,companyId,decisions)),inside=await counts(tx);
  if(replay.created||replay.groupsCreated||replay.unchanged!==selected.reduce((n,g)=>n+g.entries.length,0))throw Error('Rehearsal replay did not converge');
  for(const m of ['invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document'])if(inside[m]!==before[m])throw Error('Unexpected downstream effect during revenue rehearsal');
  const trialRows=await tx.revenue.findMany({where:{companyId,id:{in:selected.flatMap(g=>g.entries.map(e=>uuid(companyId,'revenue',identity(e.source))))}},orderBy:{revenueCode:'asc'}});
  const trialHeaders=await tx.reconciliation.findMany({where:{companyId,id:{in:selected.map(g=>uuid(companyId,'reconciliation',g.groupKey))}}});
  for(const row of trialRows){const captured=JSON.parse(row.calculationJson.capturedRevenueJson);if(captured.rowHash!==row.calculationJson.source.rowHash||digest({values:captured.values,cells:captured.cells})!==captured.rowHash)throw Error('Captured revenue evidence changed during database round trip');}
  const financialProof={revenues:trialRows.map(r=>({source:r.calculationJson.source,sourceStatus:r.calculationJson.sourceStatus,status:r.status,isCurrent:r.isCurrent,currency:r.currency,management:{gross:r.grossAmount.toFixed(),company:r.companyShareAmount.toFixed(),net:r.netAmount.toFixed()},invoiceUsd:{revenue:r.calculationJson.invoiceRevenueUsd,wht:r.calculationJson.invoiceWhtUsd,payable:r.calculationJson.invoicePayableUsd},rowType:r.calculationJson.rowType,includeInMonthlyTotal:r.calculationJson.includeInMonthlyTotal,parentServiceId:r.calculationJson.parentServiceId})),headers:trialHeaders.map(r=>({status:r.status,isCurrent:r.isCurrent,approvedById:r.approvedById,approvedAt:r.approvedAt,gross:r.totalGrossRevenue.toFixed(),company:r.totalCompanyShare.toFixed(),net:r.totalNetRevenue.toFixed()}))};
  throw new RollbackOnly({mode:'ROLLBACK_ONLY',postingAllowed:false,acceptance:false,filesVerified:false,sourceCaptureVerified:true,snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,groups:groupKeys,first,replay,before,inside,financialProof});
 },{isolationLevel:'Serializable',timeout:120000});throw Error('Rehearsal unexpectedly committed');
 }catch(e){if(!(e instanceof RollbackOnly))throw e;result=e.result;}
 const after=await counts(prisma);if(canonical(result.before)!==canonical(after))throw Error('Rehearsal rollback footprint differs; inspect isolated staging database');
 return {...result,after,rolledBack:true};
}
