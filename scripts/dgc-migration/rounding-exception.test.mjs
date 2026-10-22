import assert from 'node:assert/strict';
import {canonical,digest} from './core.mjs';
import {roundingExceptionPlan,verifyRoundingExceptionPlan} from './rounding-exception.mjs';
import {roundingExceptionInputs} from './rounding-exception.fixtures.mjs';
import {rehearseRevenue,rehearseRoundingExceptions} from './revenue-rehearsal.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
const inputs=roundingExceptionInputs(),args=o=>[o.snapshot,o.targetPlan,o.combined,o.combinedPin,o.rounding,o.roundingPin,o.decisions],before=canonical(inputs),p=roundingExceptionPlan(...args(inputs));
eq(p.counts,{CAPTURED_ROUNDING_SHAPE_TRIAL_CANDIDATE:1});eq(p.groups[0].originalBusinessState,'HELD');eq(p.groups[0].originalEvidenceState,'EVIDENCE_REVIEW_HELD');eq(p.groups[0].entries.length,2);eq(p.groups[0].entries[0].exceptionEvidence.components,{revenue:'33.33',wht:'3.67',payable:'29.67'});eq(p.groups[0].entries[0].exceptionEvidence.identityDelta,'0.01');eq(p.groups[0].entries[0].exceptionEvidence.operationalFxDerived,false);eq(p.commitAllowed,false);eq(p.originalGatesUnchanged,true);eq(p.acceptance,false);eq(canonical(inputs),before);eq(verifyRoundingExceptionPlan(p,...args(inputs)),p);
for(const mutate of [(c,ch)=>ch('44_RECON_PDF_DETAIL','Partner_Revenue_MZN',89.01),(c,ch)=>ch('40_MONTHLY_REVENUE','Invoice_Payable_USD',29.68),(c,ch)=>ch('40_MONTHLY_REVENUE','Status','Draft'),(c,ch)=>ch('41_RECONCILIATION','Company_Share',90)]){const o=roundingExceptionInputs(mutate);eq(roundingExceptionPlan(...args(o)).groups[0].state,'SHAPE_TRIAL_HELD');}
const c=structuredClone(inputs.combined);c.groups[0].reasons.push('PDF_BYTES_MISSING');const {reviewHash,...b}=c;c.reviewHash=digest(b);eq(roundingExceptionPlan(...args({...inputs,combined:c,combinedPin:c.reviewHash})).groups[0].state,'SHAPE_TRIAL_HELD');
const bad=structuredClone(p);bad.groups[0].entries[0].exceptionEvidence.components.payable='29.66';const {planHash,...body}=bad;bad.planHash=digest(body);assert.throws(()=>verifyRoundingExceptionPlan(bad,...args(inputs)),/pinned source/);n++;
const saved=process.env.DATABASE_URL;try{
 process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55555/dgc_migration_staging_never_connect';
 await reject(()=>rehearseRevenue({},inputs.snapshot,'unused',inputs.targetPlan,[p.groups[0].groupKey],inputs.targetPlan.planHash),/held or missing/);
 await reject(()=>rehearseRoundingExceptions({}, {...inputs,exceptionPlan:p,groupKeys:[p.groups[0].groupKey,p.groups[0].groupKey]}),/unique whole/);
 process.env.DATABASE_URL='postgresql://unused@remote.example/dgc_migration_staging_bad';await reject(()=>rehearseRoundingExceptions({}, {...inputs,exceptionPlan:p}),/dedicated local/);
}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
console.log(`Captured rounding shape profile: ${n} assertions passed`);
