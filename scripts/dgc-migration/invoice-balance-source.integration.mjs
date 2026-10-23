import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {canonical} from './core.mjs';
import {requireStaging} from './staging.mjs';
import {invoiceBalancePlan,invoiceBalanceReview} from './invoice-balance.mjs';
import {rehearseInvoiceBalance} from './invoice-rehearsal.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {readHistoricalInvoiceAmounts,historicalInvoiceTrialHash} from '../../apps/api/dist/modules/projects/historical-invoice-amounts.js';
requireStaging(process.env.DATABASE_URL??'');if(new URL(process.env.DATABASE_URL).pathname!=='/dgc_migration_staging_invoice_balance_source_synthetic')throw Error('Dedicated local host clone required');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient(),base='artifacts/dgc-migration/',out=base+'20261023/invoice-balancing/';
const json=async p=>JSON.parse(await readFile(p,'utf8')),models=['user','userRole','authSession','approvalRequest','reconciliation','reconciliationItem','revenue','invoice','invoiceScope','invoiceScopeItem','accountReceivable','invoicePayment','inputReconciliation','accountPayable','cashAccount','cashEntry','cashHistory','cashTransfer','attachment','document','invoiceDocumentLink','dgcImportRow','dgcImportLink','auditLog'];
const counts=async tx=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await tx[m].count()])));let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
try{await withSourcePlanningCache(async()=>{
 const p=base+'20261023/owner-financial-decisions/refreshed/',snapshot=await json(base+'20261019/prepared/snapshot.json'),targetPlan=await json(p+'revenue-target-plan.json'),combined=await json(p+'combined-review.json'),manifest=await json(base+'20261020/source-invoices/all-invoices-manifest.json'),decisions=await json(base+'20261023/owner-financial-decisions/owner-decisions.json');
 const c=await db.company.findFirstOrThrow({where:{companyCode:'DGC'}}),before=await counts(db),links=await db.dgcImportLink.findMany({orderBy:[{sheetId:'asc'},{sourceRow:'asc'}]});eq(links.length,37);eq(await db.dgcImportRow.count({where:{snapshotHash:snapshot.snapshotHash}}),3154);for(const m of ['revenue','invoice','accountReceivable','invoicePayment','cashEntry'])eq(before[m],0);
 const o={invoiceOptions:{snapshot,targetPlan,combined,reviewPin:combined.reviewHash,manifest,manifestPin:manifest.manifestHash,decisions,restorePlan:await json(p+'invoice-restore-plan.json'),root:resolve(base+'20261020/source-invoices'),companyId:c.id},rounding:await json(p+'donor-rounding-review.json'),exceptionPlan:await json(p+'rounding-exceptions.json'),reconManifest:await json(base+'20261021/source-recons/recon-files-manifest.json'),reconRoot:resolve(base+'20261021/source-recons'),sourceRows:[79]};
 o.roundingPin=o.rounding.reviewHash;o.reconManifestPin=o.reconManifest.manifestHash;o.balancePlan=invoiceBalancePlan(o);
 eq(o.balancePlan.entries.filter(e=>e.state==='INVOICE_GROUP_BALANCE_SHAPE_CANDIDATE').map(e=>e.source.sourceRow),[79]);eq(o.invoiceOptions.restorePlan.entries.find(e=>e.source.sourceRow===79).state,'RESTORE_HELD');eq(o.balancePlan.entries.find(e=>e.source.sourceRow===57).state,'INVOICE_GROUP_BALANCE_SHAPE_HELD');
 let reads=0;const facade=new Proxy(db,{get(t,k){if(k==='$transaction')return async(fn,options)=>t.$transaction(async tx=>{try{return await fn(tx);}catch(e){if(e.message==='DGC Invoice trial rollback'){
  const row=await tx.invoice.findFirstOrThrow({where:{companyId:c.id}}),read=()=>readHistoricalInvoiceAmounts(tx,c.id,row.id,snapshot.snapshotHash),r=await read(),s=snapshot.tables['48_INVOICE_HEADER'].rows.find(s=>s.sourceRow===79);reads++;
  eq(r.components,{revenue:String(s.values.Total_Revenue_USD),wht:String(s.values.Total_WHT_USD),payable:String(s.values.Total_Payable_USD)});eq(r.sourceRevenueRowsRead,4);eq(r.scopeItems,1);eq(r.roundingException.lines.map(l=>l.identityDelta),['-0.01','0','0.01']);eq(r.roundingException.lines.map(l=>l.source.sourceRow),[320,321,322]);eq(r.roundingException.format,'DGC_CAPTURED_INVOICE_ROUNDING_V4');eq(r.operationalUseAllowed,false);eq(r.historicalCashPosting,false);
  for(const mutate of [j=>{j.roundingException.lines[2].sourceComponents.revenue='0';},j=>{j.roundingException.sourceRevenueSet.pop();},j=>{j.roundingException.balanceReviewHash='wrong';}]){
   const changed=structuredClone(row.snapshot);mutate(changed);await tx.invoice.update({where:{id:row.id},data:{snapshot:changed}});await tx.dgcImportLink.updateMany({where:{companyId:c.id,targetId:row.id},data:{targetHash:historicalInvoiceTrialHash({...row,snapshot:changed})}});await assert.rejects(read,e=>e.statusCode===409);n++;
  }
  await tx.invoice.update({where:{id:row.id},data:{snapshot:row.snapshot}});await tx.dgcImportLink.updateMany({where:{companyId:c.id,targetId:row.id},data:{targetHash:historicalInvoiceTrialHash(row)}});eq((await read()).components,r.components);
 }throw e;}},options);const v=t[k];return typeof v==='function'?v.bind(t):v;}});
 const result=await rehearseInvoiceBalance(facade,o);eq(reads,1);eq(result.first,{created:1,unchanged:0});eq(result.replay,{created:0,unchanged:1});eq(result.revenueRehearsal.first,{groupsCreated:1,created:4,unchanged:0});eq(result.rolledBack,true);eq(result.before,result.after);eq(await counts(db),before);eq(canonical(await db.dgcImportLink.findMany({orderBy:[{sheetId:'asc'},{sourceRow:'asc'}]})),canonical(links));eq(result.reconFilesReverified,true);eq(result.paymentRowsRestored,false);
 const review=invoiceBalanceReview(snapshot,targetPlan,combined,combined.reviewHash,decisions),proof={format:'dgc-invoice-group-balance-source-proof-v1',snapshotHash:snapshot.snapshotHash,balancePlanHash:o.balancePlan.planHash,assertions:n,sourceRows:[79],readRows:4,trial:result.first,replay:result.replay,rollbackVerified:true,masterLinksPreserved:37,financialRowsCommitted:0,remoteChanged:false,historicalCashPosting:false};
 await mkdir(out,{recursive:true});for(const [name,v] of [['review.json',review],['plan.json',o.balancePlan],['proof-'+Date.now()+'.json',{...proof,result}]])await writeFile(out+name,JSON.stringify(v,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(proof));
});}finally{await db.$disconnect();}
