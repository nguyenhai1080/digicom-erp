import assert from 'node:assert/strict';
import {uniqueChildNativeFileVerificationInputs as requests} from './child-native.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
const a={snapshot:{snapshotHash:'source',tables:{source:{rows:[{value:1}]}}},targetPlan:{planHash:'target'},manifest:{files:[{sha256:'bytes'}]},manifestPin:'manifest',root:'/private/source',python:'python3',childReview:{files:[{parsed:'text'}]},childReviewPin:'review'};
eq(requests([]),[]);eq(requests([a,structuredClone(a)]).length,1);eq(requests([a,{...a,reviewPin:'another-financial-profile',invoicePlanPin:'another-plan'}]).length,1);
for(const mutate of [x=>x.snapshot.tables.source.rows[0].value++,x=>x.targetPlan.planHash='other',x=>x.manifest.files[0].sha256='other',x=>x.manifestPin='other',x=>x.root='/different/root',x=>x.python='different-python',x=>x.childReview.files[0].parsed='different text',x=>x.childReviewPin='other']){const b=structuredClone(a);mutate(b);eq(requests([a,b]).length,2);}
// Separate calls always produce fresh requests. An input mutation is compared
// again, even when the previous request used exactly the same object identity.
const b=structuredClone(a);eq(requests([a,b]).length,1);b.manifest.files[0].sha256='changed-after-first-call';eq(requests([a,b]).length,2);eq(requests([a]).length,1);
console.log(`Child PDF verification requests: ${n} assertions passed; exact duplicate inputs only, no filesystem result cache`);
