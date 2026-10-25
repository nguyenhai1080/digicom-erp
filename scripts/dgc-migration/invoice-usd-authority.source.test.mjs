import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {canonical,digest} from './core.mjs';
import {nativeUsdSourceInputs} from './native-usd-source-inputs.mjs';
import {invoiceUsdAuthoritySourceInputs} from './invoice-usd-authority-source-inputs.mjs';
import {invoiceUsdAuthorityPlan,invoiceUsdAuthorityProposal} from './invoice-usd-authority.mjs';
import {reviewReconOcr} from './recon-ocr.mjs';
import {invoiceMultiPeriodReview} from './invoice-multiperiod.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
await withSourcePlanningCache(async()=>{
 const native=await nativeUsdSourceInputs(),o={invoiceOptions:native.invoiceOptions,nativeUsdOptions:native,invoiceUsdAuthorityOptions:await invoiceUsdAuthoritySourceInputs()},before=canonical(o),plan=await invoiceUsdAuthorityPlan(o),a=o.invoiceUsdAuthorityOptions,i=o.invoiceOptions,k=native.nativeOptions;
 console.error('Original Invoice USD plan derived from fresh bytes/OCR/renders');
 eq(plan.counts,{ORIGINAL_INVOICE_USD_CANDIDATE:2});eq(plan.entries.map(e=>e.source.sourceRow),[85,86]);eq(plan.entries.map(e=>e.invoice.period),['2019-05','2020-08']);eq(plan.entries.map(e=>e.scopes.length),[3,1]);eq(plan.entries.map(e=>e.receivable.outstandingAmount),['808.71','6982.13']);
 eq(plan.entries.every(e=>e.nativeUsdEvidence.components.every(c=>c.match)),true);eq(plan.entries.every(e=>e.nativeUsdEvidence.claims.nativeComponentsVerified===false&&e.nativeUsdEvidence.claims.exchangeRateDerived===false),true);eq(plan.entries.map(e=>e.nativeUsdEvidence.claims.perPeriodRevenueWhtPrintedOnInvoice),[false,true]);eq(plan.entries[0].nativeUsdEvidence.allocations.every(e=>e.contractEvidence.exactTextMatch===false&&e.contractEvidence.legalEquivalenceInferred===false),true);eq(plan.entries[1].nativeUsdEvidence.allocations[0].contractEvidence.exactTextMatch,true);eq(plan.entries[1].nativeUsdEvidence.allocations[0].reconFullIdentityVerified,false);eq(plan.entries.every(e=>e.originalState==='RESTORE_HELD'&&e.readyToImport===false),true);eq(plan.commitAllowed,false);eq(plan.acceptance,false);eq(canonical(o),before);
 const ocr=await reviewReconOcr(i.snapshot,k.manifest,k.root,k.manifestPin,k.ocrManifest,k.ocrRoot,k.ocrManifestPin),multi=await invoiceMultiPeriodReview({...a.multiPeriodOptions,invoiceOptions:i});
 for(const change of [x=>x.components.payable='808.72',x=>x.billingStart='2019-04-01',x=>x.serviceKey='UNKNOWN',x=>x.partnerKey='UNKNOWN',x=>x.coveredPeriods=['2019-05']]){const observations=structuredClone(a.observations);change(observations.invoices[0]);const {observationHash,...b}=observations;observations.observationHash=digest(b);const p=invoiceUsdAuthorityProposal({...o,invoiceUsdAuthorityOptions:{...a,observations,observationPin:observations.observationHash}},ocr,multi);eq(p.entries[0].state,'ORIGINAL_INVOICE_USD_HELD');eq(p.entries[1].state,'ORIGINAL_INVOICE_USD_CANDIDATE');}
 const wrong=structuredClone(ocr);wrong.reviewHash='f'.repeat(64);assert.throws(()=>invoiceUsdAuthorityProposal(o,wrong,multi),/OCR pin differ/);n++;
 const proof={format:'dgc-original-invoice-usd-authority-source-proof-v1',assertions:n,snapshotHash:plan.snapshotHash,planHash:plan.planHash,rows:[85,86],nativeValuesVerified:false,fxDerived:false,contractTextDifferencePreserved:true,oldStrictGatesUnchanged:true,financialRowsCommitted:0,remoteChanged:false};const out='artifacts/dgc-migration/20261025/invoice-usd-authority/';for(const [name,data] of [['invoice-plan.json',plan],['source-proof.json',proof]])await writeFile(out+name,JSON.stringify(data,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(proof));
});
