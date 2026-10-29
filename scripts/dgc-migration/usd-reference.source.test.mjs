import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {usdReferenceSourceInputs} from './usd-reference-source-inputs.mjs';
import {reviewUsdReference} from './usd-reference.mjs';
import {canonical} from './core.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
await withSourcePlanningCache(async()=>{
 const o=await usdReferenceSourceInputs(),before=canonical(o),review=await reviewUsdReference(o),old=JSON.parse(await readFile('artifacts/dgc-migration/20261024/child-native/review.json','utf8'));
 eq(review.counts,{USD_REFERENCE_CHILD_BOUND:44,USD_REFERENCE_CHILD_HELD:3});eq(review.entries.filter(e=>e.state==='USD_REFERENCE_CHILD_HELD').map(e=>e.source.sourceRow),[398,399,400]);eq(review.entries.filter(e=>e.state==='USD_REFERENCE_CHILD_BOUND'&&e.referenceMode==='EXACT_USD_CONCORDANCE').length,43);
 const special=review.entries.find(e=>e.source.sourceRow===83);eq(special.referenceMode,'SOURCE_FALLBACK_AND_PRINTED_TRUNCATION_COMPATIBILITY');eq(special.components[0].source.donorNumber,'4393.12');eq(special.components[0].reference.donorNumber,'4393.11');eq(special.components[0].printedMatches,false);eq(special.pdfAuthorRoundingPolicyProven,false);
 for(const row of [297,375]){const e=review.entries.find(e=>e.source.sourceRow===row);eq(e.state,'USD_REFERENCE_CHILD_BOUND');eq(e.components.every(c=>c.sourceMatches&&c.printedMatches),true);}
 eq(review.entries.every(e=>e.usdPrintedOnChild===false&&e.operationalFxDerived===false&&e.sourceValuesChanged===false),true);eq(review.groups.filter(g=>g.state==='USD_REFERENCE_GROUP_CANDIDATE').every(g=>g.summaryChecks.length===3&&g.summaryChecks.every(c=>c.state==='MATCH')&&g.revenues.every(r=>r.nativeIdentityAccepted===false)),true);
 eq(old.counts,{CHILD_NATIVE_FALLBACK_BOUND:41,CHILD_NATIVE_EVIDENCE_HELD:6});eq(canonical(o),before);eq(review.commitAllowed,false);eq(review.postingAllowed,false);eq(review.acceptance,false);eq(review.readyToImport,false);
 const proof={format:'dgc-usd-reference-source-proof-v1',assertions:n,snapshotHash:review.snapshotHash,reviewHash:review.reviewHash,childrenBound:44,childrenHeld:3,groupCounts:review.groupCounts,oldNativeGatesUnchanged:true,nativeIdentityAccepted:false,pdfAuthorRoundingPolicyProven:false,financialRowsCommitted:0,remoteChanged:false};const out='artifacts/dgc-migration/20261025/usd-reference/';await mkdir(out,{recursive:true});for(const [name,data] of [['review.json',review],['source-proof.json',proof]])await writeFile(out+name,JSON.stringify(data,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(proof));
});
