import {verifySnapshot,masterPlan,canonical,digest,sourceDate,SOURCE_ID} from './dgc-master-core.mjs';
import {masterResolver} from './dgc-master-resolver.mjs';
const models=['reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','user','userRole','authSession','approvalRequest','dgcImportLink'];
const counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));
const hex=/^[a-f0-9]{64}$/;
export function evidenceBundle(snapshot,decisions){verifySnapshot(snapshot);const plan=masterPlan(snapshot,decisions);if(!plan.ready||plan.items.length!==37)throw Error('Reviewed DGC masters required');const bundle={format:'dgc-source-evidence-transfer-v1',snapshot,decisions,sourceValuesChanged:false,financialPosting:false};return {bundle,bundleHash:digest(bundle)};}
export function verifyEvidenceBundle(bundle,pin){
 if(!hex.test(pin??'')||!bundle||bundle.format!=='dgc-source-evidence-transfer-v1'||bundle.sourceValuesChanged!==false||bundle.financialPosting!==false||digest(bundle)!==pin)throw Error('Unpinned source evidence bundle');
 verifySnapshot(bundle.snapshot);const p=masterPlan(bundle.snapshot,bundle.decisions);if(!p.ready||p.items.length!==37)throw Error('Reviewed source master mapping required');return p;
}
// Separate raw-evidence transfer. Never calls staging.applyMasters, a financial
// writer, donor function or cash sync. The API owns target/actor/CSRF/HMAC gates.
export async function transferEvidence(tx,bundle,{expectedBundleHash,expectedDatabase,companyId,operatorId,reason}){
 const plan=verifyEvidenceBundle(bundle,expectedBundleHash),snapshot=bundle.snapshot;
 if(expectedDatabase!=='dgc_erp_db'&&!/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(expectedDatabase??''))throw Error('Dedicated DGC database required');
 if(typeof reason!=='string'||reason.trim().length<10||reason.length>500)throw Error('Explicit evidence transfer reason required');
 const actual=await tx.$queryRaw`SELECT current_database() AS name`;if(actual[0].name!==expectedDatabase)throw Error('Evidence client target differs');
 const company=await tx.company.findUniqueOrThrow({where:{id:companyId}});if(company.companyCode!=='DGC'||company.defaultCurrency!=='USD'||company.timezone!=='Asia/Ho_Chi_Minh'||await tx.company.count()!==1)throw Error('Exactly one DGC USD/Vietnam tenant required');
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`;
 const actor=await tx.user.findFirst({where:{id:operatorId,companyId,status:'ACTIVE',roles:{some:{role:{companyId,code:'ADMIN',status:'ACTIVE'}}}}});if(!actor)throw Error('Active DGC admin operator required');
 const before=await counts(tx),resolve=await masterResolver(tx,snapshot,companyId,bundle.decisions);for(const item of plan.items)await resolve(item,item.model);
 const links=await tx.dgcImportLink.count({where:{companyId,sourceSpreadsheetId:SOURCE_ID,targetModel:{in:['service','partner','contract','contractService']}}});if(links!==37)throw Error('Exact reviewed DGC master provenance required');
 const rows=Object.entries(snapshot.tables).flatMap(([sheet,t])=>t.rows.map(r=>({companyId,snapshotHash:snapshot.snapshotHash,sheetId:t.sheetId,sheetName:sheet,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash,payload:r}))),where={companyId_snapshotHash:{companyId,snapshotHash:snapshot.snapshotHash}},old=await tx.dgcImportSnapshot.findUnique({where});
 const invoiceSources=rows.filter(r=>r.sheetName==='48_INVOICE_HEADER').map(r=>({sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash})),rowManifestHash=digest(rows.map(r=>({sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash})));
 const audits=await tx.auditLog.findMany({where:{companyId,traceId:expectedBundleHash,action:'DGC_SOURCE_EVIDENCE_TRANSFER'}});let created=false;
 if(old){if(old.sourceSpreadsheetId!==SOURCE_ID||old.rowCount!==rows.length||canonical(old.sourceMetadata)!==canonical(snapshot.source)||audits.length!==1||audits[0].newValue?.sourceSnapshotHash!==snapshot.snapshotHash||audits[0].newValue?.bundleHash!==expectedBundleHash||audits[0].newValue?.rows!==rows.length||audits[0].newValue?.rowManifestHash!==rowManifestHash||canonical(audits[0].newValue?.invoiceSources)!==canonical(invoiceSources))throw Error('Existing evidence lacks exact transfer receipt');}
 else{
  if(audits.length||await tx.dgcImportRow.count({where:{companyId,snapshotHash:snapshot.snapshotHash}}))throw Error('Partial evidence transfer cannot be adopted');
  await tx.dgcImportSnapshot.create({data:{companyId,snapshotHash:snapshot.snapshotHash,sourceSpreadsheetId:SOURCE_ID,sourceMetadata:snapshot.source,rowCount:rows.length}});
  // Serialize captured floats as JSON text before Prisma's JSON parameter
  // conversion; that conversion can change the last digit of source serials.
  for(let n=0;n<rows.length;n+=100){
   const batch=rows.slice(n,n+100).map(r=>({sheet_id:r.sheetId,sheet_name:r.sheetName,source_row:r.sourceRow,legacy_id:r.legacyId,row_hash:r.rowHash,payload:r.payload}));
   await tx.$executeRaw`INSERT INTO dgc_import_rows(company_id,snapshot_hash,sheet_id,sheet_name,source_row,legacy_id,row_hash,payload) SELECT ${companyId}::uuid,${snapshot.snapshotHash},x.sheet_id,x.sheet_name,x.source_row,x.legacy_id,x.row_hash,x.payload FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(sheet_id integer,sheet_name text,source_row integer,legacy_id text,row_hash text,payload jsonb)`;
  }
  await tx.auditLog.create({data:{companyId,userId:operatorId,action:'DGC_SOURCE_EVIDENCE_TRANSFER',entityType:'DgcImportSnapshot',newValue:{bundleHash:expectedBundleHash,sourceSnapshotHash:snapshot.snapshotHash,rows:rows.length,tables:Object.keys(snapshot.tables).length,masterLinksVerified:37,rowManifestHash,invoiceSources,sourceValuesChanged:false,financialPosting:false},reason,traceId:expectedBundleHash}});created=true;
 }
 const stored=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:snapshot.snapshotHash}}),expected=new Map(rows.map(r=>[r.sheetId+'|'+r.sourceRow,r]));
 if(stored.length!==rows.length||stored.some(r=>{const e=expected.get(r.sheetId+'|'+r.sourceRow);return !e||r.sheetName!==e.sheetName||r.legacyId!==e.legacyId||r.rowHash!==e.rowHash||canonical(r.payload)!==canonical(e.payload);}))throw Error('Transferred raw source differs from pinned snapshot');
 const after=await counts(tx);if(canonical(after)!==canonical(before))throw Error('Source evidence transfer changed operational records');
 return {bundleHash:expectedBundleHash,sourceSnapshotHash:snapshot.snapshotHash,sourceRows:rows.length,tables:Object.entries(snapshot.tables).map(([sheet,t])=>({sheet,rows:t.rows.length})),masterLinksVerified:37,created,replay:!created,sourceValuesChanged:false,financialPosting:false,financialRecordsCreated:0};
}

export function invoiceEvidenceRows(stored,receipt){
 const pins=receipt.invoiceSources;if(!Array.isArray(pins)||pins.length>1000||stored.length!==pins.length)throw Error('Invoice source coverage incomplete');
 return stored.map(r=>{
  const p=r.payload,pin=pins.find(p=>p.sourceRow===r.sourceRow);if(!pin||r.snapshotHash!==receipt.sourceSnapshotHash||r.sheetName!=='48_INVOICE_HEADER'||r.legacyId!==pin.legacyId||r.rowHash!==pin.rowHash||p?.sourceRow!==r.sourceRow||p?.legacyId!==r.legacyId||p?.rowHash!==r.rowHash||digest({values:p.values,cells:p.cells})!==r.rowHash)throw Error('Invoice source fingerprint differs');
  const v=p.values,text=f=>v[f]===null||v[f]===undefined?'':String(v[f]),date=f=>sourceDate(p,f);
  return {sourceRow:r.sourceRow,invoiceNumber:text('Invoice_Number'),partnerKey:text('Partner_ID'),sourceStatus:text('Status'),revision:text('Revision_No'),currency:text('Currency'),invoiceDate:date('Invoice_Date'),period:(date('Revenue_Month')??'').slice(0,7),revenue:text('Total_Revenue_USD'),wht:text('Total_WHT_USD'),payable:text('Total_Payable_USD'),paid:text('Paid_Amount_USD'),outstanding:text('Outstanding_Amount_USD')};
 }).sort((a,b)=>a.sourceRow-b.sourceRow);
}
