import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {randomUUID} from 'node:crypto';
import {prisma} from '@erp/db';
import {manualRevenueRoutes} from '../dist/modules/projects/manual-revenue.js';
import {csrfToken} from '../dist/modules/auth/access.js';
// Exercise real routes and permission/CSRF guards with isolated in-memory delegates.
// No database connection, persistent financial record or source file is used.
const cid=randomUUID(),uid=randomUUID(),rid=randomUUID(),sid=randomUUID(),contractId=randomUUID(),partnerId=randomUUID(),stamp='2026-10-11T06:00:00.000Z';
const config={secret:'synthetic-only',appOrigin:'https://fixture.example',secureCookies:false},token='a'.repeat(64);
let permissions=['RECON_UPLOAD','RECON_APPROVE'],record,revenues=[],audits=[],duplicate=false;
function reset(status='DRAFT'){record={id:rid,companyId:cid,partnerId,sourceType:'MANUAL_ENTRY',status,isCurrent:true,updatedAt:new Date(stamp),periodStart:new Date('2026-06-01'),sourceAttachmentId:null,validatedPayload:{period:'2026-06',serviceId:sid,contractId,currency:'VND',amount:'1000000',deduction:'0',fxRate:null,note:'Original',payable:'1000000'}};revenues=[];audits=[];duplicate=false;}
const tx={
 $executeRaw:async()=>0,$queryRaw:async()=>[],
 reconciliation:{findFirst:async({where})=>where.companyId===cid?record:null,findFirstOrThrow:async()=>record,update:async({data})=>{record={...record,...data,updatedAt:new Date('2026-10-11T06:01:00Z')};return record;}},
 contract:{findFirst:async()=>({currency:'VND',services:[{id:randomUUID(),serviceId:sid,status:'ACTIVE',dgcStatus:'ACTIVE'}]})},service:{findFirst:async()=>({id:sid})},partner:{findFirst:async()=>({id:partnerId})},serviceRelationship:{findFirst:async()=>null},
 revenue:{count:async()=>duplicate?1:revenues.length,create:async({data})=>{revenues.push(data);return data;}},
 reconciliationItem:{create:async({data})=>({id:randomUUID(),...data})},sequence:{upsert:async()=>({prefix:'REV',currentValue:1,padding:4})},auditLog:{create:async({data})=>{audits.push(data);return data;}}
};
const originalTransaction=prisma.$transaction,originalSession=prisma.authSession.findUnique;
prisma.$transaction=async fn=>fn(tx);
prisma.authSession.findUnique=async()=>({expiresAt:new Date(Date.now()+60000),user:{id:uid,companyId:cid,status:'ACTIVE',fullName:'Fixture',email:'fixture@example.test',company:{status:'ACTIVE',companyCode:'GST'},roles:[{role:{companyId:cid,status:'ACTIVE',permissions:permissions.map(code=>({permission:{code}}))}}]}});
const app=Fastify();await app.register(cookie);app.setErrorHandler((e,req,reply)=>reply.code(e.statusCode??500).send({message:e.message}));await manualRevenueRoutes(app,config);
const headers={cookie:'erp_session='+token,origin:config.appOrigin,'x-csrf-token':csrfToken(token,config.secret)};
const post=(action,body,extra={})=>app.inject({method:'POST',url:'/api/v1/manual-revenue/'+rid+'/'+action,payload:body,headers:{...headers,...extra}});
const edit={expectedUpdatedAt:stamp,amount:'1200000',deduction:'100000',note:'Corrected'},approve={expectedUpdatedAt:stamp,confirmed:true};let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 reset();check((await post('edit',edit,{'x-csrf-token':'bad'})).statusCode,403);check(record.validatedPayload.amount,'1000000');
 permissions=['RECON_APPROVE'];check((await post('edit',edit)).statusCode,403);permissions=['RECON_UPLOAD','RECON_APPROVE'];
 check((await post('edit',{...edit,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 check((await post('edit',{...edit,deduction:'1300000'})).statusCode,409);
 check((await post('edit',edit)).statusCode,200);check(record.validatedPayload.payable,'1100000');check(record.validatedPayload.period,'2026-06');check(audits[0].action,'MANUAL_REVENUE_EDIT');check(revenues.length,0);
 reset('PENDING_APPROVAL');check((await post('edit',edit)).statusCode,200);check(record.status,'DRAFT');
 reset('APPROVED');check((await post('edit',edit)).statusCode,409);
 reset();permissions=['RECON_UPLOAD'];check((await post('approve',approve)).statusCode,403);permissions=['RECON_UPLOAD','RECON_APPROVE'];
 check((await post('approve',approve)).statusCode,200);check(record.status,'APPROVED');check(revenues[0].netAmount,'1000000');check(audits[0].action,'MANUAL_REVENUE_APPROVE');check((await post('edit',{...edit,expectedUpdatedAt:record.updatedAt.toISOString()})).statusCode,409);check(revenues.length,1);
 reset('PENDING_APPROVAL');check((await post('approve',approve)).statusCode,200);
 reset();duplicate=true;check((await post('approve',approve)).statusCode,409);check(record.status,'DRAFT');check(revenues.length,0);
 reset('CANCELLED');check((await post('edit',edit)).statusCode,409);
 console.log('PASS: '+checks+' manual revenue edit, direct approval, legacy pending, CSRF, permission, snapshot and duplicate guards.');
}finally{await app.close();prisma.$transaction=originalTransaction;prisma.authSession.findUnique=originalSession;}
