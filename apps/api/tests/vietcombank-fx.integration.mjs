import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {prisma} from '@erp/db';
import {vietcombankFxRoutes} from '../dist/modules/projects/vietcombank-fx.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {CommandError} from '../dist/modules/projects/commands.js';
const db=new URL(process.env.DATABASE_URL);assert(['localhost','127.0.0.1'].includes(db.hostname)&&/^\/erp_execution_acceptance_dgc_vcb(?:_[a-z0-9]+)?$/.test(db.pathname));assert.equal(await prisma.user.count(),0,'Use fresh synthetic DB');
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Live network forbidden in synthetic tests');};
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const company=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}}),companyId=company.id;
const user=await prisma.user.create({data:{companyId,email:'synthetic-vcb@example.test',fullName:'Synthetic accountant',passwordHash:'unused'}}),role=await prisma.role.create({data:{companyId,code:'SYN_VCB',name:'Synthetic accounting FX only'}}),permission=await prisma.permission.findUniqueOrThrow({where:{code:'REVENUE_FX_CREATE'}});await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});const originalUserRole=await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const original=await prisma.configuration.create({data:{companyId,configKey:'REVENUE_FX:2026-01',configValue:JSON.stringify({rate:'25001',source:'Keep captured rate exactly',approvedById:null})}});
const origin='https://vcb.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:true,bootstrapEnabled:false,bootstrapToken:'',defaultCompanyCode:'DGC'},raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId,userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date('2030-01-01')}});
const headers={origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret)};
let now=new Date('2026-11-12T04:00:00Z'),calls=0,bad=false,fail=false;
const valid='<!--Only one request every 5 minutes!--><ExrateList><DateTime>11/12/2026 10:44:40 AM</DateTime><Exrate CurrencyCode="USD" Buy="25,480.00" Transfer="25,510.01" Sell="25,890.00"/></ExrateList>';
const app=Fastify();await app.register(cookie);app.decorateRequest('auth',null);app.setErrorHandler((e,_req,reply)=>reply.code(e instanceof CommandError?e.statusCode:500).send({message:e.message}));await vietcombankFxRoutes(app,config,{fetchSource:async()=>{calls++;if(fail)throw Error('PRIVATE_REMOTE_FAILURE');await new Promise(r=>setTimeout(r,25));return bad?'<html>not xml</html>':valid;},now:()=>now});
const post=(path,body={},extra={})=>app.inject({method:'POST',url:'/api/v1/revenue-fx/vietcombank/'+path,payload:body,headers:{...headers,...extra}});
const fingerprint=async()=>{const names=await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,result={};for(const {tablename} of names){if(['configurations','audit_logs'].includes(tablename))continue;assert(/^[a-z_]+$/.test(tablename));result[tablename]=await prisma.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM public."${tablename}" t`);}return result;};
try{
 const before=await fingerprint();
 eq((await post('quote',{}, {cookie:''})).statusCode,401);eq((await post('quote',{}, {'x-csrf-token':'bad'})).statusCode,403);eq((await post('quote',{}, {origin:'https://wrong.example.test'})).statusCode,403);eq((await post('quote',{url:'https://arbitrary.example.test'})).statusCode,400);eq(calls,0);
 const concurrent=await Promise.all([post('quote'),post('quote'),post('quote')]);eq(concurrent.map(r=>r.statusCode),[200,200,200]);eq(calls,1);eq(concurrent.filter(r=>r.json().cached===false).length,1);const q=concurrent[0].json();eq(q.rate,'25700.005');eq(q.transfer,'25510.01');eq(q.bankDate,'2026-11-12');eq(q.publishedAt,'2026-11-12T03:44:40.000Z');eq('xml' in q,false);eq(await prisma.configuration.count({where:{companyId,configKey:{startsWith:'REVENUE_FX:'}}}),1);
 const apply={period:'2026-11',quoteId:q.quoteId,digest:q.digest,confirmed:true};
 eq((await post('apply',{...apply,rate:'1'})).statusCode,400);eq((await post('apply',{...apply,confirmed:false})).statusCode,400);eq((await post('apply',{...apply,digest:'a'.repeat(64)})).statusCode,409);eq((await post('apply',{...apply,period:'2026-01'})).statusCode,409);
 const applied=await Promise.all([post('apply',apply),post('apply',apply)]);eq(applied.map(r=>r.statusCode).sort(),[200,409]);const saved=await prisma.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId,configKey:'REVENUE_FX:2026-11'}}}),value=JSON.parse(saved.configValue);eq(value.rate,'25700.005');eq(value.approvedById,user.id);eq(value.vietcombank.sourceHash,q.sourceHash);eq(value.vietcombank.transfer,'25510.01');eq(value.source.includes('2026-11-12'),true);
 now=new Date(now.getTime()+4*60000);eq((await post('quote')).json().cached,true);eq(calls,1);
 now=new Date(now.getTime()+2*60000);eq((await post('apply',{...apply,period:'2026-12'})).statusCode,409);const next=await post('quote');eq(next.statusCode,200);eq(calls,2);eq(next.json().quoteId===q.quoteId,false);eq((await post('apply',{...apply,period:'2026-12'})).statusCode,409);
 // Explicit cross-month application records the actual source date, never calls it a monthly average.
 const nextBody={period:'2026-10',quoteId:next.json().quoteId,digest:next.json().digest,confirmed:true};eq((await post('apply',nextBody)).statusCode,200);const october=JSON.parse((await prisma.configuration.findUniqueOrThrow({where:{companyId_configKey:{companyId,configKey:'REVENUE_FX:2026-10'}}})).configValue);eq(october.vietcombank.bankDate,'2026-11-12');
 now=new Date(now.getTime()+6*60000);bad=true;eq((await post('quote')).statusCode,502);eq(calls,3);eq((await post('quote')).statusCode,502);eq(calls,3);eq((await post('apply',{...nextBody,period:'2026-12'})).statusCode,409);
 now=new Date(now.getTime()+6*60000);bad=false;fail=true;const failure=await post('quote');eq(failure.statusCode,502);eq(failure.body.includes('PRIVATE_REMOTE_FAILURE'),false);eq(calls,4);
 now=new Date(now.getTime()+6*60000);fail=false;eq((await post('quote')).statusCode,200);eq(calls,5);
 await prisma.userRole.deleteMany({where:{userId:user.id}});eq((await post('quote')).statusCode,403);eq((await post('apply',apply)).statusCode,403);await prisma.userRole.create({data:{userId:user.id,roleId:role.id,assignedAt:originalUserRole.assignedAt}});
 eq(await prisma.configuration.findUniqueOrThrow({where:{id:original.id}}),original);eq(await fingerprint(),before);eq(await prisma.auditLog.count({where:{companyId,action:'REPORTING_FX_CREATE'}}),2);
 console.log('PASS: '+checks+' synthetic Vietcombank route checks; no bank fetches, no financial changes outside two explicitly confirmed new period configs.');
}finally{globalThis.fetch=originalFetch;await app.close();await prisma.$disconnect();}
