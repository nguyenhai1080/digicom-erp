import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {prisma,Prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {tokenHash} from '../dist/modules/auth/access.js';
import {cutoffAmounts} from '../dist/modules/projects/soa-cutoff-review.js';
import {seedSoaCutoff} from './soa-cutoff.fixtures.mjs';
assert.ok(new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_soa_'));
assert.equal(await prisma.user.count(),0,'Fresh synthetic database required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const companies=await Promise.all(['DGC','GST'].map(companyCode=>prisma.company.create({data:{companyCode,companyName:'Synthetic SOA '+companyCode}})));
const codes=['AR_VIEW','INVOICE_VIEW','INVOICE_PAYMENT_VIEW'],ps=await Promise.all(codes.map(code=>prisma.permission.create({data:{code,name:code,module:'FIXTURE'}})));
async function actor(company,label,permissions){
 const user=await prisma.user.create({data:{companyId:company.id,email:label+'@example.test',fullName:label,passwordHash:'unused'}}),role=await prisma.role.create({data:{companyId:company.id,code:label,name:label,permissions:{create:ps.filter(p=>permissions.includes(p.code)).map(p=>({permissionId:p.id}))}}});
 await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return {user,raw};
}
const reader=await actor(companies[0],'READER',codes),arOnly=await actor(companies[0],'AR_ONLY',['AR_VIEW']),noAr=await actor(companies[0],'NO_AR',codes.slice(1)),noInvoice=await actor(companies[0],'NO_INVOICE',['AR_VIEW','INVOICE_PAYMENT_VIEW']),gst=await actor(companies[1],'GST_READER',codes);
const own=await seedSoaCutoff(prisma,companies[0].id,reader.user.id),foreign=await seedSoaCutoff(prisma,companies[1].id,gst.user.id);
const app=await buildApp({logger:false,auth:{secret:randomBytes(32).toString('hex'),appOrigin:'https://soa.example.test',secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'}});
const path='/api/v1/soa-cutoff-review',url=path+'?partnerId='+own.partner.id+'&asOf=2026-01-31';
async function get(who,url,status=200){const r=await app.inject({method:'GET',url,headers:who?{cookie:'erp_session='+who.raw}:{}});eq(r.statusCode,status);return r.json();}
try{
 await get(null,url,401);for(const who of [arOnly,noAr,noInvoice]){await get(who,url,403);await get(who,path+'/partners',403);}await get(gst,url,404);
 await get(reader,path+'?partnerId='+foreign.partner.id+'&asOf=2026-01-31',404);
 for(const suffix of ['?asOf=2026-01-31','?partnerId='+own.partner.id,'?partnerId='+own.partner.id+'&asOf=2026-02-30','?partnerId='+own.partner.id+'&asOf=2026-01-31&companyId='+companies[1].id])await get(reader,path+suffix,400);
 const before=await Promise.all([prisma.invoice.count(),prisma.accountReceivable.count(),prisma.invoicePayment.count(),prisma.cashEntry.count(),prisma.document.count(),prisma.auditLog.count()]);
 const refs=await get(reader,path+'/partners');eq(refs.items.length,1);eq(refs.items[0].partnerKey,'SOA_SYN');
 const r=await get(reader,url);eq(r.reviewOnly,true);eq(r.cutoffPolicy,'AWAITING_OWNER');eq(r.total,12);eq(r.pageSize,10);eq(r.pages,2);eq(r.items.length,10);eq(r.affectedInvoices,2);
 const first=r.items[0];for(const [k,v] of Object.entries({amount:'100.00',paidThrough:'20.00',paidAfter:'40.00',paidAll:'60.00',remainingThrough:'80.00',remainingAll:'40.00'}))eq(first[k],v);
 eq(r.items.some(i=>i.invoiceNumber==='SOA-02'),true);const usd=r.totals.find(t=>t.currency==='USD');eq(usd.amount,'1100.00');eq(usd.paidThrough,'120.00');eq(usd.paidAfter,'40.00');eq(usd.remainingThrough,'980.00');eq(usd.remainingAll,'940.00');
 const page2=await get(reader,url+'&page=2');eq(page2.items.length,2);eq(page2.totals,r.totals);const vnd=page2.items.find(i=>i.currency==='VND');eq(vnd.remainingThrough,'1000000.00');eq(vnd.remainingAll,'900000.00');
 eq((await get(reader,url+'&page=999')).page,2);eq((await get(reader,path+'?partnerId='+own.partner.id+'&asOf=2025-12-31')).total,0);
 eq((await get(reader,path+'?partnerId='+own.partner.id+'&asOf=2026-02-05')).affectedInvoices,0);
 eq(await Promise.all([prisma.invoice.count(),prisma.accountReceivable.count(),prisma.invoicePayment.count(),prisma.cashEntry.count(),prisma.document.count(),prisma.auditLog.count()]),before);
 await prisma.accountReceivable.update({where:{companyId_invoiceId:{companyId:companies[0].id,invoiceId:own.crossing.id}},data:{paidAmount:'59',outstandingAmount:'41'}});await get(reader,url,409);
 await prisma.accountReceivable.update({where:{companyId_invoiceId:{companyId:companies[0].id,invoiceId:own.crossing.id}},data:{paidAmount:'60',outstandingAmount:'40'}});
 await prisma.invoice.update({where:{id:own.crossing.id},data:{paidAmount:'59'}});await get(reader,url,409);
 await prisma.invoice.update({where:{id:own.crossing.id},data:{paidAmount:'60'}});
 await prisma.accountReceivable.delete({where:{companyId_invoiceId:{companyId:companies[0].id,invoiceId:own.crossing.id}}});await get(reader,url,409);
 const D=v=>new Prisma.Decimal(v),p=(date,amount)=>({paymentDate:new Date(date),allocationAmount:D(amount),allocationCurrency:'USD'});
 const boundary=cutoffAmounts(D('100'),'USD','2026-01-31',[p('2026-02-05','60')]);eq(boundary.remainingThrough,'100.00');eq(boundary.remainingAll,'40.00');
 assert.throws(()=>cutoffAmounts(D('100'),'USD','2026-01-31',[{...p('2026-01-10','10'),allocationCurrency:'VND'}]));checks++;
 const rounding=cutoffAmounts(D('1.005'),'USD','2026-01-31',[]);eq(rounding.amount,'1.01');eq(rounding.remainingAll,'1.01');
 console.log('SOA cutoff review: '+checks+' assertions passed.');
}finally{await app.close();await prisma.$disconnect();}
