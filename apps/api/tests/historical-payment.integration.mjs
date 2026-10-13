import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';

if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_finance_history_'))throw Error('Use a fresh disposable historical finance acceptance database');
process.env.STORAGE_ROOT=await mkdtemp(resolve(tmpdir(),'erp-history-test-'));
const company=await prisma.company.create({data:{companyCode:'GST',companyName:'Synthetic historical finance test'}}),other=await prisma.company.create({data:{companyCode:'OTHER',companyName:'Other synthetic tenant'}}),marker=randomUUID();
const codes=['PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST','RECON_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','INVOICE_VIEW','INVOICE_CREATE','INVOICE_ISSUE','REVENUE_VIEW','AR_VIEW','SYSTEM_CONFIG_EDIT'];
const permissions=await Promise.all(codes.map(code=>prisma.permission.create({data:{code,name:code,module:'TEST'}})));
const user=await prisma.user.create({data:{companyId:company.id,email:marker+'@example.test',fullName:'Synthetic user',passwordHash:'unused-test-fixture'}});
const role=await prisma.role.create({data:{companyId:company.id,code:'TEST',name:'Synthetic test role',permissions:{create:permissions.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const token=randomBytes(32).toString('hex'),origin='https://history.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'GST'};
await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});
const headers={cookie:'erp_session='+token,origin,'x-csrf-token':csrfToken(token,config.secret)},app=await buildApp({auth:config,logger:false});let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;},post=(url,payload,extra={})=>app.inject({method:'POST',url,payload,headers:{...headers,...extra}}),get=url=>app.inject({method:'GET',url,headers});
const png=await sharp({create:{width:200,height:120,channels:3,background:'#d80000'}}).png().toBuffer(),template=new AdmZip();
template.addFile('[Content_Types].xml',Buffer.from('<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>'));
template.addFile('xl/workbook.xml',Buffer.from('<workbook><sheets><sheet name="Invoice Feb 2019"/></sheets></workbook>'));
template.addFile('xl/sharedStrings.xml',Buffer.from('<sst><si><t>GST Synthetic</t></si></sst>'));
const cells=['B1','C2','C3','C4','C6','C7','C8','C9','C10','C11','C12','C13','B14','C17','D17','D18','D19','C20','C22','C23','C24','C25','C26','C27','D27'];
template.addFile('xl/worksheets/sheet1.xml',Buffer.from('<worksheet><sheetData><row r="1">'+cells.map(ref=>'<c r="'+ref+'" t="s"><v>0</v></c>').join('')+'</row></sheetData></worksheet>'));
template.addFile('xl/media/image1.png',png);template.addFile('xl/vbaProject.bin',Buffer.from('synthetic-preserved-not-executed'));
async function makeInvoice(currency,period,amount){
 const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:currency,partnerKey:currency,legalName:'Synthetic '+currency,partnerType:'CUSTOMER'}}),service=await prisma.service.create({data:{companyId:company.id,serviceCode:currency,serviceKey:currency,serviceName:currency,category:'OTHER',keyword:currency}});
 const contract=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:currency,contractName:'Synthetic agreement',currency,status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:[{companyId:company.id,serviceId:service.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}]}}});
 const draft=await post('/api/v1/manual-revenue/drafts',{partnerId:partner.id,rows:[{period,serviceId:service.id,contractId:contract.id,currency,amount,deduction:'0',note:'Synthetic historical source'}]});check(draft.statusCode,201);
 const rid=draft.json().items[0].id,recon=await prisma.reconciliation.findUniqueOrThrow({where:{id:rid}});check((await post('/api/v1/manual-revenue/'+rid+'/approve',{expectedUpdatedAt:recon.updatedAt.toISOString(),confirmed:true})).statusCode,200);
 const selection={partnerId:partner.id,period,invoiceMode:'PER_SERVICE',currency,invoiceDate:period+'-28',paymentTermDays:30},preview=await post('/api/v1/invoices/preview',selection);check(preview.statusCode,200);
 const plan=preview.json(),created=await post('/api/v1/invoices/create',{...selection,digest:plan.digest,confirmed:true,placements:plan.invoices.map(i=>({businessKey:i.businessKey,placement:{page:1,x:.56,y:.64,width:.28}}))});check(created.statusCode,201);
 const id=created.json().items[0].id,issuePreview=await post('/api/v1/invoices/'+id+'/issue-preview',{});check(issuePreview.statusCode,200);
 const body={digest:issuePreview.json().digest,confirmedHistorical:true,historicalReason:'Synthetic spreadsheet; owner-authorized historical publication'};
 check((await post('/api/v1/invoices/'+id+'/issue',{...body,confirmedHistorical:false})).statusCode,400);
 check((await post('/api/v1/invoices/'+id+'/issue',body,{'x-csrf-token':'invalid'})).statusCode,403);
 check((await post('/api/v1/invoices/'+id+'/issue',body)).statusCode,200);
 const audit=await prisma.auditLog.findFirstOrThrow({where:{entityId:id,action:'INVOICE_ISSUE'}});check(audit.newValue.publicationMode,'HISTORICAL');
 return prisma.invoice.findUniqueOrThrow({where:{id},include:{receivable:true}});
}
try{
 // Exercise the migration against populated legacy USD/VND receipts in a
 // transaction-local shadow table; existing amounts must remain unchanged.
 const migration=await readFile(resolve('../../packages/db/prisma/migrations/20261013103000_historical_invoice_payments/migration.sql'),'utf8');
 await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe("CREATE TEMP TABLE invoice_payments (allocation_currency varchar(3),paid_usd decimal(20,2) NOT NULL,paid_vnd decimal(20,2) NOT NULL,fx_rate decimal(20,8) NOT NULL,CONSTRAINT invoice_payments_positive CHECK(paid_vnd>0)) ON COMMIT DROP");
  await tx.$executeRawUnsafe("INSERT INTO invoice_payments VALUES ('USD',25,650000,26000),('VND',0,800,1)");
  for(const sql of migration.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(sql);
  const rows=await tx.$queryRawUnsafe('SELECT * FROM pg_temp.invoice_payments ORDER BY allocation_currency');
  check(rows.map(r=>[r.allocation_currency,r.paid_usd.toString(),r.paid_vnd.toString(),r.fx_rate.toString(),r.allocation_amount.toString(),r.cash_currency,r.cash_amount.toString()]),[['USD','25','650000','26000','25','VND','650000'],['VND','0','800','1','800','VND','800']]);
 });
 for(const [kind,bytes,filename] of [['SIGNING_COMPOSITE',png,'signing.png'],['INVOICE_TEMPLATE',template.toBuffer(),'template.xlsm']])check((await post('/api/v1/company-assets',{kind,filename,base64:bytes.toString('base64'),expectedCurrentId:null,reason:'Synthetic test asset'})).statusCode,201);
 const inv=await makeInvoice('USD','2024-04','100.00'),url='/api/v1/invoices/'+inv.id+'/payments';
 const body={mode:'HISTORICAL',requestId:randomUUID(),expectedUpdatedAt:inv.updatedAt.toISOString(),paymentDate:'2024-06-29',allocationAmount:'100.00',cashCurrency:'USD',cashAmount:'100.00',sourceReference:'Synthetic workbook, F2 received, G2 date',dateBasis:'SOURCE',note:'No bank or VND amount supplied',confirmed:true};
 check((await post(url,{...body,confirmed:false})).statusCode,400);check((await post(url,{...body,sourceReference:''})).statusCode,400);check((await post(url,{...body,allocationAmount:'100.01',cashAmount:'100.01'})).statusCode,409);
 check((await post(url,body,{'x-csrf-token':'bad'})).statusCode,403);
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables ADD CONSTRAINT test_history_rollback CHECK (paid_amount=0)');
 check((await post(url,body)).statusCode,500);check(await prisma.invoicePayment.count({where:{invoiceId:inv.id}}),0);check((await prisma.invoice.findUniqueOrThrow({where:{id:inv.id}})).paidAmount.toString(),'0');
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables DROP CONSTRAINT test_history_rollback');
 const permission=permissions.find(p=>p.code==='PAYMENT_APPROVE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});check((await post(url,body)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 const raced=await Promise.all([post(url,body),post(url,body)]);check(raced.map(r=>r.statusCode),[200,200]);check(raced[0].json().paymentId,raced[1].json().paymentId);
 const paid=await prisma.invoice.findUniqueOrThrow({where:{id:inv.id},include:{receivable:true}});check(paid.status,'PAID');check(paid.receivable.status,'PAID');check(paid.receivable.outstandingAmount.toString(),'0');check(paid.receivable.paidAmount.toString(),'100');
 const receipt=await prisma.invoicePayment.findFirstOrThrow({where:{invoiceId:inv.id}});check(receipt.paidVnd,null);check(receipt.fxRate,null);check(receipt.bankAccount,'');check(receipt.cashCurrency,'USD');check(receipt.cashAmount.toString(),'100');check(receipt.allocationAmount.toString(),'100');
 check((await get(url)).json().items.length,1);check((await post(url,{...body,requestId:randomUUID(),expectedUpdatedAt:paid.updatedAt.toISOString()})).statusCode,409);
 const sourceIds=paid.snapshot.sourceRevenueIds;check((await prisma.revenue.findMany({where:{id:{in:sourceIds}}})).every(r=>r.status==='PAID'),true);
 const foreign=await prisma.user.create({data:{companyId:other.id,email:'foreign@example.test',fullName:'Foreign',passwordHash:'unused'}});const foreignToken=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:other.id,userId:foreign.id,tokenHash:tokenHash(foreignToken),expiresAt:new Date(Date.now()+3600000)}});const foreignRole=await prisma.role.create({data:{companyId:other.id,code:'FOREIGN',name:'Foreign',permissions:{create:permissions.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:foreign.id,roleId:foreignRole.id}});
 check((await post(url,body,{cookie:'erp_session='+foreignToken,'x-csrf-token':csrfToken(foreignToken,config.secret)})).statusCode,404);
 const vnd=await makeInvoice('VND','2024-05','2035247'),vurl='/api/v1/invoices/'+vnd.id+'/payments';
 const converted={...body,requestId:randomUUID(),expectedUpdatedAt:vnd.updatedAt.toISOString(),allocationAmount:'2035247',cashAmount:'79.87',conversionRate:'25482',paymentDate:'2024-07-30',dateBasis:'PERIOD_END_PLUS_60'};
 check((await post(vurl,{...converted,paymentDate:'2024-07-29'})).statusCode,409);
 check((await post(vurl,{...converted,allocationAmount:'2035246'})).statusCode,409);check((await post(vurl,converted)).statusCode,200);
 const vr=await prisma.invoicePayment.findFirstOrThrow({where:{invoiceId:vnd.id}});check(vr.cashCurrency,'USD');check(vr.cashAmount.toString(),'79.87');check(vr.paidVnd,null);check(vr.allocationAmount.toString(),'2035247');check(vr.historicalSource.rateKind,'REPORTING_CONVERSION');
 const ar=await prisma.accountReceivable.findFirstOrThrow({where:{companyId:company.id,invoiceId:vnd.id}});check(ar.status,'PAID');check(ar.outstandingAmount.toString(),'0');check((await get('/api/v1/receivables?asOf=2026-10-13')).json().items.every(a=>a.status==='PAID'&&a.outstandingAmount==='0.00'),true);
 console.log('PASS: '+checks+' historical issue/payment, real currency, missing VND/bank, tenant/CSRF/permissions, rollback, duplicate race, Invoice/revenue/AR checks.');
}finally{await app.close();await prisma.$disconnect();}
