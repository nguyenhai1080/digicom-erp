import assert from 'node:assert/strict';
import {planGstFx} from './dgc-gst-fx-plan.mjs';
const row=(period,rate='25000',source='Synthetic source')=>({period,rate,source,approvedById:'MUST_NOT_COPY'});
const capture=(companyCode,items)=>({companyCode,url:companyCode==='GST'?'https://erp.gsttech.vn/api/v1/revenue-fx':'https://erp.digicomjsc.com/api/v1/revenue-fx',capturedAt:'2026-11-06T00:00:00Z',response:{items}});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=fn=>{assert.throws(fn);checks++;};
const source=capture('GST',[row('2026-03','25001.125'),row('2026-02','25000.0000'),row('2026-01','24501')]),target=capture('DGC',[row('2026-01','25100'),row('2026-02','25000')]);
const before=JSON.stringify({source,target}),p=planGstFx(source,target);
eq(p.additions.map(r=>[r.period,r.rate]),[['2026-03','25001.125']]);eq(p.same,['2026-02']);eq(p.conflicts,[{period:'2026-01',gstRate:'24501',dgcRate:'25100',action:'KEEP_DGC'}]);eq(p.direction,'VND_PER_USD');eq(p.october2026Available,false);eq(p.additions[0].source.includes('ERP GST'),true);eq(p.additions[0].source.endsWith('Synthetic source'),true);eq(JSON.stringify(p).includes('MUST_NOT_COPY'),false);eq(JSON.stringify({source,target}),before);
for(const rate of ['0','-1','0.00004','2.5e4','25,000','25000.123456789'])reject(()=>planGstFx(capture('GST',[row('2026-03',rate)]),target));
reject(()=>planGstFx(capture('GST',[row('2026-03'),row('2026-03')]),target));reject(()=>planGstFx(capture('GST',[row('2026-13')]),target));reject(()=>planGstFx(capture('GST',[row('2026-03','25000','x'.repeat(490))]),target));reject(()=>planGstFx({...source,companyCode:'DGC'},target));reject(()=>planGstFx(source,{...target,url:'https://erp.gsttech.vn/api/v1/revenue-fx'}));
const replay=planGstFx(source,capture('DGC',[...target.response.items,...p.additions]));eq(replay.additions,[]);eq(replay.conflicts,p.conflicts);
console.log('PASS: '+checks+' GST-to-DGC rate planning checks; exact decimals, no inverse/fallback, conflict preservation, replay, provenance and no source actor copied.');

