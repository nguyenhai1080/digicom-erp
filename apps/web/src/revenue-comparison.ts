export type RevenuePoint={period:string;serviceId:string;total:boolean;payable:string|null;payableVnd:string|null;missingUsd:number;missingVnd:number};
export function compareRevenue(series:RevenuePoint[],year:string,service:string,currency:'USD'|'VND'){
 const select=(y:string)=>series.filter(r=>r.period.startsWith(y+'-')&&(service==='all'?r.total:r.serviceId===service));
 const current=select(year),previous=select(String(Number(year)-1));
 const missing=(r:RevenuePoint)=>currency==='USD'?r.missingUsd>0:r.missingVnd>0;
 const cents=(r:RevenuePoint)=>Math.round(Number(currency==='USD'?r.payable:r.payableVnd)*100);
 const monthly=(rows:RevenuePoint[])=>Array.from({length:12},(_,i)=>rows.filter(r=>Number(r.period.slice(5))===i+1).reduce((s,r)=>s+cents(r),0)/100);
 const values=monthly(current),previousValues=monthly(previous);
 // Compare only the same recorded months, never a partial year against a full year.
 const periods=[...new Set(current.map(r=>r.period.slice(5)))].sort();
 const priorSame=previous.filter(r=>periods.includes(r.period.slice(5)));
 const ready=periods.length>0&&!current.some(missing)&&!priorSame.some(missing)&&periods.every(m=>priorSame.some(r=>r.period.slice(5)===m));
 const sum=values.reduce((s,v)=>s+Math.round(v*100),0)/100,priorSum=priorSame.reduce((s,r)=>s+cents(r),0)/100;
 return {current,previous,values,previousValues,periods,sum,priorSum,ready,incomplete:current.some(missing),previousIncomplete:previous.some(missing),change:ready&&priorSum!==0?(sum-priorSum)/priorSum*100:null};
}
