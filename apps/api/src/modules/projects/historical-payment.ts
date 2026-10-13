import {Prisma} from '@erp/db';
import {z} from 'zod';
import {CommandError,date,timestamp} from './commands.js';

const amount=z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/);
export const historicalPaymentSchema=z.object({
 mode:z.literal('HISTORICAL'),requestId:z.uuid(),expectedUpdatedAt:timestamp,paymentDate:date,
 allocationAmount:amount,cashCurrency:z.enum(['USD','VND']),cashAmount:amount,
 conversionRate:z.string().regex(/^[1-9]\d{0,11}(\.\d{1,4})?$/).optional(),
 sourceReference:z.string().trim().min(10).max(1000),dateBasis:z.enum(['SOURCE','PERIOD_END_PLUS_60']),
 bankAccount:z.string().trim().max(200).default(''),note:z.string().trim().max(2000).default(''),confirmed:z.literal(true),
}).strict();
const D=(v:string)=>new Prisma.Decimal(v);
export function historicalPaymentDate(period:string,paymentDate:string,basis:string){
 if(basis==='PERIOD_END_PLUS_60'){
  const [year,month]=period.split('-').map(Number),expected=new Date(Date.UTC(year,month,0)+60*86400000).toISOString().slice(0,10);
  if(paymentDate!==expected)throw new CommandError(409,'Ngày thanh toán lịch sử phải là ngày cuối kỳ doanh thu cộng 60 ngày: '+expected+'.');
 }
}
export function historicalPaymentAmounts(total:string,paid:string,next:string,currency:string,cash:string,cashCurrency:string,rate?:string){
 const original=D(total),old=D(paid),allocation=D(next),receipt=D(cash);
 if(!['USD','VND'].includes(currency)||!['USD','VND'].includes(cashCurrency)||!original.gt(0)||old.lt(0)||old.gt(original)||!allocation.gt(0)||allocation.gt(original.minus(old))||!receipt.gt(0))throw new CommandError(409,'Số thanh toán lịch sử vượt số còn phải thu hoặc không hợp lệ.');
 if(currency==='VND'&&!allocation.isInteger()||cashCurrency==='VND'&&!receipt.isInteger())throw new CommandError(400,'Số VND phải là số nguyên.');
 const fx=rate?D(rate):null;
 if(currency===cashCurrency){if(!allocation.eq(receipt))throw new CommandError(409,'Tiền đã nhận và số giảm công nợ cùng tiền tệ phải khớp.');}
 else{
  if(!fx?.gt(0))throw new CommandError(400,'Cần tỷ giá quy đổi để phân bổ thanh toán khác tiền tệ.');
  const converted=currency==='VND'?receipt.mul(fx).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP):receipt.div(fx).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
  if(!converted.eq(allocation))throw new CommandError(409,'Số phân bổ không khớp tiền gốc và tỷ giá quy đổi lịch sử.');
 }
 const paidAfter=old.plus(allocation),outstanding=original.minus(paidAfter);
 return {paidAfter,outstanding,status:outstanding.isZero()?'PAID' as const:'PARTIALLY_PAID' as const,rate:fx};
}
