import assert from 'node:assert/strict';
import {fitInvoicePlacement} from '../src/invoice-signing-position.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},near=(a,b)=>{assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);checks++;};
const area={page:2,top:.5,bottom:.8,pageWidth:600,pageHeight:900,imageWidth:300,imageHeight:300},valid={page:2,x:.2,y:.55,width:.2};
eq(fitInvoicePlacement(valid,area),valid);assert.equal(fitInvoicePlacement(valid),valid);checks++;
eq(fitInvoicePlacement({...valid,x:-1,y:-1,page:1},area),{page:2,width:.2,x:0,y:.5});
const bottom=fitInvoicePlacement({...valid,x:2,y:2},area);near(bottom.x,.8);near(bottom.y,2/3);near(bottom.y+bottom.width*600/900,.8);
const large=fitInvoicePlacement({...valid,x:2,y:2,width:.6},area);near(large.width,.45);near(large.x,.55);near(large.y,.5);
const small=fitInvoicePlacement({...valid,width:0},area);near(small.width,.04);
const another=fitInvoicePlacement({...valid,y:0},{...area,top:.6});near(another.y,.6);
for(const [x,y,width] of [[0,0,.04],[1,1,.6],[-2,4,.26],[.7,.7,.3]]){const p=fitInvoicePlacement({page:1,x,y,width},area);assert.ok(p.x>=0&&p.x+p.width<=1+1e-12&&p.y>=area.top&&p.y+p.width*600/900<=area.bottom+1e-12);checks++;}
console.log(`PASS: ${checks} Invoice placement geometry checks: unchanged valid/GST positions, page-specific bounds, drag/resize corners and PDF aspect ratio.`);
