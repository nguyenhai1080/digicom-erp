import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
const D=(v:string)=>new Prisma.Decimal(v),round=(d:Prisma.Decimal)=>d.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
// Deployed v61 53_InputRecon_AP:174-185: round foreign share BEFORE FX;
// tax is a deduction; WHT is explicitly zero in contract-driven generation.
export function calculateInputRecon(baseUsd:string,shareRate:string,fxRate:string,taxRate:string,currency:string){
 const base=round(D(baseUsd)),share=D(shareRate),fx=D(fxRate),tax=D(taxRate);
 if(!['USD','VND'].includes(currency)||!base.gt(0)||!share.gt(0)||share.gt(1)||!fx.gt(0)||tax.lt(0)||tax.gt(1)||currency==='USD'&&!fx.eq(1))throw new CommandError(409,'Cần cơ sở USD dương, tỷ lệ 0–1 và tỷ giá đúng tiền tệ USD/VND.');
 const foreign=round(base.mul(share)),local=round(foreign.mul(fx)),taxAmount=round(local.mul(tax)),payable=round(local.minus(taxAmount));
 if(!payable.gt(0)||[base,foreign,local,taxAmount,payable].some(d=>d.gte('1000000000000000000')))throw new CommandError(409,'Khoản phải trả phải dương và trong giới hạn lưu trữ.');
 return {baseUsd:base.toFixed(2),shareRate:share.toFixed(),foreignAmount:foreign.toFixed(2),fxRate:fx.toFixed(),localAmount:local.toFixed(2),taxRate:tax.toFixed(),taxAmount:taxAmount.toFixed(2),whtAmount:'0.00',payableAmount:payable.toFixed(2),currency};
}
