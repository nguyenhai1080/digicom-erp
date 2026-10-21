// Explicitly opt-in local browser fixture. Never run against source/staging data.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {hashPassword} from '../dist/modules/auth/password.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {seedSoaCutoff} from './soa-cutoff.fixtures.mjs';
import {invoiceHistoryFixture} from './invoice-history.fixtures.mjs';

assert.equal(process.env.DGC_UI_FIXTURE,'true');
const mode=process.env.DGC_UI_FIXTURE_MODE??'setup';assert.ok(['setup','serve'].includes(mode));
assert.ok(new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_dgc_roles_ui_'));
assert.ok(process.env.DGC_UI_FIXTURE_PASSWORD?.length>=12);
const company=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}});
assert.equal(company.companyName,'Synthetic DGC roles');
if(process.env.DGC_UI_ARCHIVE_FIXTURE==='true'){const archive=await invoiceHistoryFixture('/tmp/dgc-history-ui');process.env.DGC_INVOICE_ARCHIVE_ROOT=archive.root;process.env.DGC_INVOICE_ARCHIVE_HASH=archive.index.archiveHash;process.env.DGC_INVOICE_ARCHIVE_COMPANY_ID=company.id;}
const origin='http://127.0.0.1:3901',config={secret:'synthetic-accounting-ui-secret-20261020',appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
const actor=code=>prisma.user.findFirstOrThrow({where:{companyId:company.id,roles:{some:{role:{code}}}}});
const accounting=await actor('ACCOUNTING_FIXTURE');
if(mode==='setup')await prisma.user.update({where:{id:accounting.id},data:{email:'accounting@example.test',passwordHash:await hashPassword(process.env.DGC_UI_FIXTURE_PASSWORD)}});
const app=await buildApp({auth:config,logger:false});
const web=resolve('/app/apps/web/dist'),assets=new Set(await readdir(resolve(web,'assets')));
app.get('/fixture/',async(_req,reply)=>reply.type('text/html').send(await readFile(resolve(web,'index.html'))));
app.get('/assets/:name',async(req,reply)=>{const name=req.params.name;if(!assets.has(name))return reply.code(404).send();return reply.type(name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/octet-stream').send(await readFile(resolve(web,'assets',name)));});
async function headers(user){const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:company.id,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return {origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret)};}
if(mode==='setup'){
await seedSoaCutoff(prisma,company.id,accounting.id);
const managerHeaders=await headers(await actor('MANAGER_FIXTURE')),configHeaders=await headers(await actor('CONFIG_ONLY_FIXTURE')),accountingHeaders=await headers(accounting);
async function post(path,payload,h,status=200){const r=await app.inject({method:'POST',url:'/api/v1'+path,payload,headers:h});assert.equal(r.statusCode,status,r.body);return r.json();}
const output=await prisma.contract.findFirstOrThrow({where:{companyId:company.id,dgcDirection:'Output'},include:{services:true}});
assert.equal(await prisma.reconciliation.count({where:{companyId:company.id,periodStart:new Date('2026-04-01')}}),0,'Fresh UI fixture required');
const draft=await post('/manual-revenue/drafts',{partnerId:output.partnerId,rows:[{period:'2026-04',serviceId:output.services[0].serviceId,contractId:output.id,currency:'USD',amount:'100.00',deduction:'10.00',note:'Synthetic browser fixture'}]},managerHeaders,201);
const row=await prisma.reconciliation.findUniqueOrThrow({where:{id:draft.items[0].id}});
await post('/manual-revenue/'+row.id+'/approve',{expectedUpdatedAt:row.updatedAt.toISOString(),confirmed:true},managerHeaders);
const profile={issuerName:'Synthetic DGC Company',address:'Synthetic address',phone:'',fax:'',email:'fixture@example.test',website:'example.test',taxCode:'SYN',bank:{beneficiary:'Synthetic',account:'SYN',bankName:'Synthetic',bankAddress:'Synthetic',swift:'SYN'},signatureName:'Synthetic',signatureTitle:'Synthetic'};
await post('/company/invoice-profile',{profile,expectedUpdatedAt:null,reason:'Synthetic browser fixture profile'},configHeaders);
await post('/revenue-fx/import',{items:Array.from({length:12},(_,i)=>({period:'2025-'+String(i+1).padStart(2,'0'),rate:String(25000+i),source:'Synthetic browser baseline'})),confirmed:true},accountingHeaders);
assert.equal(await prisma.configuration.count({where:{companyId:company.id,configKey:'REVENUE_FX:2026-04'}}),0);
}
await app.listen({host:'0.0.0.0',port:3901});
console.log('Synthetic accounting UI ready on '+origin+'/fixture/; account accounting@example.test; pending FX/source period 2026-04.');
