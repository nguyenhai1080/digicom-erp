import assert from 'node:assert/strict';
import {canonical,digest} from './core.mjs';
import {invoiceOffsettingInputs} from './invoice-offsetting.fixtures.mjs';
import {invoiceRoundingInputs} from './invoice-rounding.fixtures.mjs';
import {referenceRoundingInputs} from './reference-rounding.fixtures.mjs';
import {invoiceOffsettingPlan,verifyInvoiceOffsettingPlan} from './invoice-offsetting.mjs';
import {rehearseInvoiceOffsetting,rehearseInvoiceRounding} from './invoice-rehearsal.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(f,re)=>{await assert.rejects(f,re);n++;};
const o=invoiceOffsettingInputs(),before=canonical(o),p=invoiceOffsettingPlan(o),e=p.entries[0];eq(p.counts,{INVOICE_OFFSETTING_SHAPE_CANDIDATE:1});eq(e.invoiceRounding.components,{revenue:'67',wht:'7',payable:'60'});eq(e.invoiceRounding.identityDelta,'0');eq(e.invoiceRounding.lines.map(l=>l.identityDelta),['0.01','-0.01']);eq(e.invoiceRounding.headerArithmetic,'OFFSETTING_CHARACTERIZED_LINE_DELTAS');eq(e.originalRoundingReasons,['HEADER_LINE_ROUNDING_NOT_CHARACTERIZED']);eq(o.invoiceOptions.restorePlan.entries[0].state,'RESTORE_HELD');eq(o.invoiceExceptionPlan.counts,{INVOICE_ROUNDING_SHAPE_HELD:1});eq(p.originalGatesUnchanged,true);eq(p.commitAllowed,false);eq(verifyInvoiceOffsettingPlan(p,o),p);eq(canonical(o),before);
for(const mutate of [(c,ch)=>ch('50_AR_AP','Original_Amount',61),(c,ch)=>ch('49_INVOICE_DETAIL','Payable_USD',30.34,2),(c,ch)=>ch('40_MONTHLY_REVENUE','Status','Draft',3),(c,ch)=>ch('48_INVOICE_HEADER','Total_Payable_USD',60.01)])eq(invoiceOffsettingPlan(invoiceOffsettingInputs(mutate)).entries[0].state,'INVOICE_OFFSETTING_SHAPE_HELD');
eq(invoiceOffsettingPlan(invoiceRoundingInputs()).entries[0].state,'INVOICE_OFFSETTING_SHAPE_HELD');
const noLineExceptions=invoiceOffsettingPlan(referenceRoundingInputs()).entries[1];eq(noLineExceptions.state,'INVOICE_OFFSETTING_SHAPE_HELD');eq(noLineExceptions.reasons.includes('NO_OPPOSING_CHARACTERIZED_LINE_DELTAS'),true);
const forged=structuredClone(p);forged.entries[0].invoiceRounding.lines[0].identityDelta='0';const {planHash,...b}=forged;forged.planHash=digest(b);assert.throws(()=>verifyInvoiceOffsettingPlan(forged,o),/pinned source/);n++;
const saved=process.env.DATABASE_URL;try{process.env.DATABASE_URL='postgresql://unused@127.0.0.1:55555/dgc_migration_staging_never_connect';await reject(()=>rehearseInvoiceOffsetting({}, {...o,offsettingPlan:p,sourceRows:[2,2]}),/unique whole/);await reject(()=>rehearseInvoiceRounding({}, {...o,sourceRows:[2]}),/gates remain held/);process.env.DATABASE_URL='postgresql://unused@remote.invalid/dgc_migration_staging_bad';await reject(()=>rehearseInvoiceOffsetting({},o),/dedicated local/);}finally{if(saved===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved;}
console.log(`Offsetting Invoice line shape: ${n} assertions passed`);
