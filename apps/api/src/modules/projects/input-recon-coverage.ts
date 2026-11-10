import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';

// A native statement is a contract/period unit, never a selected subset of services.
export async function inputContractSources(tx:Prisma.TransactionClient,companyId:string,contractId:string,period:string,outputPartnerId:string){
 const start=new Date(period+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
 const links=await tx.contractService.findMany({where:{companyId,contractId,status:'ACTIVE',dgcStatus:'ACTIVE',contract:{companyId,dgcDirection:'Input'},service:{companyId},AND:[{OR:[{effectiveFrom:null},{effectiveFrom:{lte:end}}]},{OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]}]},include:{service:true},take:101});
 if(!links.length||links.length>100)throw new CommandError(409,'Cần 1–100 liên kết dịch vụ đầu vào có hiệu lực để lập đủ hợp đồng.');
 const services=[...new Map(links.map(l=>[l.serviceId,l.service])).values()];
 const sources=await tx.revenue.findMany({where:{companyId,isCurrent:true,partnerId:outputPartnerId,periodStart:start,serviceId:{in:services.map(s=>s.id)},status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'}},select:{id:true,serviceId:true},orderBy:{id:'asc'},take:101});
 if(sources.length>100)throw new CommandError(409,'Hợp đồng/kỳ vượt 100 nguồn; cần kiểm tra phạm vi trước khi lập biên bản.');
 const missing=services.filter(s=>!sources.some(r=>r.serviceId===s.id));
 if(missing.length)throw new CommandError(409,'Chưa đủ dịch vụ của hợp đồng kỳ '+period+': '+missing.map(s=>s.serviceKey).join(', ')+'. Cần chốt nguồn đầu ra; không lập biên bản từng phần.');
 return sources;
}
