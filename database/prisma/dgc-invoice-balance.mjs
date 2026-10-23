import {Prisma} from '@prisma/client';
const Decimal=Prisma.Decimal.clone({precision:120}),D=v=>new Decimal(String(v)),fields=['revenue','wht','payable'];
const valid=v=>['number','string'].includes(typeof v)&&/^\d+(?:\.\d+)?$/.test(String(v))&&String(v).length<40&&D(v).lt('1000000000000')&&D(v).decimalPlaces()<=2;
const compareKey=(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
const round2=v=>Math.round((v+Number.EPSILON)*100)/100;

// Transcription, never evaluation, of donor v61 40_Invoice_Core:630-689 and
// 80_Audit_Integrity:549-563. Three independent components; last child only.
// Zero fill/coercion of missing or invalid source values is deliberately refused.
export function replayDonorInvoiceBalance(total,children){
 if(!total||!fields.every(f=>valid(total[f]))||!Array.isArray(children)||!children.length||children.length>10000)throw Error('Invalid captured Invoice balance inputs');
 const ordered=children.map(c=>{if(typeof c?.orderKey!=='string'||!c.orderKey.trim()||c.orderKey.length>500||!fields.every(f=>valid(c[f])))throw Error('Invalid captured Invoice child');return {...c};}).sort((a,b)=>compareKey(a.orderKey,b.orderKey));
 if(ordered.some((c,i)=>i&&compareKey(c.orderKey,ordered[i-1].orderKey)===0))throw Error('Ambiguous donor child order');
 const sums=Object.fromEntries(fields.map(f=>[f,ordered.reduce((n,c)=>n+round2(Number(c[f])),0)]));
 const exactSums=Object.fromEntries(fields.map(f=>[f,ordered.reduce((n,c)=>n.plus(c[f]),D(0))]));
 const last=ordered.length-1,lines=ordered.map((c,i)=>{
  const before=Object.fromEntries(fields.map(f=>[f,D(c[f]).toFixed()]));
  const after=Object.fromEntries(fields.map(f=>[f,String(i===last?round2(round2(Number(c[f]))+round2(round2(Number(total[f]))-sums[f])):round2(Number(c[f])))]));
  if(fields.some(f=>D(after[f]).lt(0)))throw Error('Donor balancing produces a negative component');
  const decimalAfter=Object.fromEntries(fields.map(f=>[f,(i===last?D(c[f]).plus(D(total[f]).minus(exactSums[f])):D(c[f])).toFixed()]));
  return {orderKey:c.orderKey,before,after,delta:Object.fromEntries(fields.map(f=>[f,D(after[f]).minus(before[f]).toFixed()])),numberAndDecimalAgree:fields.every(f=>after[f]===decimalAfter[f])};
 });
 return {recipe:'V61_GROUP_LAST_CHILD_INDEPENDENT_COMPONENT_BALANCE',total:Object.fromEntries(fields.map(f=>[f,D(total[f]).toFixed()])),lines,numberAndDecimalAgree:lines.every(l=>l.numberAndDecimalAgree),totalsMatch:fields.every(f=>lines.reduce((n,c)=>n.plus(c.after[f]),D(0)).eq(total[f]))};
}

export {valid as validInvoiceBalanceMoney};
