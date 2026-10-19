import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture,masterPlan,SOURCE_ID} from './core.mjs';
import {requireStaging,stageSnapshot,applyMasters} from './staging.mjs';
requireStaging(process.env.DATABASE_URL??'');
if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_synthetic'))throw Error('Use only a disposable *_synthetic staging database');
const {PrismaClient}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),prisma=new PrismaClient();
try{
 const company=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}}),envelopes=fixture(),snapshot=normalizeCapture(envelopes),plan=masterPlan(snapshot);
 assert.equal(await prisma.service.count(),0);
 assert.deepEqual(await stageSnapshot(prisma,snapshot,company.id),{created:true,rows:4});
 assert.deepEqual(await stageSnapshot(prisma,snapshot,company.id),{created:false,rows:4});
 assert.equal((await applyMasters(prisma,snapshot,company.id,'all',plan.planHash)).created,4);
 assert.equal((await applyMasters(prisma,snapshot,company.id,'all',plan.planHash)).unchanged,4);
 assert.equal(await prisma.contract.count(),1);assert.equal(await prisma.contractService.count(),1);
 assert.equal(await prisma.service.count(),1);assert.equal(await prisma.partner.count(),1);assert.equal(await prisma.invoice.count(),0);assert.equal(await prisma.cashAccount.count(),0);
 await assert.rejects(applyMasters(prisma,snapshot,company.id,'all','wrong'),/stale/);
 const target=await prisma.service.findFirstOrThrow();await prisma.service.update({where:{id:target.id},data:{serviceName:'Operator changed target'}});
 await assert.rejects(applyMasters(prisma,snapshot,company.id,'all',plan.planHash),/target or mapping changed/);
 await prisma.service.update({where:{id:target.id},data:{serviceName:target.serviceName}});
 const changed=structuredClone(envelopes),service=changed.find(e=>e.data.sheets[0].properties.title==='20_DM_SERVICE');service.data.sheets[0].data[0].rowData[2].values[2].effectiveValue.stringValue='Changed source';
 const next=normalizeCapture(changed),nextPlan=masterPlan(next);await stageSnapshot(prisma,next,company.id);
 await assert.rejects(applyMasters(prisma,next,company.id,'all',nextPlan.planHash),/Source changed/);
 const moved=structuredClone(envelopes),movedGrid=moved.find(e=>e.data.sheets[0].properties.title==='20_DM_SERVICE').data.sheets[0].data[0];movedGrid.rowData.splice(2,0,{});
 const movedSnapshot=normalizeCapture(moved);await stageSnapshot(prisma,movedSnapshot,company.id);
 await assert.rejects(applyMasters(prisma,movedSnapshot,company.id,'all',masterPlan(movedSnapshot).planHash),/Source changed or moved/);
 await prisma.$executeRaw`UPDATE dgc_import_rows SET payload='{}'::jsonb WHERE company_id=${company.id}::uuid AND snapshot_hash=${snapshot.snapshotHash} AND sheet_name='20_DM_SERVICE'`;
 await assert.rejects(stageSnapshot(prisma,snapshot,company.id),/integrity mismatch/);
 const original=snapshot.tables['20_DM_SERVICE'].rows[0];await prisma.$executeRaw`UPDATE dgc_import_rows SET payload=${JSON.stringify(original)}::jsonb WHERE company_id=${company.id}::uuid AND snapshot_hash=${snapshot.snapshotHash} AND sheet_name='20_DM_SERVICE'`;
 const more=structuredClone(envelopes),moreGrid=more.find(e=>e.data.sheets[0].properties.title==='20_DM_SERVICE').data.sheets[0].data[0];const newRow=structuredClone(moreGrid.rowData[2]);newRow.values[0].effectiveValue.stringValue='SYNTH_NEW';newRow.values[1].effectiveValue.stringValue='SYNTH_NEW';moreGrid.rowData.push(newRow);
 const moreSnapshot=normalizeCapture(more),morePlan=masterPlan(moreSnapshot);await stageSnapshot(prisma,moreSnapshot,company.id);
 await prisma.$executeRawUnsafe("CREATE FUNCTION dgc_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'DGC_IMPORT_MASTER' THEN RAISE EXCEPTION 'synthetic downstream failure'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER dgc_test_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION dgc_test_reject_audit()');
 try{await assert.rejects(applyMasters(prisma,moreSnapshot,company.id,'all',morePlan.planHash));assert.equal(await prisma.service.count(),1);assert.equal(await prisma.dgcImportLink.count(),4);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER dgc_test_audit_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION dgc_test_reject_audit()');}
 assert.equal((await applyMasters(prisma,moreSnapshot,company.id,'services',morePlan.planHash)).created,1);
 const pendingCapture=structuredClone(envelopes),pgrid=pendingCapture.find(e=>e.data.sheets[0].properties.title==='21_DM_PARTNER').data.sheets[0].data[0],pendingRow=structuredClone(pgrid.rowData[2]);pendingRow.values[0]=cell('SYNTH_PENDING');pendingRow.values[1]=cell('SYNTH_PENDING');pendingRow.values[4]=cell('');pgrid.rowData.push(pendingRow);
 const pending=normalizeCapture(pendingCapture),r=pending.tables['21_DM_PARTNER'].rows[1];await stageSnapshot(prisma,pending,company.id);
 await assert.rejects(applyMasters(prisma,pending,company.id,'partners',masterPlan(pending).planHash),/unresolved/);
 const resolution={format:'dgc-master-decisions-v1',snapshotHash:pending.snapshotHash,decisions:[{sheet:'21_DM_PARTNER',sheetId:pending.tables['21_DM_PARTNER'].sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,expectedRowHash:r.rowHash,field:'Status',expectedValue:'',value:'Active',approvedBy:'OWNER',approvedAt:'2026-10-19T00:00:00Z',reason:'Synthetic explicit owner decision'}]};
 const resolved=masterPlan(pending,resolution);assert.equal((await applyMasters(prisma,pending,company.id,'partners',resolved.planHash,resolution)).created,1);assert.equal((await applyMasters(prisma,pending,company.id,'partners',resolved.planHash,resolution)).unchanged,2);assert.equal(await prisma.auditLog.count({where:{action:'DGC_IMPORT_DECISION'}}),1);assert.equal((await prisma.partner.findFirstOrThrow({where:{partnerKey:'SYNTH_PENDING'}})).status,'ACTIVE');assert.equal(r.values.Status,'');
 const foreign=await prisma.company.create({data:{companyCode:'OTHER_SYNTHETIC',companyName:'Synthetic other tenant'}});
 try{await assert.rejects(stageSnapshot(prisma,snapshot,company.id),/exactly one DGC tenant/);}finally{await prisma.company.delete({where:{id:foreign.id}});}
 assert.equal(await prisma.revenue.count(),0);assert.equal(await prisma.cashEntry.count(),0);
 console.log('PASS: real PostgreSQL staging replay, master replay, source/target drift, row movement, checksum tampering, downstream rollback and tenant isolation; no financial posting.');
}finally{await prisma.$disconnect();}
