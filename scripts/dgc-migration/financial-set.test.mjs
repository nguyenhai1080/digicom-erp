import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {canonical,digest} from './core.mjs';
import {financialSetInputs} from './financial-set.fixtures.mjs';
import {trialPdf} from './reference-registration.fixtures.mjs';
import {invoiceUnifiedPlan,verifyInvoiceUnifiedPlan} from './invoice-unified.mjs';
import {referenceUnifiedPlan,verifyReferenceUnifiedPlan} from './reference-unified.mjs';
import {referenceRegistrationPlan} from './reference-registration.mjs';
import {receiptTargetPlan} from './receipt-target.mjs';
import {rehearseUnifiedFinancialSet} from './financial-set.mjs';
const root=await mkdtemp(join(tmpdir(),'dgc-unified-plan-'));let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,re)=>{await assert.rejects(fn,re);n++;};
async function inputs(mutate){const o=financialSetInputs(mutate);o.referenceRoot=root;for(const f of o.referenceManifest.files)await writeFile(join(root,f.relativePath),trialPdf);o.registrationPlan=await referenceRegistrationPlan(o);o.unifiedInvoicePlan=invoiceUnifiedPlan(o);o.unifiedReferencePlan=await referenceUnifiedPlan(o);o.receiptPlan=receiptTargetPlan(o.invoiceOptions.snapshot);return o;}
try{
 const o=await inputs(),before=canonical(o),p=o.unifiedInvoicePlan,r=o.unifiedReferencePlan;
 eq(p.profileCounts,{V2:1,V1:1,STRICT:1,V3:1,V4:1});eq(p.counts,{UNIFIED_INVOICE_SHAPE_CANDIDATE:5});eq(r.counts,{WHOLE_DOCUMENT_UNIFIED_SHAPE_CANDIDATE:2});eq(r.documents.map(d=>d.dependencies.length),[5,5]);eq(r.documents.map(d=>d.sourceStatus),['Draft','Approved']);eq(r.documents.map(d=>d.safeTrialDocumentStatus),['DRAFT','DRAFT']);eq(o.receiptPlan.counts,{EXACT_SOURCE_RECEIPT_SHAPE:2});eq(p.commitAllowed,false);eq(r.registryCommitAllowed,false);eq(verifyInvoiceUnifiedPlan(p,o),p);eq(await verifyReferenceUnifiedPlan(r,o),r);eq(canonical(o),before);
 for(const row of [1,2,3,4,5]){const bad=await inputs((c,ch)=>ch('50_AR_AP','Original_Amount',999,row));eq(bad.unifiedInvoicePlan.entries.filter(e=>e.state==='UNIFIED_INVOICE_SHAPE_HELD').length,1);eq(bad.unifiedReferencePlan.counts,{UNIFIED_REFERENCE_SHAPE_HELD:2});}
 const noRefs=await inputs((c,ch)=>ch('55_APPROVAL_PACKAGE','Related_Invoice_IDs',''));eq(noRefs.unifiedReferencePlan.documents[1].state,'UNIFIED_REFERENCE_SHAPE_HELD');
 const forged=structuredClone(r);forged.documents[0].dependencies.pop();delete forged.planHash;forged.planHash=digest(forged);await reject(()=>verifyReferenceUnifiedPlan(forged,o),/pinned evidence/);
 const saved=process.env.DATABASE_URL;try{process.env.DATABASE_URL='postgresql://unused@remote.invalid/dgc_migration_staging_bad';await reject(()=>rehearseUnifiedFinancialSet({},o),/dedicated local/);}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
 console.log(`Unified financial planning: ${n} assertions passed; five profiles, complete document sets and receipt bindings`);
}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-unified-plan-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
