import assert from 'node:assert/strict';
import {withSourcePlanningCache} from './planning-context.mjs';
import {invoiceRoundingInputs} from './invoice-rounding.fixtures.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {canonical,digest} from './core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},fails=f=>{assert.throws(f);n++;};
const o=invoiceRoundingInputs(),baseline=invoiceRoundingPlan(o),before=canonical(o);
await withSourcePlanningCache(async()=>{
 const p=invoiceRoundingPlan(o);eq(p,baseline);p.entries[0].invoiceRounding.components.payable='0';eq(invoiceRoundingPlan(o),baseline);
 // Full inputs, rather than their asserted pins, invalidate cached transforms.
 const row=o.invoiceOptions.snapshot.tables['48_INVOICE_HEADER'].rows[0],amount=row.values.Total_Payable_USD;row.values.Total_Payable_USD=999;fails(()=>invoiceRoundingPlan(o));row.values.Total_Payable_USD=amount;eq(invoiceRoundingPlan(o),baseline);
 const c=o.invoiceOptions.combined.groups[0],state=c.state;c.state='forged-with-original-review-pin';fails(()=>invoiceRoundingPlan(o));c.state=state;
 const old=o.invoiceOptions.restorePlan,forged=structuredClone(old);forged.entries[0].reasons=[];const {planHash,...b}=forged;forged.planHash=digest(b);o.invoiceOptions.restorePlan=forged;fails(()=>invoiceRoundingPlan(o));o.invoiceOptions.restorePlan=old;
 // Async scopes remain isolated; callers cannot poison returned objects.
 await Promise.resolve();eq(invoiceRoundingPlan(o),baseline);
});
eq(invoiceRoundingPlan(o),baseline);eq(canonical(o),before);
console.log(`Scoped source planning: ${n} assertions passed; stale pins, input mutation and output isolation`);
