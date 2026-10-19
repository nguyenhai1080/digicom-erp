import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
import {revenueAmounts,nativeAmount} from './revenue-money.js';
import type {InvoiceLine} from './invoice-template.js';
type Source={id:string;currency:string;serviceId:string;contractId:string;reconciliationId:string;service:{serviceName:string};calculationJson:unknown};
// DGC v61 40_Invoice_Core: expand children for presentation, bill TOTAL once.
// 80_Audit_Integrity: reconcile the last detail to each authoritative group total.
export function dgcInvoiceLines(header:Source,candidates:Source[],period:string):InvoiceLine[]{
 const h=header.calculationJson as any;
 if(h?.rowType!=='TOTAL'||h?.includeInMonthlyTotal!==true)throw new CommandError(409,'Nguồn Invoice DGC phải là dòng tổng được tính doanh thu.');
 const children=candidates.filter(r=>{const j=r.calculationJson as any;return r.currency===header.currency&&r.reconciliationId===header.reconciliationId&&j?.parentServiceId===header.serviceId&&['CHILD','DETAIL'].includes(j?.rowType)&&j?.includeInMonthlyTotal===false;}).sort((a,b)=>((a.calculationJson as any).lineNo??0)-((b.calculationJson as any).lineNo??0)||a.id.localeCompare(b.id));
 const month=new Date(period+'-01T00:00:00Z').toLocaleString('en',{month:'long',year:'numeric',timeZone:'UTC'});
 const lines=(children.length?children:[header]).map(r=>{
  const j=r.calculationJson as any,a=revenueAmounts(r);
  return {revenueId:r.id,serviceId:r.serviceId,serviceName:r.service.serviceName,groupServiceId:header.serviceId,contractId:r.contractId,description:'Revenue for '+r.service.serviceName+' service in '+month,revenue:nativeAmount(a.revenue,r.currency),wht:nativeAmount(a.wht,r.currency),payable:nativeAmount(a.payable,r.currency),uploadId:j.uploadId,lineNo:j.lineNo};
 });
 const totals=revenueAmounts(header),last=lines.at(-1)!;
 for(const field of ['revenue','wht','payable'] as const){const sum=lines.reduce((s,l)=>s.plus(l[field]),new Prisma.Decimal(0));last[field]=nativeAmount(new Prisma.Decimal(last[field]).plus(new Prisma.Decimal(totals[field]).minus(sum)),header.currency);}
 if(lines.some(l=>['revenue','wht','payable'].some(f=>new Prisma.Decimal(l[f as 'revenue']).lt(0))))throw new CommandError(409,'Chi tiết Invoice DGC bị âm sau đối chiếu với tổng; kiểm tra nguồn đối soát.');
 return lines;
}

export function dgcInvoiceNumber(date:string,sequence:bigint){
 if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||new Date(date).toISOString().slice(0,10)!==date||sequence<1n)throw new CommandError(400,'Ngày hoặc số thứ tự Invoice DGC không hợp lệ.');
 return sequence.toString().padStart(2,'0')+'/'+date.slice(5,7)+'/'+date.slice(0,4)+'/DGC-INV';
}
