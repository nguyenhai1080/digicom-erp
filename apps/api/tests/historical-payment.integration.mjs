import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
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
const codes=['INVOICE_PAYMENT_VIEW','PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST','RECON_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','INVOICE_VIEW','INVOICE_CREATE','INVOICE_ISSUE','REVENUE_VIEW','AR_VIEW','SYSTEM_CONFIG_EDIT'];
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
async function makeInvoice(currency,period,amount,suffix='',existingPartner=null){
 const partner=existingPartner??await prisma.partner.create({data:{companyId:company.id,partnerCode:currency+suffix,partnerKey:currency+suffix,legalName:'Synthetic '+currency,partnerType:'CUSTOMER'}}),service=await prisma.service.create({data:{companyId:company.id,serviceCode:currency+suffix,serviceKey:currency+suffix,serviceName:currency,category:'OTHER',keyword:currency}});
 const contract=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:currency+suffix,contractName:'Synthetic agreement',currency,status:'ACTIVE',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:[{companyId:company.id,serviceId:service.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}]}}});
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
 const bankInput={accountCode:'BANK_TEST',name:'Synthetic VND bank',kind:'BANK',currency:'VND',bankName:'Synthetic bank',accountNumber:'000000TEST',holderName:'Synthetic company',openingDate:'2010-01-01',openingBalance:'1000',note:'Synthetic test only',confirmed:true};
 check((await post('/api/v1/cash-accounts',{...bankInput,confirmed:false})).statusCode,400);
 check((await post('/api/v1/cash-accounts',{...bankInput,openingBalance:'1.5'})).statusCode,400);
 check((await post('/api/v1/cash-accounts',bankInput,{'x-csrf-token':'invalid'})).statusCode,403);
 const bankResponse=await post('/api/v1/cash-accounts',bankInput);check(bankResponse.statusCode,200);const bank=bankResponse.json().item;
 check(bank.balance,'1000');check(await prisma.cashEntry.count({where:{companyId:company.id}}),1);
 const inv=await makeInvoice('USD','2024-04','100.00'),url='/api/v1/invoices/'+inv.id+'/payments';
 // A new service in an already issued partner/month must not recreate that
 // partner's old Invoice. DGC supports an explicit per-service selection.
 const selectedService=await prisma.service.create({data:{companyId:company.id,serviceCode:'NEW',serviceKey:'NEW',serviceName:'New service',category:'OTHER',keyword:'NEW'}});
 const oldContract=await prisma.contract.findFirstOrThrow({where:{companyId:company.id,partnerId:inv.partnerId}});
 await prisma.contractService.create({data:{companyId:company.id,contractId:oldContract.id,serviceId:selectedService.id,dgcStatus:'ACTIVE',businessModel:'REVENUE_SHARE'}});
 const nextDraft=await post('/api/v1/manual-revenue/drafts',{partnerId:inv.partnerId,rows:[{period:inv.period,serviceId:selectedService.id,contractId:oldContract.id,currency:'USD',amount:'42.00',deduction:'0',note:'New service after old Invoice paid'}]});check(nextDraft.statusCode,201);
 const nextRecon=await prisma.reconciliation.findUniqueOrThrow({where:{id:nextDraft.json().items[0].id}});check((await post('/api/v1/manual-revenue/'+nextRecon.id+'/approve',{expectedUpdatedAt:nextRecon.updatedAt.toISOString(),confirmed:true})).statusCode,200);
 const scopedSelection={partnerId:inv.partnerId,period:inv.period,invoiceMode:'PER_SERVICE',serviceId:selectedService.id,currency:'USD',invoiceDate:inv.period+'-30',paymentTermDays:30};
 const {serviceId:omitService,...allServices}=scopedSelection;check((await post('/api/v1/invoices/preview',allServices)).statusCode,409);
 const scopedPreview=await post('/api/v1/invoices/preview',scopedSelection);check(scopedPreview.statusCode,200);const scopedPlan=scopedPreview.json();check(scopedPlan.invoices.length,1);check(scopedPlan.invoices[0].invoice.lines.map(l=>l.serviceName),['New service']);
 const scopedCreated=await post('/api/v1/invoices/create',{...scopedSelection,digest:scopedPlan.digest,confirmed:true,placements:scopedPlan.invoices.map(i=>({businessKey:i.businessKey,placement:{page:1,x:.56,y:.64,width:.28}}))});check(scopedCreated.statusCode,201);
 check((await prisma.invoice.findUniqueOrThrow({where:{id:inv.id}})).status,'ISSUED');check((await prisma.accountReceivable.findFirstOrThrow({where:{companyId:company.id,invoiceId:inv.id}})).outstandingAmount.toString(),'100');
 const referenceResponse=await get('/api/v1/invoices/references');check(referenceResponse.statusCode,200);check(referenceResponse.json().services.some(s=>s.id===selectedService.id),true);
 check(referenceResponse.json().services.every(s=>['id','serviceKey','serviceName'].every(k=>Object.hasOwn(s,k))),true);
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
 const ar=await prisma.accountReceivable.findFirstOrThrow({where:{companyId:company.id,invoiceId:vnd.id}});check(ar.status,'PAID');check(ar.outstandingAmount.toString(),'0');check((await get('/api/v1/receivables?asOf=2026-10-13')).json().total,0);
 // Historical receipts leave the newly declared bank and cash ledger untouched.
 check((await prisma.cashAccount.findUniqueOrThrow({where:{id:bank.id}})).balance.toString(),'1000');
 check(await prisma.cashEntry.count({where:{companyId:company.id}}),1);
 check(await prisma.invoicePayment.count({where:{companyId:company.id,cashAccountId:{not:null}}}),0);
 // The separate-service draft provides a real normal-payment fixture.
 const normalId=scopedCreated.json().items[0].id,normalIssue=await post('/api/v1/invoices/'+normalId+'/issue-preview',{});
 check(normalIssue.statusCode,200);check((await post('/api/v1/invoices/'+normalId+'/issue',{digest:normalIssue.json().digest,confirmedHistorical:true,historicalReason:'Synthetic account/payment acceptance test'})).statusCode,200);
 const normalInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:normalId}}),normalUrl='/api/v1/invoices/'+normalId+'/payments';
 const normalBody={requestId:randomUUID(),expectedUpdatedAt:normalInvoice.updatedAt.toISOString(),paymentDate:'2024-06-01',paidUsd:'20',paidVnd:'500000',cashAccountId:bank.id,paymentMethod:'Bank Transfer',swiftNo:'TEST',note:'Synthetic normal receipt',confirmed:true};
 const usdAccount=await post('/api/v1/cash-accounts',{...bankInput,accountCode:'USD_TEST',currency:'USD',openingBalance:'0'});check(usdAccount.statusCode,200);
 check((await post(normalUrl,{...normalBody,cashAccountId:usdAccount.json().item.id})).statusCode,409);
 check((await post(normalUrl,{...normalBody,paymentMethod:'Cash'})).statusCode,409);
 check((await post(normalUrl,{...normalBody,paymentDate:'2009-12-31'})).statusCode,409);
 const foreignAccount=await prisma.cashAccount.create({data:{...bankInput,confirmed:undefined,companyId:other.id,openingDate:new Date(bankInput.openingDate),balance:1000}});
 check((await post(normalUrl,{...normalBody,cashAccountId:foreignAccount.id})).statusCode,409);
 const foreignHeaders={cookie:'erp_session='+foreignToken,'x-csrf-token':csrfToken(foreignToken,config.secret)};
 const otherList=await app.inject({method:'GET',url:'/api/v1/cash-accounts',headers:{...headers,...foreignHeaders}});check(otherList.json().items.map(a=>a.id),[foreignAccount.id]);
 await prisma.$executeRawUnsafe("ALTER TABLE cash_entries ADD CONSTRAINT test_cash_receipt_rollback CHECK(kind<>'INVOICE_RECEIPT')");
 check((await post(normalUrl,normalBody)).statusCode,500);check(await prisma.invoicePayment.count({where:{invoiceId:normalId}}),0);check((await prisma.cashAccount.findUniqueOrThrow({where:{id:bank.id}})).balance.toString(),'1000');check((await prisma.invoice.findUniqueOrThrow({where:{id:normalId}})).paidAmount.toString(),'0');
 await prisma.$executeRawUnsafe('ALTER TABLE cash_entries DROP CONSTRAINT test_cash_receipt_rollback');
 const bankRace=await Promise.all([post(normalUrl,normalBody),post(normalUrl,normalBody)]);check(bankRace.map(r=>r.statusCode),[200,200]);check(bankRace[0].json().paymentId,bankRace[1].json().paymentId);
 check((await prisma.cashAccount.findUniqueOrThrow({where:{id:bank.id}})).balance.toString(),'501000');
 const receiptEntry=await prisma.cashEntry.findFirstOrThrow({where:{companyId:company.id,kind:'INVOICE_RECEIPT',sourceId:bankRace[0].json().paymentId}});check(receiptEntry.amount.toString(),'500000');check(receiptEntry.balanceAfter.toString(),'501000');
 check(await prisma.cashEntry.count({where:{companyId:company.id,kind:'INVOICE_RECEIPT'}}),1);check((await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:normalId}})).outstandingAmount.toString(),'22');
 check((await get('/api/v1/cash-balances')).json().vnd,'501000');
 const fundResponse=await post('/api/v1/cash-accounts',{...bankInput,accountCode:'CASH_TEST',name:'Synthetic cash fund',kind:'CASH',bankName:'',accountNumber:'',holderName:'',openingBalance:'0'});check(fundResponse.statusCode,200);const fund=fundResponse.json().item;
 const partialInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:normalId}});
 const cashBody={...normalBody,requestId:randomUUID(),expectedUpdatedAt:partialInvoice.updatedAt.toISOString(),cashAccountId:fund.id,paymentMethod:'Cash',paidUsd:'22',paidVnd:'550000'};check((await post(normalUrl,cashBody)).statusCode,200);
 check((await prisma.cashAccount.findUniqueOrThrow({where:{id:fund.id}})).balance.toString(),'550000');check((await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:normalId}})).outstandingAmount.toString(),'0');check((await get('/api/v1/cash-balances')).json().vnd,'1051000');
 const bankNow=await prisma.cashAccount.findUniqueOrThrow({where:{id:bank.id}}),editBody={name:bankNow.name,bankName:bankNow.bankName,accountNumber:bankNow.accountNumber,holderName:bankNow.holderName,note:'Synthetic closed account',status:'INACTIVE',expectedUpdatedAt:bankNow.updatedAt.toISOString()};
 check((await post('/api/v1/cash-accounts/'+bank.id+'/update',{...editBody,openingBalance:'0'})).statusCode,400);check((await post('/api/v1/cash-accounts/'+bank.id+'/update',editBody)).statusCode,200);check((await post(normalUrl,normalBody)).statusCode,200);
 check((await get('/api/v1/invoices/'+normalId+'/payments')).json().accounts.some(a=>a.id===bank.id),false);
 // Equal due dates cross page boundaries. Invoice number provides a stable
 // unique tie-breaker so no receivable is repeated or skipped between pages.
 const {id:fixtureId,receivable:fixtureAr,...fixture}=inv;
 for(let n=21;n>0;n--){const number='PAGE-'+String(n).padStart(2,'0');await prisma.invoice.create({data:{...fixture,invoiceNumber:number,businessKey:number,period:'2024-06',status:'ISSUED',paidAmount:0,payableAmount:1,revenueAmount:1,whtAmount:0,dueDate:new Date('2024-07-30'),receivable:{create:{originalAmount:1,paidAmount:0,outstandingAmount:1,status:'OPEN'}}}});}
 const pages=[];for(let page=1;page<=3;page++){const res=await get('/api/v1/receivables?asOf=2026-10-13&period=2024-06&page='+page);check(res.statusCode,200);check(res.json().total,21);pages.push(...res.json().items.map(r=>r.invoiceNumber));}
 check(pages,Array.from({length:21},(_,n)=>'PAGE-'+String(n+1).padStart(2,'0')));check(new Set(pages).size,21);
 // Period ordering must precede creation/due dates, across the entire
 // paginated list rather than sorting individual pages in the browser.
 for(const [period,number,due] of [['2024-07','NEW-PERIOD','2024-05-01'],['2024-03','OLD-PERIOD','2025-01-01']])await prisma.invoice.create({data:{...fixture,invoiceNumber:number,businessKey:number,period,status:'ISSUED',paidAmount:0,payableAmount:1,revenueAmount:1,whtAmount:0,dueDate:new Date(due),receivable:{create:{originalAmount:1,paidAmount:0,outstandingAmount:1,status:'OPEN'}}}});
 for(const [route,query] of [['invoices','limit=10'],['receivables','asOf=2026-10-13'],['revenues',''],['manual-revenue/drafts','']]){
  const all=[];let count=Infinity;
  for(let page=1;all.length<count;page++){const response=await get('/api/v1/'+route+'?'+query+'&page='+page);check(response.statusCode,200);const result=response.json();count=result.total;all.push(...result.items);if(page>10)throw Error('Unexpected test pagination');}
  const periods=all.map(r=>r.period??r.payload.period);check(periods,[...periods].sort().reverse());check(new Set(all.map(r=>r.id)).size,count);
  if(route==='invoices'||route==='receivables'){check(periods[0],'2024-07');check(periods.at(-1),'2024-03');}
 }
 const usdAR=(await get('/api/v1/receivables?asOf=2026-10-13&partnerId='+inv.partnerId)).json();check(usdAR.total,23);check(usdAR.items.every(r=>Number(r.outstandingAmount)>0&&r.partnerKey==='USD'),true);check((await get('/api/v1/receivables?asOf=2026-10-13&partnerId='+vnd.partnerId)).json().total,0);
 const configPermission=permissions.find(p=>p.code==='SYSTEM_CONFIG_EDIT');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:configPermission.id}}});check((await post('/api/v1/cash-accounts',{...bankInput,accountCode:'UNAUTHORIZED'})).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:configPermission.id}});
 for(let n=1;n<=11;n++)check((await post('/api/v1/cash-accounts',{...bankInput,accountCode:'PAGE_CASH_'+String(n).padStart(2,'0'),kind:'CASH',openingBalance:'0'})).statusCode,200);
 const accountPages=[];for(let page=1;page<=2;page++){const response=await get('/api/v1/cash-accounts?page='+page);check(response.statusCode,200);check(response.json().total,14);accountPages.push(...response.json().items.map(a=>a.id));}check(new Set(accountPages).size,14);
 const bankEntries=(await get('/api/v1/cash-entries?accountId='+bank.id)).json();check(bankEntries.total,2);check(bankEntries.items.every(e=>e.cashAccountId===bank.id),true);check((await get('/api/v1/cash-entries?period=2024-06')).json().total,2);
 // Explicitly authorized conversion of historical receipt to the current cash ledger.
 const fixInvoice=await makeInvoice('VND','2024-02','123000','FIX'),fixRoute='/api/v1/invoices/'+fixInvoice.id+'/payments';
 check((await post(fixRoute,{...body,requestId:randomUUID(),expectedUpdatedAt:fixInvoice.updatedAt.toISOString(),allocationAmount:'123000',cashCurrency:'VND',cashAmount:'123000',paymentDate:'2024-04-30',dateBasis:'SOURCE'})).statusCode,200);
 const fixPayment=await prisma.invoicePayment.findFirstOrThrow({where:{invoiceId:fixInvoice.id}}),fixBank=(await post('/api/v1/cash-accounts',{...bankInput,accountCode:'FIX_BANK',openingBalance:'1000'})).json().item;
 const fixUrl='/api/v1/invoice-payments/'+fixPayment.id+'/post-cash',fixBody={cashAccountId:fixBank.id,reason:'Owner confirms actual money received into this bank',confirmed:true};
 check((await post(fixUrl,{...fixBody,confirmed:false})).statusCode,400);
 check((await post(fixUrl,fixBody,{'x-csrf-token':'bad'})).statusCode,403);
 check((await post(fixUrl,{...fixBody,cashAccountId:foreignAccount.id})).statusCode,409);
 check((await post(fixUrl,{...fixBody,cashAccountId:usdAccount.json().item.id})).statusCode,409);
 const closedId=bank.id;check((await post(fixUrl,{...fixBody,cashAccountId:closedId})).statusCode,409);
 const beforeFixInvoice=await prisma.invoice.findUniqueOrThrow({where:{id:fixInvoice.id}}),beforeFixAR=await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:fixInvoice.id}});
 await prisma.$executeRawUnsafe("ALTER TABLE cash_entries ADD CONSTRAINT test_fix_rollback CHECK(kind<>'INVOICE_RECEIPT') NOT VALID");
 check((await post(fixUrl,fixBody)).statusCode,500);check((await prisma.cashAccount.findUniqueOrThrow({where:{id:fixBank.id}})).balance.toString(),'1000');check((await prisma.invoicePayment.findUniqueOrThrow({where:{id:fixPayment.id}})).cashAccountId,null);
 await prisma.$executeRawUnsafe('ALTER TABLE cash_entries DROP CONSTRAINT test_fix_rollback');
 const fixRace=await Promise.all([post(fixUrl,fixBody),post(fixUrl,fixBody)]);check(fixRace.map(r=>r.statusCode),[200,200]);check(fixRace[0].json().entryId,fixRace[1].json().entryId);
 check((await prisma.cashAccount.findUniqueOrThrow({where:{id:fixBank.id}})).balance.toString(),'124000');check(await prisma.cashEntry.count({where:{kind:'INVOICE_RECEIPT',sourceId:fixPayment.id}}),1);
 check((await post(fixUrl,{...fixBody,cashAccountId:fund.id})).statusCode,409);
 check((await prisma.invoice.findUniqueOrThrow({where:{id:fixInvoice.id}})).paidAmount.toString(),beforeFixInvoice.paidAmount.toString());check((await prisma.accountReceivable.findFirstOrThrow({where:{invoiceId:fixInvoice.id}})).outstandingAmount.toString(),beforeFixAR.outstandingAmount.toString());
 check((await prisma.invoicePayment.findUniqueOrThrow({where:{id:fixPayment.id}})).historicalSource.reference,fixPayment.historicalSource.reference);
 const fixBankBefore=await prisma.cashAccount.findUniqueOrThrow({where:{id:fixBank.id}}),openingBody={name:fixBankBefore.name,bankName:fixBankBefore.bankName,accountNumber:fixBankBefore.accountNumber,holderName:fixBankBefore.holderName,note:'',status:'ACTIVE',expectedUpdatedAt:fixBankBefore.updatedAt.toISOString(),openingBalance:'2000',openingReason:'Owner confirms revised opening bank balance',confirmed:true};
 check((await post('/api/v1/cash-accounts/'+fixBank.id+'/update',{...openingBody,confirmed:false})).statusCode,400);
 check((await post('/api/v1/cash-accounts/'+fixBank.id+'/update',openingBody)).statusCode,200);
 const adjusted=await prisma.cashAccount.findUniqueOrThrow({where:{id:fixBank.id}});check(adjusted.openingBalance.toString(),'2000');check(adjusted.balance.toString(),'125000');check(await prisma.cashEntry.count({where:{cashAccountId:fixBank.id,kind:'OPENING_ADJUSTMENT'}}),1);
 check((await post('/api/v1/cash-accounts/'+fixBank.id+'/update',openingBody)).statusCode,409);
 const badOpening={...openingBody,expectedUpdatedAt:adjusted.updatedAt.toISOString(),openingBalance:'1.5'};check((await post('/api/v1/cash-accounts/'+fixBank.id+'/update',badOpening)).statusCode,400);
 check((await prisma.invoice.findUniqueOrThrow({where:{id:fixInvoice.id}})).paidAmount.toString(),'123000');
 // DGC on-ledger fee receipts preserve gross AR vs net actual cash, with no cash activation.
 const feeInvoice=await makeInvoice('USD','2024-08','993.91','FEE'),usdFeeInvoice=await makeInvoice('USD','2024-09','100','USDFEE');
 const groupFirst=await makeInvoice('USD','2025-01','1000','GROUP1'),groupPartner=await prisma.partner.findUniqueOrThrow({where:{id:groupFirst.partnerId}});
 const groupInvoices=[groupFirst];for(const [period,amount,suffix] of [['2025-02','2000','GROUP2'],['2025-03','3000','GROUP3'],['2025-04','8430.23','GROUP4']])groupInvoices.push(await makeInvoice('USD',period,amount,suffix,groupPartner));
 const groupPartial1=await makeInvoice('USD','2025-05','100','PART1',groupPartner),groupPartial2=await makeInvoice('USD','2025-06','100','PART2',groupPartner);
 const feeUrl='/api/v1/invoices/'+feeInvoice.id+'/payments',usdFeeUrl='/api/v1/invoices/'+usdFeeInvoice.id+'/payments';
 const feeBody={mode:'LEDGER_ONLY',requestId:randomUUID(),expectedUpdatedAt:feeInvoice.updatedAt.toISOString(),paymentDate:'2024-10-28',allocationAmount:'993.91',cashCurrency:'VND',cashAmount:'25227452',conversionRate:'25640',bankFeeUsd:'10',swiftFile:{filename:'synthetic-bank.png',base64:png.toString('base64')},confirmed:true};
 check((await post(feeUrl,feeBody)).statusCode,404); // Never extend GST with this DGC-only behavior.
 const preservedReceipt=JSON.stringify(await prisma.invoicePayment.findUniqueOrThrow({where:{id:receipt.id}}));
 await prisma.company.update({where:{id:company.id},data:{companyCode:'DGC'}});delete process.env.DGC_CASH_ENABLED;
 const cashEntriesBefore=await prisma.cashEntry.count(),accountBefore=JSON.stringify(await prisma.cashAccount.findMany({orderBy:{id:'asc'}}));
 check((await get(feeUrl)).json().cashEnabled,false);
 check((await post(feeUrl,{...feeBody,confirmed:false})).statusCode,400);
 check((await post(feeUrl,feeBody,{'x-csrf-token':'bad'})).statusCode,403);
 check((await post(feeUrl,{...feeBody,cashAmount:'25227453'})).statusCode,409);
 check((await post(feeUrl,{...feeBody,bankFeeUsd:'-10'})).statusCode,400);
 check((await post(feeUrl,{...feeBody,swiftFile:{filename:'bad.pdf',base64:Buffer.from('not a bank PDF').toString('base64')}})).statusCode,400);
 check((await post(feeUrl,{...feeBody,allocationAmount:'994.91',cashAmount:'25253092'})).statusCode,409);
 await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});check((await post(feeUrl,feeBody)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables ADD CONSTRAINT test_fee_rollback CHECK (paid_amount=0) NOT VALID');
 check((await post(feeUrl,feeBody)).statusCode,500);check(await prisma.invoicePayment.count({where:{invoiceId:feeInvoice.id}}),0);check((await prisma.invoice.findUniqueOrThrow({where:{id:feeInvoice.id}})).paidAmount.toString(),'0');
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables DROP CONSTRAINT test_fee_rollback');
 const feeRace=await Promise.all([post(feeUrl,feeBody),post(feeUrl,feeBody)]);check(feeRace.map(r=>r.statusCode),[200,200]);check(feeRace[0].json().paymentId,feeRace[1].json().paymentId);
 check((await post(feeUrl,{...feeBody,bankFeeUsd:'9'})).statusCode,409);
 const feePaid=await prisma.invoice.findUniqueOrThrow({where:{id:feeInvoice.id},include:{receivable:true}}),feeReceipt=(await get(feeUrl)).json().items[0];
 check(feePaid.paidAmount.toString(),'993.91');check(feePaid.receivable.outstandingAmount.toString(),'0');check(feePaid.status,'PAID');
 check(feeReceipt.allocationAmount,'993.91');check(feeReceipt.cashAmount,'25227452');check(feeReceipt.historicalSource.bankFee.amount,'10.00');check(feeReceipt.historicalSource.bankFee.netUsd,'983.91');check(feeReceipt.fxRate,'25640');check(feeReceipt.cashAccountId,null);check(!!feeReceipt.documentId,true);
 const bankDocRoute='/api/v1/invoice-payments/'+feeReceipt.id+'/document',bankDoc=await get(bankDocRoute);check(bankDoc.statusCode,200);check(bankDoc.headers['content-type'],'image/png');check(bankDoc.rawPayload.equals(png),true);
 check((await app.inject({method:'GET',url:bankDocRoute})).statusCode,401);
 check((await app.inject({method:'GET',url:bankDocRoute,headers:{...headers,...foreignHeaders}})).statusCode,404);
 const docPermission=permissions.find(p=>p.code==='INVOICE_PAYMENT_VIEW');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:docPermission.id}}});check((await get(bankDocRoute)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:docPermission.id}});
 await assert.rejects(()=>prisma.$executeRaw`UPDATE invoice_payments SET historical_source=jsonb_set(historical_source,'{bankFee,amount}','"9.00"') WHERE id=${feeReceipt.id}::uuid`);check((await prisma.invoicePayment.findUniqueOrThrow({where:{id:feeReceipt.id}})).historicalSource.bankFee.amount,'10.00');
 check(await prisma.invoicePayment.count({where:{invoiceId:feeInvoice.id}}),1);
 const feeAudit=await prisma.auditLog.findFirstOrThrow({where:{entityId:feeReceipt.id,action:'INVOICE_PAYMENT_POST'}});check(feeAudit.newValue.historicalSource.bankFee.amount,'10.00');
 const usdBody={...feeBody,requestId:randomUUID(),expectedUpdatedAt:usdFeeInvoice.updatedAt.toISOString(),allocationAmount:'50',cashCurrency:'USD',cashAmount:'40',conversionRate:undefined};
 check((await post(usdFeeUrl,usdBody)).statusCode,200);const usdPartial=await prisma.invoice.findUniqueOrThrow({where:{id:usdFeeInvoice.id}});check(usdPartial.status,'PARTIALLY_PAID');check(usdPartial.paidAmount.toString(),'50');
 // A later payment has no fee unless explicitly entered; never auto-deduct 10 per Invoice.
 check((await post(usdFeeUrl,{...usdBody,requestId:randomUUID(),expectedUpdatedAt:usdPartial.updatedAt.toISOString(),cashAmount:'50',bankFeeUsd:undefined,swiftFile:undefined})).statusCode,200);
 check((await prisma.invoice.findUniqueOrThrow({where:{id:usdFeeInvoice.id}})).status,'PAID');
 check(await prisma.cashEntry.count(),cashEntriesBefore);check(JSON.stringify(await prisma.cashAccount.findMany({orderBy:{id:'asc'}})),accountBefore);
 check(JSON.stringify(await prisma.invoicePayment.findUniqueOrThrow({where:{id:receipt.id}})),preservedReceipt);
 // One transfer, four cross-period invoices, one fee and one physical bank document.
 const groupBase='/api/v1/invoice-receipt-groups',groupBody={requestId:randomUUID(),partnerId:groupPartner.id,paymentDate:'2026-11-13',bankReference:'S0663170F5A301',grossUsd:'14430.23',bankFeeUsd:'10',cashCurrency:'VND',cashAmount:'367715865',fxRate:'25500',swiftFile:{filename:'one-transfer.png',base64:png.toString('base64')},items:groupInvoices.map(i=>({invoiceId:i.id,expectedUpdatedAt:i.updatedAt.toISOString(),amount:i.payableAmount.toFixed(2)}))};
 check((await app.inject({method:'GET',url:groupBase})).statusCode,401);
 check((await get(groupBase+'/candidates?partnerId='+groupPartner.id)).json().total,6);
 for(const bad of [{...groupBody,grossUsd:'14430.24'},{...groupBody,cashAmount:'367715864'},{...groupBody,partnerId:inv.partnerId},{...groupBody,items:[groupBody.items[0],groupBody.items[0]]},{...groupBody,items:groupBody.items.slice(0,1)}])check((await post(groupBase+'/preview',bad)).statusCode,bad.items.length===1||bad.items[0]===bad.items[1]?400:409);
 check((await post(groupBase+'/preview',groupBody,{'x-csrf-token':'bad'})).statusCode,403);
 check((await post(groupBase+'/preview',{...groupBody,items:[groupBody.items[0],{...groupBody.items[0],invoiceId:groupBody.items[0].invoiceId.toUpperCase()}]})).statusCode,400);
 const gp=await post(groupBase+'/preview',groupBody);check(gp.statusCode,200);check(gp.json().items.length,4);check(gp.json().items.every(i=>i.afterOutstanding==='0.00'),true);
 check(gp.json().items.reduce((a,i)=>a+Math.round(Number(i.feeShareUsd)*100),0),1000);check(gp.json().items.reduce((a,i)=>a+Number(i.cashShare),0),367715865);
 const groupCreate={...groupBody,digest:gp.json().digest,confirmed:true};
 check((await post(groupBase,{...groupCreate,confirmed:false})).statusCode,400);check((await post(groupBase,{...groupCreate,note:'changed'})).statusCode,409);
 const sourceCount=await prisma.document.count(),attachmentCount=await prisma.attachment.count();
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables ADD CONSTRAINT test_group_rollback CHECK(paid_amount=0) NOT VALID');
 check((await post(groupBase,groupCreate)).statusCode,500);check(await prisma.invoiceReceiptGroup.count(),0);check(await prisma.invoicePayment.count({where:{receiptGroupId:{not:null}}}),0);check(await prisma.document.count(),sourceCount);check(await prisma.attachment.count(),attachmentCount);
 await prisma.$executeRawUnsafe('ALTER TABLE account_receivables DROP CONSTRAINT test_group_rollback');
 // Failure after the sole evidence file has been persisted must remove it too.
 const bankFilesBefore=await readdir(resolve(process.env.STORAGE_ROOT,'payments',company.id));
 await prisma.$executeRawUnsafe("ALTER TABLE audit_logs ADD CONSTRAINT test_group_evidence_rollback CHECK(action<>'INVOICE_RECEIPT_GROUP_POST') NOT VALID");
 check((await post(groupBase,groupCreate)).statusCode,500);check(await prisma.document.count(),sourceCount);check(await prisma.attachment.count(),attachmentCount);check(await prisma.invoiceReceiptGroup.count(),0);
 check((await readdir(resolve(process.env.STORAGE_ROOT,'payments',company.id))).sort(),bankFilesBefore.sort());
 await prisma.$executeRawUnsafe('ALTER TABLE audit_logs DROP CONSTRAINT test_group_evidence_rollback');

 const groupsRaced=await Promise.all([post(groupBase,groupCreate),post(groupBase,groupCreate)]);check(groupsRaced.map(r=>r.statusCode),[200,200]);check(groupsRaced[0].json().id,groupsRaced[1].json().id);
 const groupId=groupsRaced[0].json().id,groupView=await get(groupBase+'/'+groupId);check(groupView.statusCode,200);const group=groupView.json();
 check(group.grossUsd,'14430.23');check(group.bankFeeUsd,'10');check(group.cashAmount,'367715865');check(group.allocations.length,4);
 check(await prisma.invoiceReceiptGroup.count(),1);check(await prisma.document.count(),sourceCount+1);check(await prisma.attachment.count(),attachmentCount+1);check(group.allocations.every(i=>!i.documentId),true);
 const doc=await get(group.documentUrl);check(doc.statusCode,200);check(doc.rawPayload.equals(png),true);
 for(const i of groupInvoices){const after=await prisma.invoice.findUniqueOrThrow({where:{id:i.id},include:{receivable:true}});check(after.status,'PAID');check(after.receivable.outstandingAmount.toString(),'0');const history=(await get('/api/v1/invoices/'+i.id+'/payments')).json();check(history.items[0].receiptGroup.id,groupId);check(history.items[0].receiptGroup.documentUrl,group.documentUrl);}
 check((await post(groupBase,{...groupCreate,bankFeeUsd:'9'})).statusCode,409);
 const duplicateRef={...groupBody,requestId:randomUUID()},duplicatePlan=await post(groupBase+'/preview',duplicateRef);check(duplicatePlan.statusCode,409); // settled invoices cannot be prepared again
 check((await app.inject({method:'GET',url:groupBase+'/'+groupId,headers:{...headers,...foreignHeaders}})).statusCode,404);
 check((await app.inject({method:'GET',url:group.documentUrl,headers:{...headers,...foreignHeaders}})).statusCode,404);
 await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:docPermission.id}}});check((await get(groupBase+'/'+groupId)).statusCode,403);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:docPermission.id}});
 await assert.rejects(()=>prisma.$executeRaw`UPDATE invoice_receipt_groups SET bank_fee_usd=9 WHERE id=${groupId}::uuid`);
 await assert.rejects(()=>prisma.$executeRaw`UPDATE invoice_payments SET cash_amount=cash_amount+1,paid_vnd=paid_vnd+1 WHERE receipt_group_id=${groupId}::uuid`);
 const partialBody={...groupBody,requestId:randomUUID(),bankReference:'PARTIAL-TRANSFER',grossUsd:'100',bankFeeUsd:'0',cashCurrency:'USD',cashAmount:'100',fxRate:undefined,swiftFile:undefined,items:[groupPartial1,groupPartial2].map(i=>({invoiceId:i.id,expectedUpdatedAt:i.updatedAt.toISOString(),amount:'50'}))};
 const pp=await post(groupBase+'/preview',partialBody);check(pp.statusCode,200);check((await post(groupBase,{...partialBody,digest:pp.json().digest,confirmed:true})).statusCode,200);
 for(const i of [groupPartial1,groupPartial2]){const after=await prisma.invoice.findUniqueOrThrow({where:{id:i.id},include:{receivable:true}});check(after.status,'PARTIALLY_PAID');check(after.receivable.outstandingAmount.toString(),'50');}
 // Same bank reference with a new request cannot create another transfer even if invoices remain eligible.
 const freshPartial={...partialBody,requestId:randomUUID(),items:await Promise.all([groupPartial1,groupPartial2].map(async i=>({invoiceId:i.id,expectedUpdatedAt:(await prisma.invoice.findUniqueOrThrow({where:{id:i.id}})).updatedAt.toISOString(),amount:'50'})))};
 const freshP=await post(groupBase+'/preview',freshPartial);check(freshP.statusCode,200);check((await post(groupBase,{...freshPartial,digest:freshP.json().digest,confirmed:true})).statusCode,409);
 // A single-Invoice receipt racing the grouped transfer must win wholly or lose wholly.
 const raceBody={...freshPartial,requestId:randomUUID(),bankReference:'RACE-TRANSFER'},raceP=await post(groupBase+'/preview',raceBody);check(raceP.statusCode,200);
 const raceSingle={mode:'LEDGER_ONLY',requestId:randomUUID(),expectedUpdatedAt:raceBody.items[0].expectedUpdatedAt,paymentDate:raceBody.paymentDate,allocationAmount:'50',cashCurrency:'USD',cashAmount:'50',confirmed:true};
 const mixedRace=await Promise.all([post(groupBase,{...raceBody,digest:raceP.json().digest,confirmed:true}),post('/api/v1/invoices/'+groupPartial1.id+'/payments',raceSingle)]);check(mixedRace.map(r=>r.statusCode).sort(),[200,409]);
 const allGroups=await prisma.invoiceReceiptGroup.count();check(allGroups,mixedRace[0].statusCode===200?3:2);
 const secondAfter=await prisma.invoice.findUniqueOrThrow({where:{id:groupPartial2.id},include:{receivable:true}});check(secondAfter.receivable.outstandingAmount.toString(),mixedRace[0].statusCode===200?'0':'50');
 check((await get(groupBase)).json().total,allGroups);
 const groupPermission=permissions.find(p=>p.code==='PAYMENT_CREATE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:groupPermission.id}}});check((await post(groupBase+'/preview',groupBody)).statusCode,403);check((await get(groupBase+'/'+groupId)).statusCode,200);await prisma.rolePermission.create({data:{roleId:role.id,permissionId:groupPermission.id}});
 check(await prisma.cashEntry.count(),cashEntriesBefore);check(JSON.stringify(await prisma.cashAccount.findMany({orderBy:{id:'asc'}})),accountBefore);check(JSON.stringify(await prisma.invoicePayment.findUniqueOrThrow({where:{id:receipt.id}})),preservedReceipt);
 console.log('PASS: '+checks+' historical issue/payment, real currency, missing VND/bank, tenant/CSRF/permissions, rollback, duplicate race, Invoice/revenue/AR and stable pagination checks.');
}finally{await app.close();await prisma.$disconnect();}
