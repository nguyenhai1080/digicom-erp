import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {PDFDocument} from 'pdf-lib';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {inputVndWords} from '../dist/modules/projects/input-recon-statement.js';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_input_recon_'))throw Error('Requires disposable input reconciliation acceptance DB');
const storage=await mkdtemp(resolve(tmpdir(),'input-recon-fixture-'));process.env.STORAGE_ROOT=storage;
const company=await prisma.company.upsert({where:{companyCode:'DGC'},create:{companyCode:'DGC',companyName:'Synthetic DGC',defaultCurrency:'USD'},update:{}}),marker=randomUUID();
assert.equal(await prisma.inputReconciliation.count(),0,'Fresh synthetic database required');
const permissions=['MANUAL_REVENUE_CREATE','MANUAL_REVENUE_EDIT','MANUAL_REVENUE_SUBMIT','MANUAL_REVENUE_APPROVE','MANUAL_REVENUE_CANCEL','INPUT_RECON_VIEW','INPUT_RECON_GENERATE','INPUT_RECON_APPROVE','AP_VIEW','REVENUE_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','RECON_VIEW','SYSTEM_CONFIG_EDIT'];
const ps=await Promise.all(permissions.map(code=>prisma.permission.upsert({where:{code},create:{code,name:code,module:'FIXTURE'},update:{}})));
const user=await prisma.user.create({data:{companyId:company.id,email:marker+'@example.test',fullName:'Synthetic input actor',passwordHash:'unused'}});
const role=await prisma.role.create({data:{companyId:company.id,code:marker,name:'Synthetic capability test',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const raw=randomBytes(32).toString('hex'),origin='https://input.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});
const app=await buildApp({auth:config,logger:false});let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},request=(method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret),...extra}}),post=(url,payload,extra)=>request('POST',url,payload,extra);
const ok=async(url,payload,status=200)=>{const r=await post(url,payload);eq(r.statusCode,status);if(r.statusCode!==status)throw Error(r.body);return r.json();};
async function capability(code,enabled){const permissionId=ps.find(p=>p.code===code).id;if(enabled)await prisma.rolePermission.create({data:{roleId:role.id,permissionId}});else await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId}}});}
const output=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYN_OUT',partnerKey:'MOVITEL_FIXTURE',legalName:'Synthetic output partner',partnerType:'CUSTOMER',status:'ACTIVE'}}),input=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYN_IN',partnerKey:'INPUT_FIXTURE',legalName:'Đối tác đầu vào tổng hợp',partnerType:'SUPPLIER',status:'ACTIVE'}});
async function contracts(service,currency='VND'){
 const common={companyId:company.id,status:'ACTIVE',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE'};
 const out=await prisma.contract.create({data:{...common,contractCode:randomUUID(),contractName:'Synthetic output',contractNumber:'SYNTHETIC-OUTPUT',partnerId:output.id,dgcDirection:'Output',currency:'USD',services:{create:{companyId:company.id,serviceId:service.id,businessModel:'REVENUE_SHARE',currency:'USD',dgcStatus:'ACTIVE'}}}});
 const inp=await prisma.contract.create({data:{...common,contractCode:randomUUID(),contractName:'Synthetic input',contractNumber:'SYNTHETIC-INPUT',partnerId:input.id,dgcDirection:'Input',currency,revenueShareRate:'.4',taxRate:'.1',services:{create:{companyId:company.id,serviceId:service.id,businessModel:'REVENUE_SHARE',currency,dgcStatus:'ACTIVE',revenueShareRate:'.4'}}}});
 return {out,inp};
}
async function source(service,out,period='2026-01',amount='123.45',currency='USD',fxRate){const d=await ok('/api/v1/manual-revenue/drafts',{partnerId:output.id,rows:[{period,serviceId:service.id,contractId:out.id,currency,amount,deduction:'0',...(fxRate?{fxRate}:{}),note:'Synthetic input source'}]},201);const r=await prisma.reconciliation.findUniqueOrThrow({where:{id:d.items[0].id}});await ok('/api/v1/manual-revenue/'+r.id+'/approve',{expectedUpdatedAt:r.updatedAt.toISOString(),confirmed:true});return prisma.revenue.findFirstOrThrow({where:{reconciliationId:r.id}});}
const service=await prisma.service.create({data:{companyId:company.id,serviceCode:'SYN',serviceKey:'SYN',serviceName:'Dịch vụ tổng hợp',category:'OTHER'}}),{out,inp}=await contracts(service);
const url='/api/v1/input-recon',files=async()=>{try{return (await readdir(resolve(storage,'input-recon',company.id))).sort();}catch(e){if(e.code!=='ENOENT')throw e;return [];}};
try{
 eq(inputVndWords('0'),'Không đồng chẵn');eq(inputVndWords('1111094'),'Một triệu, một trăm mười một nghìn, không trăm chín mươi bốn đồng chẵn');
 const revenue=await source(service,out);
 eq((await request('GET',url,undefined,{cookie:''})).statusCode,401);eq((await post(url+'/preview',{revenueId:revenue.id},{'x-csrf-token':'bad'})).statusCode,403);eq((await post(url+'/preview',{revenueId:revenue.id},{origin:'https://foreign.test'})).statusCode,403);
 eq((await post(url+'/preview',{revenueId:revenue.id,companyId:randomUUID()})).statusCode,400);
 eq((await post(url+'/preview',{revenueId:revenue.id})).statusCode,409);
 await ok('/api/v1/revenue-fx/import',{items:[{period:'2026-01',rate:'25001',source:'Synthetic common rate'}],confirmed:true});
 let p=await ok(url+'/preview',{revenueId:revenue.id});eq(p.foreignAmount,'49.38');eq(p.localAmount,'1234549.38');eq(p.taxAmount,'123454.94');eq(p.payableAmount,'1111094.44');eq(p.whtAmount,'0.00');
 const cs=await prisma.contractService.findFirstOrThrow({where:{contractId:inp.id}});
 await prisma.contractService.update({where:{id:cs.id},data:{revenueShareRate:'0'}});eq((await ok(url+'/preview',{revenueId:revenue.id})).shareRate,'0.4');await prisma.contractService.update({where:{id:cs.id},data:{revenueShareRate:'.4'}});
 await prisma.contract.update({where:{id:inp.id},data:{effectiveDate:new Date('2026-02-01')}});eq((await post(url+'/preview',{revenueId:revenue.id})).statusCode,409);await prisma.contract.update({where:{id:inp.id},data:{effectiveDate:null}});
 const extra=await prisma.contract.create({data:{companyId:company.id,partnerId:input.id,contractCode:randomUUID(),contractName:'Synthetic overlap',dgcDirection:'Input',currency:'VND',status:'ACTIVE',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:{companyId:company.id,serviceId:service.id,businessModel:'REVENUE_SHARE',dgcStatus:'ACTIVE',revenueShareRate:'.5'}}}});eq((await post(url+'/preview',{revenueId:revenue.id})).statusCode,409);await prisma.contract.update({where:{id:extra.id},data:{status:'DRAFT'}});
 await prisma.contract.update({where:{id:inp.id},data:{currency:'MZN'}});eq((await post(url+'/preview',{revenueId:revenue.id})).statusCode,409);await prisma.contract.update({where:{id:inp.id},data:{currency:'VND'}});
 const pending=(await request('GET',url+'/sources?period=2026-01')).json();eq(pending.total,1);eq(pending.items[0].ready,true);eq(pending.limit,10);
 p=await ok(url+'/preview',{revenueId:revenue.id});
 await capability('INPUT_RECON_GENERATE',false);eq((await post(url+'/generate',{revenueId:revenue.id,digest:p.digest,confirmed:true})).statusCode,403);await capability('INPUT_RECON_GENERATE',true);
 eq((await post(url+'/generate',{revenueId:revenue.id,digest:'0'.repeat(64),confirmed:true})).statusCode,409);
 const generate={revenueId:revenue.id,digest:p.digest,confirmed:true},races=await Promise.all([post(url+'/generate',generate),post(url+'/generate',generate)]);eq(races.map(r=>r.statusCode).sort(),[200,201]);eq(await prisma.inputReconciliation.count(),1);eq(await prisma.accountPayable.count(),0);
 let row=races.find(r=>r.statusCode===201).json().item;eq(row.status,'DRAFT');eq((await request('GET',url+'/sources?period=2026-01')).json().total,0);
 const pre=(await request('GET','/api/v1/output-recon/preflight?'+new URLSearchParams({partnerId:output.id,serviceId:service.id,period:'2026-01'}))).json();eq(pre.action,'BLOCK_FINANCIAL_DEPENDENCY');eq(pre.inputDependencies.length,1);
 const selection={period:'2026-01',inputPartnerId:input.id,inputContractId:inp.id,reconDate:'2026-02-01',includeApproved:true};eq((await post(url+'/statement-preview',selection)).statusCode,409);
 const profile={issuerName:'Công ty DGC tổng hợp',address:'Synthetic address',phone:'',fax:'',email:'fixture@example.test',website:'example.test',taxCode:'SYN',bank:{beneficiary:'Synthetic',account:'SYN',bankName:'Synthetic',bankAddress:'Synthetic',swift:'SYN'},signatureName:'Synthetic',signatureTitle:'Synthetic'};
 await ok('/api/v1/company/invoice-profile',{profile,expectedUpdatedAt:null,reason:'Synthetic PDF profile'});
 let statement=await ok(url+'/statement-preview',selection);eq(statement.data.totals.partnerAmount,'1111094');eq(statement.data.lines[0].cooperation,'3086373');
 let statementPayload={...selection,digest:statement.digest,confirmed:true};
 const pdf=await post(url+'/statement-pdf-preview',statementPayload);eq(pdf.statusCode,200);eq(pdf.headers['content-type'],'application/pdf');eq((await PDFDocument.load(pdf.rawPayload)).getPageCount(),1);eq(await files(),[]);
 const oldCounts={documents:await prisma.document.count(),files:await files()};
 await prisma.$executeRawUnsafe("CREATE FUNCTION input_pdf_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INPUT_RECON_PDF' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER input_pdf_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION input_pdf_failure()');
 try{eq((await post(url+'/statement-create',statementPayload)).statusCode,500);eq(await prisma.document.count(),oldCounts.documents);eq(await files(),oldCounts.files);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER input_pdf_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION input_pdf_failure()');}
 const saved=await ok(url+'/statement-create',statementPayload,201);eq(saved.version,1);row=await prisma.inputReconciliation.findUniqueOrThrow({where:{id:row.id}});eq(row.status,'GENERATED');eq((await request('GET',url+'/'+row.id+'/pdf')).statusCode,200);eq(await prisma.accountPayable.count(),0);eq((await post(url+'/statement-create',statementPayload)).statusCode,409);
 const intactSnapshot=row.sourceSnapshot;
 row=await prisma.inputReconciliation.update({where:{id:row.id},data:{sourceSnapshot:{...intactSnapshot,tampered:true}}});
 eq((await post(url+'/'+row.id+'/approve',{expectedUpdatedAt:row.updatedAt.toISOString(),confirmed:true})).statusCode,409);eq(await prisma.accountPayable.count(),0);
 row=await prisma.inputReconciliation.update({where:{id:row.id},data:{sourceSnapshot:intactSnapshot}});
 await prisma.contract.update({where:{id:inp.id},data:{taxRate:'.15'}});eq((await post(url+'/'+row.id+'/approve',{expectedUpdatedAt:row.updatedAt.toISOString(),confirmed:true})).statusCode,409);
 p=await ok(url+'/preview',{revenueId:revenue.id});await ok(url+'/'+row.id+'/refresh',{expectedUpdatedAt:row.updatedAt.toISOString(),digest:p.digest,confirmed:true});row=await prisma.inputReconciliation.findUniqueOrThrow({where:{id:row.id}});eq(row.status,'DRAFT');eq(row.documentId,null);eq((await prisma.document.findUniqueOrThrow({where:{id:saved.documentId}})).status,'SUPERSEDED');
 await prisma.contract.update({where:{id:inp.id},data:{taxRate:'.1'}});p=await ok(url+'/preview',{revenueId:revenue.id});await ok(url+'/'+row.id+'/refresh',{expectedUpdatedAt:row.updatedAt.toISOString(),digest:p.digest,confirmed:true});row=await prisma.inputReconciliation.findUniqueOrThrow({where:{id:row.id}});
 await prisma.revenue.update({where:{id:revenue.id},data:{status:'INVOICED'}}); // An unchanged financial source survives Invoice lifecycle changes.
 const approve=()=>({expectedUpdatedAt:row.updatedAt.toISOString(),confirmed:true});
 await capability('INPUT_RECON_APPROVE',false);eq((await post(url+'/'+row.id+'/approve',approve())).statusCode,403);await capability('INPUT_RECON_APPROVE',true);
 await prisma.$executeRawUnsafe("CREATE FUNCTION input_ap_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INPUT_RECON_APPROVE' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER input_ap_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION input_ap_failure()');
 try{eq((await post(url+'/'+row.id+'/approve',approve())).statusCode,500);eq(await prisma.accountPayable.count(),0);eq((await prisma.inputReconciliation.findUniqueOrThrow({where:{id:row.id}})).status,'DRAFT');}finally{await prisma.$executeRawUnsafe('DROP TRIGGER input_ap_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION input_ap_failure()');}
 const approved=await ok(url+'/'+row.id+'/approve',approve());eq(approved.created,true);eq(approved.payable.originalAmount,'1111094.44');eq(approved.payable.outstandingAmount,'1111094.44');eq(await prisma.accountPayable.count(),1);
 eq((await ok(url+'/'+row.id+'/approve',approve())).created,false);eq(await prisma.auditLog.count({where:{action:'INPUT_RECON_APPROVE'}}),1);eq((await post(url+'/'+row.id+'/refresh',{expectedUpdatedAt:approved.item.updatedAt,digest:p.digest,confirmed:true})).statusCode,409);
 await prisma.inputReconciliation.update({where:{id:row.id},data:{sourceSnapshot:{...intactSnapshot,tampered:true}}});eq((await post(url+'/'+row.id+'/approve',approve())).statusCode,409);await prisma.inputReconciliation.update({where:{id:row.id},data:{sourceSnapshot:intactSnapshot}});
 statement=await ok(url+'/statement-preview',selection);statementPayload={...selection,digest:statement.digest,confirmed:true};eq((await ok(url+'/statement-create',statementPayload,201)).version,2);eq((await prisma.inputReconciliation.findUniqueOrThrow({where:{id:row.id}})).status,'APPROVED');eq(await prisma.accountPayable.count(),1);
 const payables=(await request('GET','/api/v1/payables?period=2026-01')).json();eq(payables.total,1);eq(payables.totalsByCurrency[0].currency,'VND');eq(payables.totalsByCurrency[0].outstandingAmount,'1111094.44');eq(payables.items[0].dueDate,null);
 eq(await prisma.cashEntry.count(),0);eq(await prisma.cashAccount.count(),0);eq(await prisma.invoice.count(),0);eq(await prisma.accountReceivable.count(),0);
 const foreign=await prisma.company.create({data:{companyCode:'FOREIGN_'+marker,companyName:'Synthetic foreign'}}),otherPartner=await prisma.partner.create({data:{companyId:foreign.id,partnerCode:'FOREIGN',partnerKey:'FOREIGN',legalName:'Foreign',partnerType:'SUPPLIER'}});
 await assert.rejects(prisma.inputReconciliation.update({where:{id:row.id},data:{inputPartnerId:otherPartner.id}}));checks++;
 eq((await request('GET',url+'/'+randomUUID()+'/pdf')).statusCode,404);eq((await post(url+'/preview',{revenueId:randomUUID()})).statusCode,404);
 await capability('AP_VIEW',false);eq((await request('GET','/api/v1/payables')).statusCode,403);await capability('AP_VIEW',true);
 const s2=await prisma.service.create({data:{companyId:company.id,serviceCode:'USD_FIX',serviceKey:'USD_FIX',serviceName:'USD fixture',category:'OTHER'}}),c2=await contracts(s2,'USD'),r2=await source(s2,c2.out,'2026-02','100.00');const pp=await ok(url+'/preview',{revenueId:r2.id});eq(pp.fxRate,'1');eq(pp.payableAmount,'36.00');const ir2=await ok(url+'/generate',{revenueId:r2.id,digest:pp.digest,confirmed:true},201);await ok(url+'/'+ir2.item.id+'/approve',{expectedUpdatedAt:ir2.item.updatedAt,confirmed:true});
 eq((await request('GET','/api/v1/payables')).json().totalsByCurrency.map(v=>v.currency).sort(),['USD','VND']);
 for(let i=0;i<11;i++){
  const s=await prisma.service.create({data:{companyId:company.id,serviceCode:'PAGE_'+i,serviceKey:'PAGE_'+i,serviceName:'Pagination fixture '+i,category:'OTHER'}}),c=await contracts(s,'USD');
  if(i===0){await prisma.contract.update({where:{id:c.out.id},data:{currency:'VND'}});await prisma.contractService.updateMany({where:{contractId:c.out.id},data:{currency:'VND'}});}
  const rr=await source(s,c.out,'2026-03',i===0?'2500000':'100.00',i===0?'VND':'USD',i===0?'25000':undefined);
  const planned=await ok(url+'/preview',{revenueId:rr.id});eq(planned.baseUsd,'100.00');eq(planned.payableAmount,'36.00');
  const generated=await ok(url+'/generate',{revenueId:rr.id,digest:planned.digest,confirmed:true},201);await ok(url+'/'+generated.item.id+'/approve',{expectedUpdatedAt:generated.item.updatedAt,confirmed:true});
 }
 for(const path of [url,'/api/v1/payables']){const first=(await request('GET',path+'?period=2026-03&page=1')).json(),second=(await request('GET',path+'?period=2026-03&page=2')).json();eq(first.total,11);eq(first.items.length,10);eq(second.items.length,1);eq(new Set([...first.items,...second.items].map(r=>r.id)).size,11);}
 const sums=(await request('GET','/api/v1/payables?period=2026-03')).json().totalsByCurrency;eq(sums,[{currency:'USD',originalAmount:'396',paidAmount:'0',outstandingAmount:'396'}]);
 if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-input-recon.pdf'),pdf.rawPayload);}
 console.log('PASS: '+checks+' InputRecon/AP assertions for donor arithmetic, source/contract/FX guards, permissions/tenant, idempotency/races, PDF/rollback/history, approval/AP and no cash posting.');
}finally{await app.close();await prisma.$disconnect();}
