import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {referenceRegistrationInputs,trialPdf} from './reference-registration.fixtures.mjs';
import {referenceRegistrationPlan,verifyReferenceRegistrationPlan,rehearseReferenceRegistration} from './reference-registration.mjs';
import {canonical,digest} from './core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
const root=await mkdtemp(join(tmpdir(),'dgc-reference-plan-')),saved=process.env.DATABASE_URL;
try{
 const options=referenceRegistrationInputs();options.referenceRoot=root;options.invoiceOptions.root=root;
 for(const f of [...options.referenceManifest.files,...options.invoiceOptions.manifest.files])await writeFile(join(root,f.relativePath),trialPdf);
 const before=canonical(options),p=await referenceRegistrationPlan(options);eq(p.counts,{WHOLE_DOCUMENT_CANDIDATE_FOR_ROLLBACK_TRIAL:2});eq(p.documents.map(d=>d.sourceStatus),['Draft','Approved']);eq(p.documents.every(d=>d.safeTrialDocumentStatus==='DRAFT'&&!d.operationalDocumentStatus&&!d.readyToRegister),true);eq(p.registryCommitAllowed,false);eq(p.postingAllowed,false);eq(p.acceptance,false);eq(canonical(options),before);eq(await verifyReferenceRegistrationPlan(p,options),p);
 eq(p.documents.every(d=>d.dependencies.length===2),true);eq(p.unrehearsableInvoices,[]);
 const held=referenceRegistrationInputs((c,change)=>change('48_INVOICE_HEADER','Needs_Regeneration',true));held.referenceRoot=root;const hp=await referenceRegistrationPlan(held);eq(hp.documents.every(d=>d.reasons.includes('WHOLE_DOCUMENT_INVOICE_SET_NOT_REHEARSABLE')),true);eq(hp.unrehearsableInvoices.length,1);eq(hp.unrehearsableInvoices[0].affectedDocuments.length,2);eq(hp.unrehearsableInvoices[0].restoreReasons.includes('REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW'),true);
 const x=structuredClone(p);x.documents[0].dependencies=[];const {planHash,...b}=x;x.planHash=digest(b);await reject(()=>verifyReferenceRegistrationPlan(x,options),/pinned evidence/);
 const pin=structuredClone(options);pin.referencePin='0'.repeat(64);await reject(()=>referenceRegistrationPlan(pin),/Pinned/);
 process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55433/dgc_migration_staging_never_connect';
 await reject(()=>rehearseReferenceRegistration({}, {...options,registrationPlan:p,documentSources:[p.documents[0].source,p.documents[0].source]}),/unique whole/);
 await reject(()=>rehearseReferenceRegistration({}, {...held,registrationPlan:hp,documentSources:[hp.documents[0].source]}),/held or incomplete/);
 process.env.DATABASE_URL='postgresql://unused@remote.example/dgc_migration_staging_bad';await reject(()=>rehearseReferenceRegistration({}, {...options,registrationPlan:p,documentSources:[p.documents[0].source]}),/dedicated local/);
}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-reference-plan-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
console.log(`Whole-document registration planner: ${n} assertions passed`);
