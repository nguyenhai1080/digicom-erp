import assert from 'node:assert/strict';
import {calculateInputRecon} from '../dist/modules/projects/input-recon-math.js';
const a=calculateInputRecon('123.45','.4','25000','.1','VND');
assert.equal(a.foreignAmount,'49.38');assert.equal(a.localAmount,'1234500.00');assert.equal(a.taxAmount,'123450.00');assert.equal(a.payableAmount,'1111050.00');assert.equal(a.whtAmount,'0.00');
// 1.23 × .85 = 1.0455 → 1.05; applying FX first would give a different result.
const b=calculateInputRecon('1.23','.85','25001','.1','VND');assert.equal(b.foreignAmount,'1.05');assert.equal(b.localAmount,'26251.05');assert.equal(b.taxAmount,'2625.11');assert.equal(b.payableAmount,'23625.94');
assert.equal(calculateInputRecon('123.45','.4','1','.1','USD').payableAmount,'44.44');
for(const args of [['0','.4','25000','.1','VND'],['1','1.1','1','0','USD'],['1','.4','0','0','VND'],['1','.4','2','0','USD'],['1','.4','1','0','MZN'],['1','.4','1','10','USD'],['.01','.1','1','0','USD']])assert.throws(()=>calculateInputRecon(...args));
console.log('PASS: 17 input reconciliation donor-order, USD/VND, tax deduction, zero WHT and invalid-domain checks.');
