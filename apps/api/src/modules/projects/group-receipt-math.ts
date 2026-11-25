import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
const D=(s:string)=>new Prisma.Decimal(s);
// Exact largest-remainder apportionment in integer cents/dong, independent of JS floats.
export function distributeReceipt(total:string,places:number,rows:{id:string;amount:string}[]){
 const units=(v:string,p:number)=>BigInt(D(v).mul(p===2?100:1).toFixed(0));
 const target=units(total,places),weights=rows.map(r=>({id:r.id,weight:units(r.amount,2)})),sum=weights.reduce((a,r)=>a+r.weight,0n);
 if(target<0n||sum<=0n||weights.some(r=>r.weight<=0n))throw new CommandError(400,'Số phân bổ không hợp lệ.');
 const parts=weights.map(r=>({id:r.id,units:target*r.weight/sum,remainder:target*r.weight%sum}));
 let left=target-parts.reduce((a,r)=>a+r.units,0n);
 for(const p of [...parts].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1)){if(left===0n)break;p.units++;left--;}
 return new Map(parts.map(r=>[r.id,places===2?(r.units/100n).toString()+'.'+(r.units%100n).toString().padStart(2,'0'):r.units.toString()]));
}
export function receiptTotals(grossUsd:string,feeUsd:string,cashCurrency:string,cashAmount:string,fxRate?:string){
 const gross=D(grossUsd),fee=D(feeUsd),cash=D(cashAmount),fx=fxRate?D(fxRate):null;
 if(!gross.gt(0)||fee.lt(0)||fee.gte(gross)||!cash.gt(0))throw new CommandError(409,'Tổng USD/phí/tiền thực nhận không hợp lệ.');
 if(cashCurrency==='USD'&&fxRate)throw new CommandError(400,'Nhận USD không nhập tỷ giá VND.');
 if(cashCurrency==='VND'&&(!fx?.gt(0)||!cash.isInteger()))throw new CommandError(400,'Nhận VND cần số nguyên và tỷ giá dương.');
 const expected=cashCurrency==='USD'?gross.minus(fee):gross.minus(fee).mul(fx!).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP);
 if(!cash.eq(expected))throw new CommandError(409,'Tiền thực nhận sau phí phải bằng '+expected.toFixed(cashCurrency==='USD'?2:0)+' '+cashCurrency+'.');
 return {gross,fee,cash,fx};
}
