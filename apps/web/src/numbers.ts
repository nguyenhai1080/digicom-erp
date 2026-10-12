// Format canonical decimal strings without losing precision in large balances.
export function formatNumber(value:unknown,minimumFractionDigits=2,maximumFractionDigits=minimumFractionDigits):string{
 if(value===null||value===undefined||value==='')return '—';
 const raw=String(value),match=raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
 if(!match){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('vi-VN',{minimumFractionDigits,maximumFractionDigits}).format(n):'—';}
 const decimals=match[3]??'',scale=10n**BigInt(maximumFractionDigits);
 let scaled=BigInt(match[2])*scale+BigInt((decimals.slice(0,maximumFractionDigits).padEnd(maximumFractionDigits,'0'))||'0');
 if(Number(decimals[maximumFractionDigits]??'0')>=5)scaled++;
 const integer=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(scaled/scale);
 let fraction=maximumFractionDigits?(scaled%scale).toString().padStart(maximumFractionDigits,'0'):'';
 while(fraction.length>minimumFractionDigits&&fraction.endsWith('0'))fraction=fraction.slice(0,-1);
 return (match[1]&&scaled!==0n?'-':'')+integer+(fraction?','+fraction:'');
}
export const formatMoney=(value:unknown,currency='USD')=>formatNumber(value,currency==='VND'?0:2);
