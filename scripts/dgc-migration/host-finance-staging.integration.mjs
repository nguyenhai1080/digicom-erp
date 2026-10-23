import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {stageSnapshot,requireStaging} from './staging.mjs';
import {masterResolver} from './revenue-rehearsal.mjs';
import {rehearseInvoiceRestore} from './invoice-rehearsal.mjs';
import {canonical} from './core.mjs';
requireStaging(process.env.DATABASE_URL??'');
if(new URL(process.env.DATABASE_URL).pathname!=='/dgc_migration_staging_host_finance_synthetic')throw Error('Dedicated local host-finance clone required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient();
const read=async p=>JSON.parse(await readFile(p,'utf8')),base='artifacts/dgc-migration/',dir=base+'20261023/owner-financial-decisions/';
let assertions=0;const eq=(a,b)=>{assert.deepEqual(a,b);assertions++;},reject=async(f,p)=>{await assert.rejects(f,p);assertions++;};
const models=['service','partner','contract','contractService','user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','accountPayable','inputReconciliation','cashAccount','cashEntry','cashTransfer','cashHistory','document','attachment','invoiceDocumentLink','dgcImportLink','dgcImportRow','dgcImportSnapshot','auditLog'];
const footprint=async()=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])));
try{
 const c=await db.company.findUniqueOrThrow({where:{companyCode:'DGC'}});eq(await db.company.count(),1);eq(c.timezone,'Asia/Ho_Chi_Minh');
 const snapshot=await read(base+'20261019/prepared/snapshot.json'),decisions=await read(dir+'owner-decisions.json'),targetPlan=await read(dir+'refreshed/revenue-target-plan.json'),combined=await read(dir+'refreshed/combined-review.json'),restorePlan=await read(dir+'refreshed/invoice-restore-plan.json'),manifest=await read(base+'20261020/source-invoices/all-invoices-manifest.json');
 const masterLinks=await db.dgcImportLink.findMany({orderBy:[{sheetId:'asc'},{sourceRow:'asc'}]});eq(masterLinks.length,37);eq(new Set(masterLinks.map(l=>l.snapshotHash)).size,1);eq(masterLinks.some(l=>l.snapshotHash===snapshot.snapshotHash),false);
 for(const m of ['revenue','invoice','accountReceivable','invoicePayment','accountPayable','cashEntry','cashAccount'])eq(await db[m].count(),0);
 const staged=await stageSnapshot(db,snapshot,c.id);eq(staged.rows,3154);eq((await stageSnapshot(db,snapshot,c.id)).created,false);
 const source={sheetId:snapshot.tables['21_DM_PARTNER'].sheetId,...snapshot.tables['21_DM_PARTNER'].rows[0]},resolver=await masterResolver(db,snapshot,c.id,decisions);eq(typeof await resolver(source,'partner'),'string');await reject(()=>resolver(source,'contract'),/mapping/);
 // Corrupt read results rather than mutate immutable raw evidence in the DB.
 const corrupt=(model,method,mutate)=>new Proxy(db,{get(target,prop){if(prop===model)return new Proxy(target[prop],{get(t,k){if(k===method)return async(...args)=>mutate(structuredClone(await t[k](...args)));const v=t[k];return typeof v==='function'?v.bind(t):v;}});const v=target[prop];return typeof v==='function'?v.bind(target):v;}});
 for(const mutate of [m=>(m.sourceMetadata.sourceSnapshotHash='0'.repeat(64),m),m=>(m.sourceMetadata.masterOnly=false,m),m=>(m.sourceMetadata.planHash='0'.repeat(64),m),m=>(m.sourceMetadata.decisionsHash='0'.repeat(64),m),m=>(m.rowCount++,m)])await reject(async()=>{const r=await masterResolver(corrupt('dgcImportSnapshot','findUnique',mutate),snapshot,c.id,decisions);await r(source,'partner');},/manifest/);
 await reject(async()=>{const r=await masterResolver(corrupt('dgcImportRow','findUnique',m=>(m.payload.values.Status='Changed',m)),snapshot,c.id,decisions);await r(source,'partner');},/raw evidence/);
 const before=await footprint(),sourceRows=restorePlan.entries.filter(e=>e.sourceStatus==='Issued'&&e.state==='CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL').map(e=>e.source.sourceRow);eq(sourceRows,[78,80,81,82]);
 const trial=await rehearseInvoiceRestore(db,{snapshot,targetPlan,combined,reviewPin:combined.reviewHash,manifest,manifestPin:manifest.manifestHash,decisions,restorePlan,sourceRows,root:resolve(base+'20261020/source-invoices'),companyId:c.id});
 eq(trial.first.created,4);eq(trial.replay.created,0);eq(trial.replay.unchanged,4);eq(trial.rolledBack,true);eq(trial.historicalCashPosting,false);eq(trial.paymentRowsRestored,false);eq(trial.proof.length,4);
 for(const p of trial.proof){eq(p.isCurrent,false);eq(p.status,'CANCELLED');eq(p.paid,'0');const header=snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===p.source.sourceRow);eq(p.payable,String(header.values.Total_Payable_USD));}
 eq(await footprint(),before);eq(canonical(await db.dgcImportLink.findMany({orderBy:[{sheetId:'asc'},{sourceRow:'asc'}]})),canonical(masterLinks));
 const proof={format:'dgc-host-finance-staging-proof-v1',snapshotHash:snapshot.snapshotHash,masterTransferHash:masterLinks[0].snapshotHash,masterLinks:37,stagedRows:3154,assertions,invoiceSourceRows:sourceRows,invoiceTrial:trial.first,invoiceReplay:trial.replay,rollbackVerified:true,financialRowsCommitted:0,remoteChanged:false,sourceDecisionsRebased:false,cashPosting:false};
 await writeFile(base+'20261023/owner-financial-decisions/host-finance-staging-proof-'+Date.now()+'.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
}finally{await db.$disconnect();}
