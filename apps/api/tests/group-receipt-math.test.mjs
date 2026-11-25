import assert from 'node:assert/strict';
import {Prisma} from '@erp/db';
import {distributeReceipt,receiptTotals} from '../dist/modules/projects/group-receipt-math.js';
const D=v=>new Prisma.Decimal(v);let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
const rows=[{id:'a',amount:'1000'},{id:'b',amount:'2000'},{id:'c',amount:'3000'},{id:'d',amount:'8430.23'}];
eq(receiptTotals('14430.23','10','VND','367715865','25500').gross.toString(),'14430.23');
for(const [total,p] of [['10',2],['367715865',0],['0.01',2],['0',2]]){const split=distributeReceipt(total,p,rows);eq([...split.values()].reduce((a,b)=>a.plus(b),D(0)).toString(),D(total).toString());eq([...split.entries()], [...distributeReceipt(total,p,[...rows].reverse()).entries()].reverse());}
eq([...distributeReceipt('0.01',2,[{id:'b',amount:'.01'},{id:'a',amount:'.01'}])],[['b','0.00'],['a','0.01']]);
for(let k=2;k<=50;k++){const r=Array.from({length:k},(_,i)=>({id:String(i).padStart(2,'0'),amount:((i+1)*.01).toFixed(2)})),s=distributeReceipt('10000000000000.99',2,r);eq([...s.values()].reduce((a,b)=>a.plus(b),D(0)).toFixed(2),'10000000000000.99');}
for(const args of [['14430.23','10','VND','367715864','25500'],['10','10','USD','0'],['10','-1','USD','11'],['10','0','VND','10'],['10','0','USD','10','1']]){assert.throws(()=>receiptTotals(...args));n++;}
console.log('PASS: '+n+' group receipt exact integer apportionment and total/fee/FX checks.');
