import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {canonical,digest} from './core.mjs';
import {physicalRevenueGroups} from './physical-revenue.mjs';
import {physicalRevenueEvidence} from './source-identity.mjs';
import {historicalPhysicalRevenueIdentity} from '../../apps/api/dist/modules/projects/historical-physical-revenue.js';
const b='artifacts/dgc-migration/',json=async p=>JSON.parse(await readFile(b+p,'utf8')),snapshot=await json('20261019/prepared/snapshot.json'),target=await json('20261023/owner-financial-decisions/refreshed/revenue-target-plan.json'),decisions=await json('20261023/owner-financial-decisions/owner-decisions.json'),plan=await json('20261029/source-identity/plan.json'),before=canonical({snapshot,target});
const groups=physicalRevenueGroups(snapshot,target,decisions,plan.planHash);let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
eq(groups.flatMap(g=>g.entries.map(e=>e.source.sourceRow)).sort((a,b)=>a-b),[123,369]);eq(canonical({snapshot,target}),before);
const dbRows=sheet=>snapshot.tables[sheet].rows.filter(r=>r.values.Revenue_ID==='REV0419').map(r=>({...r,sheetId:snapshot.tables[sheet].sheetId,payload:r})),monthly=dbRows('40_MONTHLY_REVENUE'),legacy=dbRows('41_RECONCILIATION');
for(const g of groups){const e=g.entries[0],proof=e.physicalRevenueIdentity,read=(x=proof,m=monthly,l=legacy)=>historicalPhysicalRevenueIdentity(x,snapshot.snapshotHash,e.source,m,l);
 eq(read(),proof);eq(proof.sourceIdChanged,false);eq(proof.legacyRelationInvented,false);eq(proof.acceptance,false);eq(proof.operationalUseAllowed,false);eq(e.legacyReconciliations.map(l=>l.sourceRow),e.source.sourceRow===369?[371]:[]);eq(e.capturedRevenue,target.groups.find(t=>t.groupKey===g.groupKey).entries[0].capturedRevenue);eq(e.source.legacyId,'REV0419');
 for(const mutate of [x=>x.targetCode='REV0419',x=>x.matchingLegacySources=[],x=>x.legacyCandidateSources=[],x=>x.acceptance=true]){const x=structuredClone(proof);mutate(x);if(canonical(x)===canonical(proof))continue;const {identityHash,...body}=x;x.identityHash=digest(body);assert.throws(()=>read(x),e=>e.statusCode===409);n++;}
 assert.throws(()=>read(proof,monthly.slice(0,1)),e=>e.statusCode===409);n++;assert.throws(()=>read(proof,monthly,[]),e=>e.statusCode===409);n++;
 assert.throws(()=>physicalRevenueEvidence(snapshot,e.source,'0'.repeat(64)),/pin differs/);n++;
}
eq(new Set(groups.map(g=>g.entries[0].physicalRevenueIdentity.targetCode)).size,2);eq(groups.map(g=>g.state),['HELD','HELD']);
await mkdir(b+'20261104/physical-revenue',{recursive:true});await writeFile(b+'20261104/physical-revenue/source-proof.json',JSON.stringify({assertions:n,identityPlanHash:plan.planHash,sourceRows:[123,369],localCodes:groups.map(g=>g.entries[0].physicalRevenueIdentity.targetCode),financialAdmission:false},null,2)+'\n',{mode:0o600});console.log(`Physical revenue source projection: ${n} assertions passed; separate codes, exact scope-only legacy, forged and hidden candidates rejected`);
