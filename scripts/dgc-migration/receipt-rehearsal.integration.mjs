import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {requireStaging} from './staging.mjs';
import {receiptTargetPlan} from './receipt-target.mjs';
import {rehearseSourceReceipts} from './receipt-rehearsal.mjs';
requireStaging(process.env.DATABASE_URL??'');if(!/^\/dgc_migration_staging_receipt_source(?:_v[0-9]+)?_synthetic$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Dedicated local source receipt clone required');
const {PrismaClient,Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),db=new PrismaClient(),read=async p=>JSON.parse(await readFile(p,'utf8'));
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
try{
 const snapshot=await read('artifacts/dgc-migration/20261019/prepared/snapshot.json'),decisions=await read('artifacts/dgc-migration/20261023/owner-financial-decisions/owner-decisions.json'),plan=receiptTargetPlan(snapshot,decisions),company=await db.company.findUniqueOrThrow({where:{companyCode:'DGC'}});
 eq(plan.entries.length,51);eq(plan.parents.length,45);eq(plan.entries.filter(e=>e.ledgerBalanceBound).length,51);
 const manifest=await read('artifacts/dgc-migration/20261020/source-invoices/all-invoices-manifest.json');
 const result=await rehearseSourceReceipts(db,{snapshot,decisions,plan,companyId:company.id,manifest,manifestPin:manifest.manifestHash,invoiceRoot:resolve('artifacts/dgc-migration/20261020/source-invoices'),verify:async(tx,{receipts,actorId})=>{
  eq(receipts.filter(r=>!r.paidVnd.isInteger()).length,4);eq(receipts.filter(r=>r.fxRate.decimalPlaces()>4).length,17);eq(receipts.every(r=>r.approvedById===null&&r.cashAccountId===null),true);
  for(const p of plan.parents){const id=receipts.find(r=>r.historicalSource.invoiceSource.sourceRow===p.source.sourceRow).invoiceId,all=receipts.filter(r=>r.invoiceId===id),sum=all.reduce((s,r)=>s.plus(r.allocationAmount),new Prisma.Decimal(0));eq(sum.toFixed(),String(JSON.parse(p.capturedHeaderJson).values.Paid_Amount_USD));}
  const receipt=receipts[0],base={...receipt,id:randomUUID(),requestId:randomUUID()};delete base.createdAt;
  async function denied(run,pattern){await tx.$executeRawUnsafe('SAVEPOINT source_receipt_negative');let failed;try{await run();}catch(e){failed=e;}finally{await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT source_receipt_negative');await tx.$executeRawUnsafe('RELEASE SAVEPOINT source_receipt_negative');}assert.ok(failed,'Expected source receipt rejection');assert.match(String(failed.message),pattern);n++;}
  await denied(()=>tx.invoicePayment.create({data:{...base,paidUsd:receipt.paidUsd.plus(1),allocationAmount:receipt.allocationAmount.plus(1)}}),/pinned staged evidence/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,paidVnd:receipt.paidVnd.plus(1),cashAmount:receipt.cashAmount.plus(1)}}),/pinned staged evidence/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,fxRate:receipt.fxRate.plus('0.000000000001')}}),/pinned staged evidence/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,paymentDate:new Date('2026-01-01')}}),/pinned staged evidence/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,invoiceId:receipts.find(r=>r.invoiceId!==receipt.invoiceId).invoiceId}}),/pinned staged evidence/i);
  await denied(async()=>{const other=await tx.company.create({data:{companyCode:'SOURCE_OTHER_SYN',companyName:'Synthetic isolation guard'}});await tx.invoicePayment.create({data:{...base,companyId:other.id}});},/require DGC/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,approvedById:actorId}}),/source_approver/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,historicalSource:{...receipt.historicalSource,snapshotHash:'0'.repeat(64)}}}),/no rows|query returned/i);
  await denied(()=>tx.invoicePayment.update({where:{id:receipt.id},data:{note:'Changed source'}}),/immutable/i);
  await denied(()=>tx.invoicePayment.delete({where:{id:receipt.id}}),/immutable/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,paymentCode:'NULL_APPROVER_SYN',historicalSource:Prisma.DbNull,paidUsd:'100',allocationAmount:'100',paidVnd:'10000',cashAmount:'10000',fxRate:'100',approvedById:null}}),/source_approver/i);
  await denied(()=>tx.invoicePayment.create({data:{...base,paymentCode:'FRACTIONAL_LIVE_SYN',historicalSource:Prisma.DbNull,paidUsd:'100',allocationAmount:'100',paidVnd:'10000.1',cashAmount:'10000.1',fxRate:'100',approvedById:actorId}}),/positive/i);
  await denied(async()=>{const account=await tx.cashAccount.create({data:{companyId:company.id,accountCode:'SOURCE_GUARD_SYN',name:'Synthetic guard only',kind:'BANK',currency:'VND',bankName:'',accountNumber:'',holderName:'',openingDate:new Date('2020-01-01'),openingBalance:'0',balance:'0',note:''}});await tx.cashAccount.update({where:{id:account.id},data:{balance:{increment:'1'}}});await tx.cashEntry.create({data:{companyId:company.id,cashAccountId:account.id,entryCode:'SOURCE_CASH_SYN',entryDate:receipt.paymentDate,kind:'INVOICE_RECEIPT',direction:'IN',currency:'VND',amount:'1',balanceAfter:'1',sourceId:receipt.id,description:'Synthetic rejected source cash'}});},/never post cash/i);
  eq(await tx.cashAccount.count(),0);eq(await tx.cashEntry.count(),0);
 }});
 eq(result.first.created,51);eq(result.replay.created,0);eq(result.replay.unchanged,51);eq(result.rolledBack,true);eq(result.before,result.after);eq(result.localApprovalCreated,false);eq(result.historicalCashPosting,false);
 const proof={format:'dgc-source-receipt-shape-proof-v1',assertions:n,...result};await writeFile('artifacts/dgc-migration/20261023/source-receipts/proof-'+Date.now()+'.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({assertions:n,sourceReceipts:51,parentShells:45,first:result.first,replay:result.replay,rolledBack:result.rolledBack,exactAmountsVerified:result.exactAmountsVerified,localApprovalCreated:false,historicalCashPosting:false,financialPosting:false}));
}catch(e){await writeFile('artifacts/dgc-migration/20261023/source-receipts/last-error.log',String(e.stack??e),{mode:0o600});console.error('Receipt shape test failed; inspect private last-error.log');process.exitCode=1;}finally{await db.$disconnect();}
