import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {canonical,digest} from './core.mjs';
import {trialPdf} from './reference-registration.fixtures.mjs';
import {referenceRoundingInputs} from './reference-rounding.fixtures.mjs';
import {referenceRegistrationPlan,rehearseReferenceRounding,rehearseReferenceRegistration} from './reference-registration.mjs';
import {referenceRoundingPlan,verifyReferenceRoundingPlan} from './reference-rounding.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(f,re)=>{await assert.rejects(f,re);n++;};
const root=await mkdtemp(join(tmpdir(),'dgc-reference-rounding-plan-'));
async function inputs(mutate,mixed){const o=referenceRoundingInputs(mutate,mixed);o.referenceRoot=root;for(const f of o.referenceManifest.files)await writeFile(join(root,f.relativePath),trialPdf);o.registrationPlan=await referenceRegistrationPlan(o);return o;}
try{
 const o=await inputs(),before=canonical(o),p=await referenceRoundingPlan(o);eq(p.counts,{WHOLE_DOCUMENT_ROUNDING_SHAPE_CANDIDATE:2});eq(p.documents[0].dependencies.map(d=>d.state),['ROUNDING_INVOICE_SHAPE','STRICT_INVOICE_SHAPE']);eq(o.registrationPlan.counts,{REGISTRATION_HELD:2});eq(p.documents.map(d=>d.safeTrialDocumentStatus),['DRAFT','DRAFT']);eq(p.documents.map(d=>d.sourceStatus),['Draft','Approved']);eq(p.originalGatesUnchanged,true);eq(p.registryCommitAllowed,false);eq(p.acceptance,false);eq(await verifyReferenceRoundingPlan(p,o),p);eq(canonical(o),before);
 const all=await inputs(()=>{},false);eq((await referenceRoundingPlan(all)).documents[0].dependencies.map(d=>d.state),['ROUNDING_INVOICE_SHAPE','ROUNDING_INVOICE_SHAPE']);
 const held=await inputs((c,ch)=>ch('50_AR_AP','Original_Amount',91,2));eq((await referenceRoundingPlan(held)).counts,{REFERENCE_ROUNDING_SHAPE_HELD:2});
 const empty=await inputs((c,ch)=>ch('55_APPROVAL_PACKAGE','Related_Invoice_IDs',''));eq((await referenceRoundingPlan(empty)).documents[1].state,'REFERENCE_ROUNDING_SHAPE_HELD');
 const forged=structuredClone(p);forged.documents[0].dependencies.pop();const {planHash,...b}=forged;forged.planHash=digest(b);await reject(()=>verifyReferenceRoundingPlan(forged,o),/pinned evidence/);
 const saved=process.env.DATABASE_URL;try{process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55555/dgc_migration_staging_no_connection';await reject(()=>rehearseReferenceRegistration({}, {...o,documentSources:[p.documents[0].source]}),/held or incomplete/);await reject(async()=>rehearseReferenceRounding({}, {...held,referenceRoundingPlan:await referenceRoundingPlan(held),documentSources:[p.documents[0].source]}),/held or incomplete/);await reject(()=>rehearseReferenceRounding({}, {...o,referenceRoundingPlan:p,documentSources:[p.documents[0].source,p.documents[0].source]}),/unique whole/);}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
 await writeFile(join(root,o.referenceManifest.files[0].relativePath),'bad');await reject(()=>verifyReferenceRoundingPlan(p,o),/bytes differ/);
 console.log(`Whole-document rounding shape profile: ${n} assertions passed`);
}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-reference-rounding-plan-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
