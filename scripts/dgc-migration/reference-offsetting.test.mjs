import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {canonical,digest} from './core.mjs';
import {trialPdf} from './reference-registration.fixtures.mjs';
import {referenceOffsettingInputs} from './reference-offsetting.fixtures.mjs';
import {referenceRegistrationPlan,rehearseReferenceOffsetting,rehearseReferenceRounding} from './reference-registration.mjs';
import {referenceOffsettingPlan,verifyReferenceOffsettingPlan,referenceRoundingPlan} from './reference-rounding.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(f,re)=>{await assert.rejects(f,re);n++;};
const root=await mkdtemp(join(tmpdir(),'dgc-reference-offsetting-plan-'));
async function inputs(mutate){const o=referenceOffsettingInputs(mutate);o.referenceRoot=root;for(const f of o.referenceManifest.files)await writeFile(join(root,f.relativePath),trialPdf);o.registrationPlan=await referenceRegistrationPlan(o);return o;}
function rehash(p){const {planHash,...b}=p;return {...b,planHash:digest(b)};}
try{
 const o=await inputs(),before=canonical(o),p=await referenceOffsettingPlan(o);
 eq(p.counts,{WHOLE_DOCUMENT_OFFSETTING_SHAPE_CANDIDATE:2});eq(p.documents[0].dependencies.map(d=>d.state),['OFFSETTING_INVOICE_SHAPE','ROUNDING_INVOICE_SHAPE','STRICT_INVOICE_SHAPE']);
 eq(o.registrationPlan.counts,{REGISTRATION_HELD:2});eq((await referenceRoundingPlan(o)).counts,{REFERENCE_ROUNDING_SHAPE_HELD:2});eq(p.documents.map(d=>d.safeTrialDocumentStatus),['DRAFT','DRAFT']);eq(p.documents.map(d=>d.sourceStatus),['Draft','Approved']);eq(p.originalGatesUnchanged,true);eq(p.registryCommitAllowed,false);eq(p.acceptance,false);eq(p.invoiceOffsettingPlanHash,o.offsettingPlan.planHash);eq(await verifyReferenceOffsettingPlan(p,o),p);eq(canonical(o),before);
 for(const mutate of [(c,ch)=>ch('50_AR_AP','Original_Amount',91,3),(c,ch)=>ch('50_AR_AP','Original_Amount',31,2),(c,ch)=>ch('50_AR_AP','Original_Amount',61)]){const held=await inputs(mutate);eq((await referenceOffsettingPlan(held)).counts,{REFERENCE_OFFSETTING_SHAPE_HELD:2});}
 const noRefs=await inputs((c,ch)=>ch('55_APPROVAL_PACKAGE','Related_Invoice_IDs',''));eq((await referenceOffsettingPlan(noRefs)).documents[1].state,'REFERENCE_OFFSETTING_SHAPE_HELD');
 const noOffset=await inputs((c,ch)=>{ch('55_APPROVAL_PACKAGE','Related_Invoice_IDs','INV3, INV4');});eq((await referenceOffsettingPlan(noOffset)).documents[1].reasons,['NO_OFFSETTING_INVOICE_DEPENDENCY']);
 const forged=structuredClone(p);forged.documents[0].dependencies.shift();await reject(()=>verifyReferenceOffsettingPlan(rehash(forged),o),/pinned evidence/);
 for(const field of ['offsettingPlan','invoiceExceptionPlan','registrationPlan']){const bad=structuredClone(o);bad[field].entries?bad[field].entries.pop():bad[field].documents.pop();bad[field]=rehash(bad[field]);await reject(()=>verifyReferenceOffsettingPlan(p,bad),/pinned|differs/);}
 const saved=process.env.DATABASE_URL;try{process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55555/dgc_migration_staging_no_connection';await reject(()=>rehearseReferenceOffsetting({}, {...o,referenceOffsettingPlan:p,documentSources:[p.documents[0].source,p.documents[0].source]}),/unique whole/);await reject(async()=>rehearseReferenceRounding({}, {...o,referenceRoundingPlan:await referenceRoundingPlan(o),documentSources:[p.documents[0].source]}),/held or incomplete/);const held=await inputs((c,ch)=>ch('50_AR_AP','Original_Amount',91,3));await reject(async()=>rehearseReferenceOffsetting({}, {...held,referenceOffsettingPlan:await referenceOffsettingPlan(held),documentSources:[p.documents[0].source]}),/held or incomplete/);process.env.DATABASE_URL='postgresql://unused@remote.invalid/dgc_migration_staging_bad';await reject(()=>rehearseReferenceOffsetting({},o),/dedicated local/);}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
 await writeFile(join(root,o.referenceManifest.files[0].relativePath),'bad');await reject(()=>verifyReferenceOffsettingPlan(p,o),/bytes differ/);
 console.log(`Whole-document offsetting shape profile: ${n} assertions passed`);
}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-reference-offsetting-plan-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
