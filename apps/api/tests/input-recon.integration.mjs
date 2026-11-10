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
import {inputDigest} from '../dist/modules/projects/input-recon.js';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_input_recon_'))throw Error('Requires disposable input reconciliation acceptance DB');
const storage=await mkdtemp(resolve(tmpdir(),'input-recon-fixture-'));process.env.STORAGE_ROOT=storage;
const company=await prisma.company.upsert({where:{companyCode:'DGC'},create:{companyCode:'DGC',companyName:'Synthetic DGC',defaultCurrency:'USD'},update:{}}),marker=randomUUID();
assert.equal(await prisma.inputReconciliation.count(),0,'Fresh synthetic database required');
const permissions=['REVENUE_FX_CREATE','MANUAL_REVENUE_CREATE','MANUAL_REVENUE_EDIT','MANUAL_REVENUE_SUBMIT','MANUAL_REVENUE_APPROVE','MANUAL_REVENUE_CANCEL','INPUT_RECON_VIEW','INPUT_RECON_GENERATE','INPUT_RECON_APPROVE','AP_VIEW','REVENUE_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','RECON_VIEW','SYSTEM_CONFIG_EDIT'];
const ps=await Promise.all(permissions.map(code=>prisma.permission.upsert({where:{code},create:{code,name:code,module:'FIXTURE'},update:{}})));
const user=await prisma.user.create({data:{companyId:company.id,email:marker+'@example.test',fullName:'Synthetic input actor',passwordHash:'unused'}});
const role=await prisma.role.create({data:{companyId:company.id,code:marker,name:'Synthetic capability test',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const raw=randomBytes(32).toString('hex'),origin='https://input.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});
const app=await buildApp({auth:config,logger:false});let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},request=(method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret),...extra}}),post=(url,payload,extra)=>request('POST',url,payload,extra);
const ok=async(url,payload,status=200)=>{const r=await post(url,payload);assert.equal(r.statusCode,status,r.body);checks++;return r.json();};
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
 // Captured drafts must print their exact stored values, without a current FX
 // or source calculation. This fixture intentionally differs from recomputation.
 const capService=await prisma.service.create({data:{companyId:company.id,serviceCode:'CAPTURED',serviceKey:'CAPTURED',serviceName:'Dịch vụ chuyển sổ',category:'OTHER'}}),capContracts=await contracts(capService),capRevenue=await source(capService,capContracts.out,'2026-05','100.00');
 const capData={period:'2026-05',sourceRevenueId:capRevenue.id,serviceId:capService.id,outputPartnerId:output.id,outputContractId:capContracts.out.id,inputPartnerId:input.id,inputContractId:capContracts.inp.id,currency:'VND',baseUsd:'100.00',shareRate:'0.4',foreignAmount:'39.99',fxRate:'25000',localAmount:'999751.23',taxRate:'0.05',taxAmount:'123.45',whtAmount:'0',payableAmount:'999627.78'};
 const capSource={sheetId:70,sourceRow:2,rowHash:'a'.repeat(64)},capSnapshot={sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:'b'.repeat(64),source:capSource,sourceStatus:'Generated',capturedRowJson:'Synthetic captured source only',data:capData},capHash=inputDigest(capSnapshot);
 const cap=await prisma.inputReconciliation.create({data:{companyId:company.id,inputReconCode:'CAPTURED-ONLY',...capData,sourceDigest:capHash,sourceSnapshot:capSnapshot,status:'GENERATED',createdById:user.id}});
 const capSelect={period:'2026-05',inputPartnerId:input.id,inputContractId:capContracts.inp.id,reconDate:'2026-06-01',includeApproved:true,sourceMode:'CAPTURED'};
 const moneySnapshot=async()=>{const r=await prisma.inputReconciliation.findUniqueOrThrow({where:{id:cap.id}});return JSON.stringify({data:Object.fromEntries(Object.keys(capData).map(k=>[k,r[k]?.toFixed?.()??r[k]])),sourceSnapshot:r.sourceSnapshot,sourceDigest:r.sourceDigest});};
 const preserved=await moneySnapshot(),apBefore=await prisma.accountPayable.count(),filesBefore=await readdir(resolve(storage,'input-recon',company.id)),docsBefore=await prisma.document.count();
 eq((await request('GET',url+'?period=2026-05')).json().items[0].capturedHistory,true);
 eq((await request('GET',url+'?period=2026-05')).json().items[0].sourceStatus,'Generated');
 eq((await post(url+'/'+cap.id+'/refresh',{expectedUpdatedAt:cap.updatedAt.toISOString(),digest:capHash,confirmed:true})).statusCode,409);
 eq(await moneySnapshot(),preserved);
 eq((await post(url+'/statement-preview',{...capSelect,sourceMode:'CURRENT'})).statusCode,409);
 eq((await post(url+'/statement-preview',capSelect)).statusCode,409);
 await prisma.dgcImportSnapshot.create({data:{companyId:company.id,snapshotHash:capSnapshot.snapshotHash,sourceSpreadsheetId:'SYNTHETIC_ONLY',sourceMetadata:{synthetic:true},rowCount:1}});
 await prisma.dgcImportRow.create({data:{companyId:company.id,snapshotHash:capSnapshot.snapshotHash,...capSource,sheetName:'Synthetic Input',legacyId:cap.inputReconCode,payload:{synthetic:true}}});
 const capLinkData={companyId:company.id,sourceSpreadsheetId:'SYNTHETIC_ONLY',snapshotHash:capSnapshot.snapshotHash,...capSource,legacyId:cap.inputReconCode,targetModel:'inputReconciliation',targetId:cap.id,targetHash:'c'.repeat(64)};
 await prisma.dgcImportLink.create({data:capLinkData});eq((await post(url+'/statement-preview',capSelect)).statusCode,409);
 await prisma.auditLog.create({data:{companyId:company.id,userId:user.id,action:'DGC_CAPTURED_BOOK_TRANSFER',entityType:'SyntheticFixture',newValue:{synthetic:true}}});
 // Even after the upstream status changes, the captured statement is a read
 // of preserved input values, never a new calculation from that source.
 await prisma.revenue.update({where:{id:capRevenue.id},data:{status:'CANCELLED'}});
 let capPlan=await ok(url+'/statement-preview',capSelect);eq(capPlan.data.captured,true);eq(capPlan.data.lines.length,1);eq(capPlan.data.lines[0].foreignAmount,'39.99');eq(capPlan.data.lines[0].localAmount,'999751.23');eq(capPlan.data.lines[0].taxAmount,'123.45');eq(capPlan.data.lines[0].whtAmount,'0.00');eq(capPlan.data.lines[0].payableAmount,'999627.78');eq(capPlan.data.totals.payableAmount,'999627.78');
 await capability('INPUT_RECON_GENERATE',false);eq((await post(url+'/statement-preview',capSelect)).statusCode,403);await capability('INPUT_RECON_GENERATE',true);
 let capPayload={...capSelect,digest:capPlan.digest,confirmed:true};
 eq((await post(url+'/statement-create',capPayload,{'x-csrf-token':'bad'})).statusCode,403);
 const capPdf=await post(url+'/statement-pdf-preview',capPayload);eq(capPdf.statusCode,200);eq((await PDFDocument.load(capPdf.rawPayload)).getPageCount(),1);eq(await moneySnapshot(),preserved);eq(await prisma.accountPayable.count(),apBefore);
 await prisma.inputReconciliation.update({where:{id:cap.id},data:{baseUsd:'99'}});eq((await post(url+'/statement-pdf-preview',capPayload)).statusCode,409);await prisma.inputReconciliation.update({where:{id:cap.id},data:{baseUsd:capData.baseUsd}});capPlan=await ok(url+'/statement-preview',capSelect);capPayload={...capSelect,digest:capPlan.digest,confirmed:true};
 await prisma.dgcImportLink.updateMany({where:{companyId:company.id,targetId:cap.id},data:{rowHash:'d'.repeat(64)}});eq((await post(url+'/statement-preview',capSelect)).statusCode,409);await prisma.dgcImportLink.updateMany({where:{companyId:company.id,targetId:cap.id},data:{rowHash:capSource.rowHash}});
 await prisma.$executeRawUnsafe("CREATE FUNCTION captured_input_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INPUT_RECON_PDF' AND NEW.new_value->'data'->>'captured'='true' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");await prisma.$executeRawUnsafe('CREATE TRIGGER captured_input_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION captured_input_failure()');
 eq((await post(url+'/statement-create',capPayload)).statusCode,500);eq(await moneySnapshot(),preserved);eq((await readdir(resolve(storage,'input-recon',company.id))).sort(),filesBefore.sort());eq(await prisma.document.count(),docsBefore);
 await prisma.$executeRawUnsafe('DROP TRIGGER captured_input_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION captured_input_failure()');
 const capSaved=await ok(url+'/statement-create',capPayload,201);eq(capSaved.version,1);eq(capSaved.filename.startsWith('Captured_Input_Recon_'),true);eq(await moneySnapshot(),preserved);eq(await prisma.accountPayable.count(),apBefore);eq((await prisma.inputReconciliation.findUniqueOrThrow({where:{id:cap.id}})).status,'GENERATED');
 eq((await request('GET',url+'/'+cap.id+'/pdf')).statusCode,200);eq((await post(url+'/statement-create',capPayload)).statusCode,409);
 const afterPrint=await prisma.inputReconciliation.findUniqueOrThrow({where:{id:cap.id}});const capApproved=await ok(url+'/'+cap.id+'/approve',{expectedUpdatedAt:afterPrint.updatedAt.toISOString(),confirmed:true});eq(capApproved.created,true);eq(capApproved.payable.originalAmount,'999627.78');eq(await moneySnapshot(),preserved);eq((await ok(url+'/'+cap.id+'/approve',{expectedUpdatedAt:afterPrint.updatedAt.toISOString(),confirmed:true})).created,false);eq(await prisma.cashEntry.count(),0);
 if(process.env.FINANCE_PROOF_ROOT)await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-captured-input.pdf'),capPdf.rawPayload);
 // Contract-scoped batch workflow; never creates AP or cash until separate approval.
 const batchServices=[];
 for(let n=0;n<3;n++){
  const svc=await prisma.service.create({data:{companyId:company.id,serviceCode:'BATCH'+n,serviceKey:'BATCH'+n,serviceName:'Dịch vụ hợp đồng '+n,category:'OTHER'}});
  const pair=await contracts(svc);if(n===0)batchServices.push({svc,...pair});else{
   await prisma.contract.update({where:{id:pair.inp.id},data:{status:'DRAFT'}});
   await prisma.contractService.create({data:{companyId:company.id,contractId:batchServices[0].inp.id,serviceId:svc.id,businessModel:'REVENUE_SHARE',dgcStatus:'ACTIVE',revenueShareRate:'.4'}});
   batchServices.push({svc,out:pair.out,inp:batchServices[0].inp});
  }
 }
 const batchRows=[];for(const x of batchServices)batchRows.push(await source(x.svc,x.out,'2026-10','100.25'));
 const ids=batchRows.map(r=>r.id),batch={revenueIds:ids};
 eq((await request('GET',url+'/contracts',undefined,{cookie:''})).statusCode,401);
 const options=(await request('GET',url+'/contracts')).json();eq(options.items.some(c=>c.id===batchServices[0].inp.id&&c.partnerKey===input.partnerKey),true);
 eq((await post(url+'/batch-preview',batch)).statusCode,409);
 await ok('/api/v1/revenue-fx/import',{items:[{period:'2026-10',rate:'25750',source:'Synthetic October fixture only'}],confirmed:true});
 let bp=await ok(url+'/batch-preview',batch);eq(bp.items.length,3);eq(bp.currency,'VND');eq(bp.payableAmount,'2787952.50');
 eq((await request('GET',url+'/sources?period=2026-10&inputContractId='+batchServices[0].inp.id)).json().total,3);
 const inactiveCandidate=await prisma.contract.findFirstOrThrow({where:{companyId:company.id,dgcDirection:'Input',status:'DRAFT',services:{some:{serviceId:batchServices[1].svc.id}}}});
 const scopedInactive=(await request('GET',url+'/sources?period=2026-10&inputContractId='+inactiveCandidate.id)).json();eq(scopedInactive.total,1);eq(scopedInactive.items[0].ready,false);
 eq((await request('GET',url+'/sources?period=2026-10&inputContractId='+randomUUID())).json().total,0);
 eq((await post(url+'/batch-preview',{revenueIds:[ids[0],ids[0]]})).statusCode,400);
 eq((await post(url+'/batch-preview',{revenueIds:[]})).statusCode,400);
 eq((await post(url+'/batch-preview',{revenueIds:[...ids,randomUUID()]})).statusCode,404);
 const otherSvc=await prisma.service.create({data:{companyId:company.id,serviceCode:'OTHER_BATCH',serviceKey:'OTHER_BATCH',serviceName:'Other contract',category:'OTHER'}}),otherPair=await contracts(otherSvc),otherRow=await source(otherSvc,otherPair.out,'2026-10');
 eq((await post(url+'/batch-preview',{revenueIds:[ids[0],otherRow.id]})).statusCode,409);
 const noInput=await prisma.service.create({data:{companyId:company.id,serviceCode:'NO_INPUT',serviceKey:'NO_INPUT',serviceName:'No input contract',category:'OTHER'}}),noPair=await contracts(noInput);
 await prisma.contractService.deleteMany({where:{contractId:noPair.inp.id}});await source(noInput,noPair.out,'2026-10');
 eq((await request('GET',url+'/sources?period=2026-10')).json().items.some(r=>r.serviceKey==='NO_INPUT'),false);
 const payload={...batch,digest:bp.digest,confirmed:true},beforeBatch={rows:await prisma.inputReconciliation.count(),ap:await prisma.accountPayable.count(),cash:await prisma.cashEntry.count()};
 await capability('INPUT_RECON_GENERATE',false);eq((await post(url+'/batch-generate',payload)).statusCode,403);await capability('INPUT_RECON_GENERATE',true);
 eq((await post(url+'/batch-generate',payload,{'x-csrf-token':'bad'})).statusCode,403);
 eq((await post(url+'/batch-generate',payload,{origin:'https://foreign.test'})).statusCode,403);
 eq((await post(url+'/batch-generate',{...payload,digest:'0'.repeat(64)})).statusCode,409);
 await prisma.configuration.update({where:{companyId_configKey:{companyId:company.id,configKey:'REVENUE_FX:2026-10'}},data:{configValue:JSON.stringify({rate:'25751',source:'Synthetic changed'})}});
 eq((await post(url+'/batch-generate',payload)).statusCode,409);eq(await prisma.inputReconciliation.count(),beforeBatch.rows);
 bp=await ok(url+'/batch-preview',batch);payload.digest=bp.digest;
 await prisma.$executeRawUnsafe("CREATE FUNCTION input_batch_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='INPUT_RECON_GENERATE' AND (SELECT count(*) FROM input_reconciliations WHERE period='2026-10')>=2 THEN RAISE EXCEPTION 'synthetic mid-batch failure'; END IF; RETURN NEW; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER input_batch_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION input_batch_failure()');
 try{eq((await post(url+'/batch-generate',payload)).statusCode,500);eq(await prisma.inputReconciliation.count(),beforeBatch.rows);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER input_batch_failure ON audit_logs');await prisma.$executeRawUnsafe('DROP FUNCTION input_batch_failure()');}
 const concurrent=await Promise.all([post(url+'/batch-generate',payload),post(url+'/batch-generate',payload)]);eq(concurrent.map(r=>r.statusCode).sort(),[200,201]);eq(await prisma.inputReconciliation.count(),beforeBatch.rows+3);
 eq(await prisma.accountPayable.count(),beforeBatch.ap);eq(await prisma.cashEntry.count(),beforeBatch.cash);
 const foreignCompany=await prisma.company.create({data:{companyCode:'OTHER_'+marker,companyName:'Other tenant',defaultCurrency:'USD'}});
 const foreignUser=await prisma.user.create({data:{companyId:foreignCompany.id,email:marker+'-foreign@example.test',fullName:'Synthetic foreign user',passwordHash:'unused'}});
 const foreignRole=await prisma.role.create({data:{companyId:foreignCompany.id,code:'FOREIGN',name:'Synthetic foreign role',permissions:{create:ps.map(p=>({permissionId:p.id}))}}});
 await prisma.userRole.create({data:{userId:foreignUser.id,roleId:foreignRole.id}});
 const foreignToken=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:foreignCompany.id,userId:foreignUser.id,tokenHash:tokenHash(foreignToken),expiresAt:new Date(Date.now()+3600000)}});
 const foreignHeaders={cookie:'erp_session='+foreignToken,'x-csrf-token':csrfToken(foreignToken,config.secret)};
 eq((await request('GET',url+'/contracts',undefined,foreignHeaders)).statusCode,404);
 eq((await post(url+'/batch-preview',batch,foreignHeaders)).statusCode,404);
 eq((await post(url+'/batch-generate',payload,foreignHeaders)).statusCode,404);
 await capability('INPUT_RECON_VIEW',false);eq((await request('GET',url+'/contracts')).statusCode,403);await capability('INPUT_RECON_VIEW',true);
 eq((await ok(url+'/batch-generate',{...payload,revenueIds:[...ids].reverse()})).created,0);
 eq((await request('GET',url+'?period=2026-10&inputContractId='+batchServices[0].inp.id)).json().total,3);
 eq((await request('GET',url+'/sources?period=2026-10&inputContractId='+batchServices[0].inp.id)).json().total,0);
 const bs={period:'2026-10',inputPartnerId:input.id,inputContractId:batchServices[0].inp.id,reconDate:'2026-11-03',includeApproved:true};
 const grouped=await ok(url+'/statement-preview',bs);eq(grouped.data.lines.length,3);eq(grouped.data.deductions,'309784.53');
 const groupedPdf=await post(url+'/statement-pdf-preview',{...bs,digest:grouped.digest,confirmed:true});eq(groupedPdf.statusCode,200);eq((await PDFDocument.load(groupedPdf.rawPayload)).getPageCount(),1);
 if(process.env.FINANCE_PROOF_ROOT)await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-contract-group.pdf'),groupedPdf.rawPayload);
 eq(await prisma.accountPayable.count(),beforeBatch.ap);eq(await prisma.cashEntry.count(),beforeBatch.cash);
 console.log('PASS: '+checks+' InputRecon/AP assertions including contract-scoped atomic batch, replay, concurrency, stale FX, captured printing and no cash.');
}finally{await app.close();await prisma.$disconnect();}
