import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';

export const D=(v:string|number|Prisma.Decimal)=>new Prisma.Decimal(v);
export const reportingRate=(period:string,original:string|null|undefined,rates:Map<string,{rate:string}>)=>rates.get(period)?.rate??original??null;
export function nativeAmount(v:string|Prisma.Decimal,currency:string){return D(v).toDecimalPlaces(currency==='VND'?0:2,Prisma.Decimal.ROUND_HALF_UP).toFixed(currency==='VND'?0:2);}
export function revenueAmounts(row:{currency?:string;netAmount?:Prisma.Decimal;calculationJson:unknown}){
 const j=row.calculationJson as any;
 return {currency:row.currency??'USD',revenue:j?.nativeRevenue??j?.invoiceRevenueUsd,wht:j?.nativeWht??j?.invoiceWhtUsd,payable:j?.nativePayable??j?.invoicePayableUsd??row.netAmount?.toFixed()??'0',fxRate:j?.reportingFxRate??null};
}
export function equivalents(amount:string|Prisma.Decimal,currency:string,rate?:string|null){
 if(!['USD','VND'].includes(currency))throw new CommandError(422,'Chỉ hỗ trợ USD và VND.');
 if(rate&&(!D(rate).gt(0)||D(rate).gte('1000000000000')))throw new CommandError(422,'Tỷ giá VND/USD không hợp lệ.');
 const a=D(amount),r=rate?D(rate):null;
 return {usd:currency==='USD'?a.toFixed(2):r?a.div(r).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2):null,vnd:currency==='VND'?a.toFixed(0):r?a.mul(r).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed(0):null};
}
export async function reportingRates(tx:Prisma.TransactionClient,companyId:string){
 const rows=await tx.configuration.findMany({where:{companyId,configKey:{startsWith:'REVENUE_FX:'},isSecret:false},take:1200});
 return new Map(rows.map(v=>[v.configKey.slice(11),JSON.parse(v.configValue!) as {rate:string;source:string}]));
}
