import assert from 'node:assert/strict';
import {referenceUsdComponents,printedTruncatedRevenueCompatibility} from './usd-reference.mjs';
import {canonical} from './core.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
const c={Remuneration_Provider_MZN:'283487.72',WHT_MZN:'28348.77',Partner_Revenue_MZN:'255138.94'},p={...c,Remuneration_Provider_MZN:'283487.71'},usd={Invoice_Revenue_USD:'4393.12',Invoice_WHT_USD:'439.31',Invoice_Payable_USD:'3953.8'},before=canonical({c,p,usd}),r=referenceUsdComponents(c,p,'64.53',usd);
eq(r.every(c=>c.sourceMatches),true);eq(r.map(c=>c.printedMatches),[false,true,true]);eq(r[0].reference.donorNumber,'4393.11');eq(canonical({c,p,usd}),before);
for(const rate of [0,-1,null,'NaN','Infinity'])eq(referenceUsdComponents(c,p,rate,usd).every(c=>!c.sourceMatches&&!c.printedMatches),true);
eq(referenceUsdComponents(c,{...p,Remuneration_Provider_MZN:'283487.72'},'64.53',usd).every(c=>c.sourceMatches&&c.printedMatches),true);
eq(referenceUsdComponents(c,p,'64.53',{...usd,Invoice_Revenue_USD:'4393.11'})[0].sourceMatches,false);
const native={Total_Service_Revenue_MZN:'1315383',IVA_Tax_MZN:'181432.14',Cost_Deduction_MZN:'0',Service_Revenue_For_Sharing_MZN:'1133950.86',Sharing_Rate:'.25',Distribution_Ratio:'1',...p};
// The source accepts ordinary decimal strings only, with no implicit coercion.
eq(printedTruncatedRevenueCompatibility(native),[]);native.Sharing_Rate='0.25';eq(printedTruncatedRevenueCompatibility(native),['REVENUE_TRUNCATE_WHT_HALF_UP','REVENUE_TRUNCATE_WHT_HALF_EVEN']);
for(const bad of [{...native,Remuneration_Provider_MZN:'283487.72'},{...native,Partner_Revenue_MZN:'255138.95'},{...native,Sharing_Rate:'0'},{...native,Distribution_Ratio:'1.1'},{...native,WHT_MZN:null}])eq(printedTruncatedRevenueCompatibility(bad),[]);
console.log(`USD reference-only arithmetic: ${n} assertions passed; exact captured/printed alternatives, no tolerance or operational FX`);
