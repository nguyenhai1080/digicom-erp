import {revenueAmounts,nativeAmount} from './revenue-money.js';
import {Prisma} from '@erp/db';
import type {InvoiceLine} from './invoice-template.js';
type Source={currency?:string;id:string;serviceId:string;contractId:string;service:{serviceName:string};calculationJson:unknown};
// Owner override: bill and print parent TOTAL only, never expand CHILD on Invoice.
export function invoiceParentLines(rows:Source[],period:string):InvoiceLine[]{
 return rows.filter(v=>{const j=v.calculationJson as any;return j?.rowType==='TOTAL'&&j?.includeInMonthlyTotal===true;}).map(v=>{
  const j=v.calculationJson as any,a=revenueAmounts(v),amount=(s:string)=>nativeAmount(s,a.currency);
  return {revenueId:v.id,serviceId:v.serviceId,serviceName:v.service.serviceName,groupServiceId:v.serviceId,contractId:v.contractId,description:v.service.serviceName+' · '+period,revenue:amount(a.revenue),wht:amount(a.wht),payable:amount(a.payable),uploadId:j.uploadId,lineNo:j.lineNo};
 });
}
