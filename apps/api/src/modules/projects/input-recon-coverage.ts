import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';

export async function inputContractCoverage(tx:Prisma.TransactionClient,companyId:string,contractId:string,period:string,outputPartnerId:string){
 const fail=(message:string):never=>{throw new CommandError(409,message);};
 const start=new Date(period+'-01'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
 const links=await tx.contractService.findMany({where:{companyId,contractId,status:'ACTIVE',dgcStatus:'ACTIVE',contract:{companyId,dgcDirection:'Input'},service:{companyId},AND:[{OR:[{effectiveFrom:null},{effectiveFrom:{lte:end}}]},{OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]}]},include:{service:true},take:101});
 if(!links.length||links.length>100)fail('Cần 1–100 liên kết dịch vụ đầu vào có hiệu lực để lập đủ hợp đồng.');
 const services=[...new Map(links.map(l=>[l.serviceId,l.service])).values()],linked=new Set(services.map(s=>s.id));
 const candidates=await tx.revenue.findMany({where:{companyId,isCurrent:true,partnerId:outputPartnerId,periodStart:start,status:{in:['INVOICE_READY','INVOICED','PARTIALLY_PAID','PAID']},reconciliation:{companyId,isCurrent:true,status:'APPROVED'}},select:{id:true,serviceId:true,calculationJson:true},orderBy:{id:'asc'},take:1001});
 if(candidates.length>1000)fail('Vượt giới hạn nguồn doanh thu của kỳ.');
 const relationships=await tx.serviceRelationship.findMany({where:{companyId,relationshipType:{in:['INCLUDED','AGGREGATED','BUNDLED']},AND:[{OR:[{parentServiceId:{in:[...linked]}},{childServiceId:{in:[...linked]}}]}],effectiveFrom:{lte:end},OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]},take:1001});
 if(relationships.length>1000)fail('Vượt giới hạn quan hệ dịch vụ.');
 let edges=relationships.map(r=>({parent:r.parentServiceId,child:r.childServiceId}));
 for(const r of candidates){const j=r.calculationJson as any;if(j?.rowType==='CHILD'&&j.includeInMonthlyTotal===false&&typeof j.parentServiceId==='string'&&(linked.has(j.parentServiceId)||linked.has(r.serviceId)))edges.push({parent:j.parentServiceId,child:r.serviceId});}
 edges=[...new Map(edges.map(e=>[e.parent+'|'+e.child,e])).values()];
 const parents=new Set<string>();
 for(const e of edges){if(!linked.has(e.child))fail('Hợp đồng có dịch vụ tổng nhưng thiếu liên kết tường minh cho dịch vụ con. Cần hoàn thiện hợp đồng, không cộng dòng tổng với chi tiết.');if(e.parent===e.child)fail('Quan hệ dịch vụ không hợp lệ.');parents.add(e.parent);}
 const leaves=services.filter(s=>!parents.has(s.id));if(!leaves.length)fail('Quan hệ dịch vụ không xác định được các dòng chi tiết.');
 // Reject cycles instead of silently treating one side of a cycle as a total.
 for(const service of services){const seen=new Set<string>(),visit=(id:string)=>{if(seen.has(id))fail('Quan hệ dịch vụ có vòng lặp.');seen.add(id);for(const e of edges.filter(e=>e.parent===id))visit(e.child);seen.delete(id);};visit(service.id);}
 const sources=candidates.filter(r=>leaves.some(s=>s.id===r.serviceId)),excluded=candidates.filter(r=>parents.has(r.serviceId));
 if(sources.length>100)fail('Hợp đồng/kỳ vượt 100 nguồn; cần kiểm tra phạm vi trước khi lập biên bản.');
 const missing=leaves.filter(s=>!sources.some(r=>r.serviceId===s.id));
 if(missing.length)fail('Chưa đủ dịch vụ của hợp đồng kỳ '+period+': '+missing.map(s=>s.serviceKey).join(', ')+'. Cần chốt nguồn đầu ra; không lập biên bản từng phần.');
 const parentServices=parents.size?await tx.service.findMany({where:{companyId,id:{in:[...parents]}},select:{id:true,serviceKey:true},take:1001}):[];
 if(parentServices.length!==parents.size)fail('Không xác định được dịch vụ tổng trong cùng công ty.');
 if(parents.size&&await tx.inputReconciliation.findFirst({where:{companyId,inputContractId:contractId,period,outputPartnerId,serviceId:{in:[...parents]},payable:{isNot:null}}}))fail('Dòng tổng đã có công nợ phải trả. Cần xử lý công nợ trùng trước khi lập theo dịch vụ con; hệ thống không tự sửa số tiền cũ.');
 return {sources,excludedSourceIds:excluded.map(r=>r.id),excludedServiceIds:[...parents],excludedServices:parentServices.map(s=>s.serviceKey).sort()};
}
export async function inputContractSources(tx:Prisma.TransactionClient,companyId:string,contractId:string,period:string,outputPartnerId:string){return (await inputContractCoverage(tx,companyId,contractId,period,outputPartnerId)).sources;}
