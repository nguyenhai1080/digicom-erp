// Transfer/recovery checks only: never imports, recalculates or changes records.
// Baseline: DGC backup 2026-11-06 08:39 Vietnam, after October archive. Later
// real work needs a new recovery baseline; do not weaken counts to bless it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {canonical,digest} from '../packages/db/prisma/dgc-master-core.mjs';
import {capturedId} from '../packages/db/prisma/dgc-captured-book.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.replace(/^--/,''),all[i+1]]],[]));
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/dgc_migration_staging_restore_\d{8}$/.test(url.pathname))throw Error('Dedicated LOCAL restored database required');
const privateRoot=await realpath('artifacts'),storage=await realpath(args.storage),out=resolve(args.out);
for(const path of [storage,out]){const rel=relative(privateRoot,path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/')))throw Error('Private artifacts paths required');}
const {PrismaClient,Prisma}=createRequire(new URL('../packages/db/package.json',import.meta.url))('@prisma/client'),p=new PrismaClient();
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},truth=v=>{assert.ok(v);checks++;};
const hashFile=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
async function fingerprints(tx){
 const tables=await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
 const result={};for(const {tablename:t} of tables){if(!/^[a-z_]+$/.test(t))throw Error('Unexpected table identifier');const [r]=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count, encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS hash FROM public."${t}" t`);result[t]=r;}return result;
}
try{
 const proof=await p.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const [db]=await tx.$queryRaw`SELECT current_database() AS name, current_setting('transaction_read_only') AS readonly`;
  eq(db.name,url.pathname.slice(1));eq(db.readonly,'on');
  const before=await fingerprints(tx),c=await tx.company.findFirstOrThrow();
  eq(await tx.company.count(),1);eq(c.companyCode,'DGC');eq(c.defaultCurrency,'USD');eq(c.timezone,'Asia/Ho_Chi_Minh');
  const expected={service:10,partner:4,contract:9,contractService:14,revenue:417,invoice:66,accountReceivable:53,invoicePayment:51,inputReconciliation:3,accountPayable:0,cashAccount:0,cashEntry:0,cashHistory:0,cashTransfer:0,statementOfAccount:0,attachment:460,document:458};
  const counts={};for(const [model,n] of Object.entries(expected)){counts[model]=await tx[model].count();eq(counts[model],n);eq(await tx[model].count({where:{companyId:{not:c.id}}}),0);}
  eq(await tx.user.count(),4);eq(await tx.user.count({where:{companyId:c.id,status:'ACTIVE'}}),4);
  const receipts=await tx.auditLog.findMany({where:{companyId:c.id,action:'DGC_CAPTURED_BOOK_TRANSFER'}});eq(receipts.length,1);
  const receipt=receipts[0].newValue;eq(receipt.counts,{archive:37,invoice:66,receipt:51,revenue:417,inputRecon:3,receivable:53,sourceRows:3243,sourceReferenceDocuments:82});eq(receipt.sourceValuesPreserved,true);eq(receipt.historicalCashPosting,false);
  const snapshots=await tx.dgcImportSnapshot.findMany();eq(snapshots.length,3);
  // Report source-payload drift explicitly. A successful pg_restore does not
  // establish that the earlier import encoded every JSON float exactly.
  let sourceRows=0,sourcePayloadHashMatches=0;const sourcePayloadHashMismatches=[];
  for(const s of snapshots){const rows=await tx.dgcImportRow.findMany({where:{companyId:c.id,snapshotHash:s.snapshotHash}});eq(rows.length,s.rowCount);sourceRows+=rows.length;for(const r of rows){eq(r.rowHash,r.payload.rowHash);const actual=digest({values:r.payload.values,cells:r.payload.cells});if(actual===r.rowHash)sourcePayloadHashMatches++;else sourcePayloadHashMismatches.push({snapshotHash:s.snapshotHash,sheet:r.sheetName,sourceRow:r.sourceRow,expected:r.rowHash,actual});}}
  eq(sourceRows,3280);eq(await tx.dgcImportRow.count(),sourceRows);
  const appendix=JSON.parse(await readFile(args.appendix,'utf8')),{appendixHash,...appendixBody}=appendix;
  eq(digest(appendixBody),appendixHash);eq(appendixHash,receipt.sourceAppendixHash);eq(appendix.rows.length,89);
  for(const r of appendix.rows)eq(digest({values:r.payload.values,cells:r.payload.cells}),r.payload.rowHash);
  const book=JSON.parse(await readFile(args.book,'utf8')),{bundleHash,...bookBody}=book;
  eq(digest(bookBody),bundleHash);eq(bundleHash,receipts[0].traceId);
  const decimalFields=Object.fromEntries(Prisma.dmmf.datamodel.models.map(m=>[m.name[0].toLowerCase()+m.name.slice(1),m.fields.filter(f=>f.type==='Decimal').map(f=>f.name)]));
  let moneyValuesVerified=0;
  for(const op of book.operations.filter(op=>['revenue','invoice','accountReceivable','invoicePayment','inputReconciliation'].includes(op.model))){const stored=await tx[op.model].findUniqueOrThrow({where:{id:capturedId(c.id,op.key)}});eq(stored.companyId,c.id);for(const field of decimalFields[op.model])if(op.data[field]!==undefined){const expected=op.data[field];if(expected===null)eq(stored[field],null);else eq(new Prisma.Decimal(stored[field]).eq(expected),true);moneyValuesVerified++;}}
  const links=await tx.dgcImportLink.findMany();let masters=0;
  for(const l of links){truth(['service','partner','contract','contractService','revenue','invoice','accountReceivable','invoicePayment','inputReconciliation','document'].includes(l.targetModel));eq(l.companyId,c.id);eq(await tx[l.targetModel].count({where:{id:l.targetId,companyId:c.id}}),1);const row=await tx.dgcImportRow.findUniqueOrThrow({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId:c.id,snapshotHash:l.snapshotHash,sheetId:l.sheetId,sourceRow:l.sourceRow}}});eq(row.rowHash,l.rowHash);eq(row.legacyId,l.legacyId);if(['service','partner','contract','contractService'].includes(l.targetModel))masters++;}
  eq(masters,37);
  const history=JSON.parse((await tx.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId:c.id,configKey:'DGC_CAPTURED_BOOK_HISTORY'}}})).configValue);eq(history.archives.length,37);eq(history.bundleHash,receipts[0].traceId);
  const archived=JSON.parse((await tx.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId:c.id,configKey:'DGC_PERIOD_RESTART:2026-10'}}})).configValue);
  eq(archived.format,'dgc-period-restart-v1');eq(archived.period,'2026-10');eq(archived.counts,{revenues:8,invoices:8,reconciliations:5,documents:18});
  eq(createHash('sha256').update(JSON.stringify(archived.graph)).digest('hex'),archived.graphHash);
  eq(await tx.auditLog.count({where:{companyId:c.id,action:'DGC_OCTOBER_RESTART',traceId:archived.archiveId}}),1);
  eq(await tx.invoice.count({where:{companyId:c.id,period:'2026-10',isCurrent:true}}),0);
  eq(await tx.revenue.count({where:{companyId:c.id,periodStart:new Date('2026-10-01'),isCurrent:true}}),0);
  const inputs=await tx.inputReconciliation.findMany({orderBy:{inputReconCode:'asc'}});eq(inputs.map(r=>r.status),['GENERATED','GENERATED','GENERATED']);eq(inputs.map(r=>r.documentId),[null,null,null]);eq(inputs.map(r=>r.payableAmount.toFixed(2)),['74820375.00','21879638.00','5846925.00']);
  eq(await tx.invoicePayment.count({where:{cashAccountId:{not:null}}}),0);
  const ars=await tx.accountReceivable.findMany({where:{companyId:c.id,invoice:{isCurrent:true,status:{in:['ISSUED','PARTIALLY_PAID','PAID']}}},include:{invoice:true}}),open=ars.filter(r=>r.outstandingAmount.gt(0));
  eq(open.length,8);eq(open.map(r=>r.invoice.currency).every(v=>v==='USD'),true);eq(open.reduce((s,r)=>s.plus(r.outstandingAmount),new Prisma.Decimal(0)).toFixed(2),'25328.54');
  for(const [code,n] of [['DGC_MANAGER',38],['DGC_BOD',48],['DGC_ACCOUNTANT',24]]){const r=await tx.role.findUniqueOrThrow({where:{companyId_code:{companyId:c.id,code}}});eq(await tx.rolePermission.count({where:{roleId:r.id}}),n);}
  const migrations=await tx.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;eq(migrations[0].count,28);
  const invalid=await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated`;eq(invalid[0].count,0);
  const attachments=await tx.attachment.findMany({orderBy:{id:'asc'}}),verified=[];
  for(const a of attachments){eq(a.storageProvider,'local');truth(a.checksumSha256&&a.fileSize!==null);const path=resolve(storage,a.storagePath),rel=relative(storage,path);truth(rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/')));const stat=await lstat(path);truth(stat.isFile()&&!stat.isSymbolicLink());eq(BigInt(stat.size),a.fileSize);eq(await hashFile(path),a.checksumSha256);verified.push({id:a.id,path:a.storagePath,sha256:a.checksumSha256,bytes:stat.size});}
  const documents=await tx.document.findMany({include:{attachment:true}});for(const d of documents){eq(d.companyId,c.id);eq(d.attachment.companyId,c.id);}
  const assets=documents.filter(d=>d.entityType==='CompanyAsset'&&d.status==='ACTIVE');for(const kind of ['COMPANY_LOGO','COMPANY_STAMP','SIGNATURE','SIGNER_TITLE_NAME','SIGNING_COMPOSITE'])eq(assets.filter(d=>d.documentType===kind).length,1);
  const after=await fingerprints(tx);eq(after,before);
  return {format:'dgc-post-cutover-restore-proof-v1',database:db.name,readOnly:true,counts,sourceRows,masterLinks:masters,allSourcePayloadHashesVerified:sourcePayloadHashMismatches.length===0,sourcePayloadHashMatches,sourcePayloadHashMismatches,originalAppendixHash:appendixHash,originalAppendixRowsVerified:89,originalBookHash:bundleHash,moneyValuesVerified,attachmentsVerified:verified.length,attachmentBytes:verified.reduce((s,a)=>s+a.bytes,0),documentsVerified:documents.length,openAr:{invoices:8,currency:'USD',outstanding:'25328.54'},octoberArchive:{graphHash:archived.graphHash,counts:archived.counts,currentInvoices:0,currentRevenues:0},allTables:before,tableFingerprintsUnchanged:true,sourceMoneyRecalculated:false,remoteChanged:false,usersImpersonated:false};
 },{isolationLevel:'RepeatableRead',timeout:180000});
 proof.checks=checks;await writeFile(out,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:proof.allSourcePayloadHashesVerified?'VERIFIED':'RESTORED_WITH_SOURCE_PAYLOAD_WARNING',checks,attachmentsVerified:proof.attachmentsVerified,documentsVerified:proof.documentsVerified,sourceRows:proof.sourceRows,sourcePayloadHashMismatches:proof.sourcePayloadHashMismatches.length,allSourcePayloadHashesVerified:proof.allSourcePayloadHashesVerified,moneyValuesVerified:proof.moneyValuesVerified,openAr:proof.openAr,readOnly:true,remoteChanged:false}));
 // Do not let automation mistake a restored, already-drifted payload for clean
 // original-source integrity. Keep the report and return a distinct warning.
 if(!proof.allSourcePayloadHashesVerified)process.exitCode=2;
}finally{await p.$disconnect();}

