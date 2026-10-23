import {Prisma} from '@erp/db';
import {D,equivalents,revenueAmounts,reportingRate} from './revenue-money.js';
type Row={currency?:string;periodStart:Date;serviceId:string;service:{serviceName:string};netAmount:Prisma.Decimal;calculationJson:unknown};
// DGC TOTAL/CHILD rule is retained. Never sum native USD and VND together.
export function dashboardSummary(rows:Row[],rates=new Map<string,{rate:string}>()){
 const buckets=new Map<string,any>(),services=new Map<string,string>();let nativeUsd=D(0),nativeVnd=D(0),usd=D(0),vnd=D(0),missingUsd=0,missingVnd=0;
 for(const r of rows){const j=r.calculationJson as any,total=j?.rowType==='TOTAL'&&j?.includeInMonthlyTotal===true;if(!total&&!(j?.rowType==='CHILD'&&j?.includeInMonthlyTotal===false))continue;
  const period=r.periodStart.toISOString().slice(0,7),a=revenueAmounts(r),rate=reportingRate(period,a.fxRate,rates),key=period+'|'+r.serviceId+'|'+total;
  services.set(r.serviceId,r.service.serviceName);const p=equivalents(r.netAmount,a.currency,rate);
  if(total){if(a.currency==='USD')nativeUsd=nativeUsd.plus(r.netAmount);else nativeVnd=nativeVnd.plus(r.netAmount);if(p.usd===null)missingUsd++;else usd=usd.plus(p.usd);if(p.vnd===null)missingVnd++;else vnd=vnd.plus(p.vnd);}
  if(!buckets.has(key))buckets.set(key,{period,serviceId:r.serviceId,total,revenue:D(0),wht:D(0),payable:D(0),revenueVnd:D(0),whtVnd:D(0),payableVnd:D(0),missingUsd:0,missingVnd:0});const b=buckets.get(key);
  for(const field of ['revenue','wht','payable'] as const){const e=equivalents(a[field],a.currency,rate);if(e.usd!==null)b[field]=b[field].plus(e.usd);if(e.vnd!==null)b[field+'Vnd']=b[field+'Vnd'].plus(e.vnd);}
  if(p.usd===null)b.missingUsd++;if(p.vnd===null)b.missingVnd++;
 }
 const fixed=(n:Prisma.Decimal)=>n.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
 return {totalPayableUsd:fixed(nativeUsd),nativeTotals:{USD:fixed(nativeUsd),VND:nativeVnd.toFixed(0)},totals:{usd:missingUsd?null:fixed(usd),vnd:missingVnd?null:vnd.toFixed(0),missingUsd,missingVnd},services:[...services].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),series:[...buckets.values()].map(b=>({...b,revenue:b.missingUsd?null:fixed(b.revenue),wht:b.missingUsd?null:fixed(b.wht),payable:b.missingUsd?null:fixed(b.payable),revenueVnd:b.missingVnd?null:b.revenueVnd.toFixed(0),whtVnd:b.missingVnd?null:b.whtVnd.toFixed(0),payableVnd:b.missingVnd?null:b.payableVnd.toFixed(0)}))};
}
