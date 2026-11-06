export type ReportCurrency='USD'|'VND';
export type RevenueSeries={period:string;serviceId:string;total:boolean;payable:string|null;payableVnd:string|null;missingUsd:number;missingVnd:number};
const formatter=new Intl.NumberFormat('vi-VN');
export function moneyUnits(value:string,currency:ReportCurrency){
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value);if(!m)throw Error('Invalid report amount');
 const scale=currency==='USD'?2:0,fraction=(m[3]??'').padEnd(scale+1,'0');
 let result=BigInt(m[2])*10n**BigInt(scale)+BigInt(fraction.slice(0,scale)||'0');
 if(Number(fraction[scale])>=5)result++;
 return m[1]?-result:result;
}
export function formatReportMoney(value:string,currency:ReportCurrency){
 const amount=moneyUnits(value,currency),absolute=amount<0n?-amount:amount;
 return (amount<0n?'-':'')+formatter.format(currency==='USD'?absolute/100n:absolute)+(currency==='USD'?','+(absolute%100n).toString().padStart(2,'0'):'');
}
function decimal(value:bigint,currency:ReportCurrency){const sign=value<0n?'-':'',n=value<0n?-value:value;return sign+(currency==='USD'?(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0'):n.toString());}
export function buildDashboardView(series:RevenueSeries[],services:{id:string;name:string}[],year:string,month:string,service:string,currency:ReportCurrency){
 const select=(y:string)=>series.filter(r=>r.period.startsWith(y+'-')&&r.period.slice(5,7)<=month&&(service==='all'?r.total:r.serviceId===service));
 const current=select(year),previous=select(String(Number(year)-1));
 const missing=(r:RevenueSeries)=>(currency==='USD'?r.payable:r.payableVnd)===null||(currency==='USD'?r.missingUsd:r.missingVnd)>0;
 const units=(r:RevenueSeries)=>moneyUnits((currency==='USD'?r.payable:r.payableVnd)??'0',currency);
 const sum=(rows:RevenueSeries[])=>rows.reduce((n,r)=>n+units(r),0n);
 const periods=[...new Set(current.map(r=>r.period.slice(5,7)))].sort(),priorSame=previous.filter(r=>periods.includes(r.period.slice(5,7)));
 const incomplete=current.some(missing),ready=current.length>0&&!incomplete&&!priorSame.some(missing)&&periods.every(p=>priorSame.some(r=>r.period.slice(5,7)===p));
 const currentSum=sum(current),priorSum=sum(priorSame);
 const monthly=(rows:RevenueSeries[])=>Array.from({length:12},(_,i)=>{const part=rows.filter(r=>Number(r.period.slice(5,7))===i+1);return part.length&&!part.some(missing)?decimal(sum(part),currency):null;});
 const contributions=[...new Set(current.map(r=>r.serviceId))].map(id=>{const rows=current.filter(r=>r.serviceId===id),amount=sum(rows);return {id,name:services.find(s=>s.id===id)?.name??id,amount:rows.some(missing)?null:decimal(amount,currency),share:!incomplete&&currentSum>0n?Number(amount)/Number(currentSum)*100:null,sort:amount};}).sort((a,b)=>a.sort===b.sort?a.name.localeCompare(b.name):a.sort>b.sort?-1:1).map(({sort,...r})=>r);
 return {hasData:current.length>0,periods,incomplete,ready,sum:incomplete?null:decimal(currentSum,currency),priorSum:ready?decimal(priorSum,currency):null,change:ready&&priorSum!==0n?Number(currentSum-priorSum)/Number(priorSum)*100:null,monthly:monthly(current),previousMonthly:monthly(previous),contributions};
}
