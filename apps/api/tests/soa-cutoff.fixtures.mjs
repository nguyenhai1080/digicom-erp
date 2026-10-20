import {randomUUID} from 'node:crypto';
// Synthetic fixtures shared by integration and the explicitly opt-in UI server.
export async function seedSoaCutoff(prisma,companyId,userId){
 const partner=await prisma.partner.create({data:{companyId,partnerCode:'SOA_SYN',partnerKey:'SOA_SYN',legalName:'Synthetic SOA partner',partnerType:'CUSTOMER',status:'ACTIVE'}});
 const invoices=[];
 async function invoice(number,options={}){
  const {currency='USD',amount='100',status='ISSUED',current=true,day='2026-01-10',receipts=[]}=options;
  const paid=receipts.reduce((s,p)=>s+Number(p.amount),0).toString();
  const a=await prisma.attachment.create({data:{companyId,originalFilename:'synthetic.pdf',storedFilename:'synthetic.pdf',storageProvider:'local',storagePath:'unused-soa-fixture.pdf'}}),d=await prisma.document.create({data:{companyId,documentCode:number,documentType:'INVOICE',attachmentId:a.id}});
  const i=await prisma.invoice.create({data:{companyId,partnerId:partner.id,invoiceNumber:number,businessKey:number,invoiceMode:'CONSOLIDATED',period:day.slice(0,7),invoiceDate:new Date(day),dueDate:new Date('2026-03-01'),currency,revenueAmount:amount,whtAmount:'0',payableAmount:amount,paidAmount:paid,status,isCurrent:current,issuedAt:status==='DRAFT'?null:new Date(day),snapshot:{synthetic:true},documentId:d.id,createdById:userId}});
  if(status!=='DRAFT')await prisma.accountReceivable.create({data:{companyId,invoiceId:i.id,originalAmount:amount,paidAmount:paid,outstandingAmount:String(Number(amount)-Number(paid)),status:status==='CANCELLED'?'CANCELLED':Number(paid)===Number(amount)?'PAID':'OPEN'}});
  for(const [n,p] of receipts.entries())await prisma.invoicePayment.create({data:{companyId,invoiceId:i.id,paymentCode:number+'-P'+n,requestId:randomUUID(),requestDigest:'0'.repeat(64),paymentDate:new Date(p.date),paidUsd:currency==='USD'?p.amount:'0',allocationCurrency:currency,allocationAmount:p.amount,cashCurrency:currency,cashAmount:p.amount,paidVnd:currency==='VND'?p.amount:null,fxRate:'1',historicalSource:{reference:'Synthetic cutoff fixture'},swiftNo:'',bankAccount:'',paymentMethod:'Other',note:'Synthetic cutoff fixture',approvedById:userId}});
  invoices.push(i);return i;
 }
 const crossing=await invoice('SOA-01',{status:'PARTIALLY_PAID',receipts:[{date:'2026-01-31',amount:'20'},{date:'2026-02-05',amount:'40'}]});
 for(let n=2;n<=11;n++)await invoice('SOA-'+String(n).padStart(2,'0'),n===2?{status:'PAID',receipts:[{date:'2026-01-10',amount:'100'}]}:{});
 await invoice('SOA-12-VND',{currency:'VND',amount:'1000000',receipts:[{date:'2026-02-01',amount:'100000'}]});
 await invoice('SOA-FUTURE',{day:'2026-02-01'});await invoice('SOA-DRAFT',{status:'DRAFT'});await invoice('SOA-CANCELLED',{status:'CANCELLED'});await invoice('SOA-OLD',{current:false,status:'SUPERSEDED'});
 return {partner,crossing,invoices};
}
