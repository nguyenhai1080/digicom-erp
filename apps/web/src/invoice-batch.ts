export type IssueItem={id:string;invoiceNumber:string;payableAmount:string;currency:string;dueDate:string};
export type IssueGroup={id:string;digest:string;items:IssueItem[]};
export async function collectIssueGroups(ids:string[],preview:(id:string)=>Promise<{digest:string;items:IssueItem[]}>):Promise<IssueGroup[]>{
 const covered=new Set<string>(),groups:IssueGroup[]=[];
 for(const id of new Set(ids)){
  if(covered.has(id))continue;
  const plan=await preview(id),itemIds=plan.items.map(i=>i.id);
  if(!itemIds.includes(id)||new Set(itemIds).size!==itemIds.length||itemIds.some(i=>covered.has(i)))throw new Error('Nhóm Invoice đã thay đổi hoặc chồng lặp. Tải lại và kiểm tra trước khi phát hành.');
  groups.push({id,digest:plan.digest,items:plan.items});
  itemIds.forEach(i=>covered.add(i));
 }
 return groups;
}
export async function publishIssueGroups(groups:IssueGroup[],publish:(group:IssueGroup)=>Promise<{items:{id:string}[]}>,progress:(count:number)=>void=()=>{}){
 let completed=0;
 for(const group of groups){
  try{
   const result=await publish(group),actual=result.items.map(i=>i.id).sort(),expected=group.items.map(i=>i.id).sort();
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Kết quả trả về không khớp nhóm Invoice.');
   completed+=actual.length;progress(completed);
  }catch(e){return {completed,failedInvoice:group.items[0].invoiceNumber,error:e instanceof Error?e.message:'Không xác nhận được kết quả phát hành.'};}
 }
 return {completed,error:null,failedInvoice:null};
}
