import assert from 'node:assert/strict';
import {planReconPostings} from '../dist/modules/projects/recon-postings.js';
import {parseReconFinancial} from '../dist/modules/projects/recon-financial.js';
import {singleText,bundleText} from './recon-financial.characterization.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const text=singleText.replaceAll('TESTSERVICE','MEUBEAT_(CRBT)').replace('1 MEUBEAT_(CRBT)','1 CRBT');
const f=parseReconFinancial(text),before=JSON.stringify(f),binding=lineNo=>({lineNo,serviceId:'crbt',contractId:'contract',contractServiceId:'link'}),bindings=f.details.map(d=>binding(d.lineNo));
eq(f.details.map(d=>d.rowType),['CHILD','TOTAL']);
const plan=planReconPostings(f.details,bindings,'crbt');eq(plan.errors,[]);eq(plan.postings.map(b=>b.lineNo),[2]);eq(plan.references,[{lineNo:1,totalLineNo:2,serviceId:'crbt'}]);eq(JSON.stringify(f),before);
for(const field of ['totalServiceRevenue','ivaTax','serviceRevenueForSharing','remunerationProvider','wht','partnerRevenue','costDeduction']){
 const rows=structuredClone(f.details);rows[0][field]='999.99';eq(planReconPostings(rows,bindings,'crbt').errors.length,1);
}
const usd=structuredClone(f.details);usd[0].usd.partnerRevenue='999.99';eq(planReconPostings(usd,bindings,'crbt').errors.length,1);
eq(planReconPostings(f.details,bindings,'other-parent').errors.length,1);
eq(planReconPostings(f.details,[binding(1),{...binding(2),contractId:'other-contract'}],'crbt').errors.length,1);
eq(planReconPostings(f.details,[binding(1),{...binding(2),contractServiceId:'other-link'}],'crbt').errors.length,1);
const repeated=structuredClone(f.details);repeated[1].rowType='CHILD';eq(planReconPostings(repeated,bindings,'crbt').errors.length,1);
const repeatedIds=structuredClone(f.details);repeatedIds[1].lineNo=1;eq(planReconPostings(repeatedIds,bindings,'crbt').errors.length>0,true);
const bundle=parseReconFinancial(bundleText),bundleBindings=bundle.details.map(d=>({...binding(d.lineNo),serviceId:d.serviceName}));eq(planReconPostings(bundle.details,bundleBindings,'MCAVM-ISIGN').postings.length,bundle.details.length);
const invalid=structuredClone(f.details);invalid[0].usd.partnerRevenue='invalid';eq(planReconPostings(invalid,bindings,'crbt').errors.length,1);
console.log('PASS: '+checks+' posting-plan assertions; exact single-service alias collapse, immutable evidence, unequal/ambiguous rows blocked, distinct child services preserved.');
