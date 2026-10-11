import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {randomUUID} from 'node:crypto';
import {prisma} from '@erp/db';
import {userRoutes} from '../dist/modules/auth/users.routes.js';
import {csrfToken} from '../dist/modules/auth/access.js';
import {verifyPassword} from '../dist/modules/auth/password.js';
// Real routes, isolated delegates; never touches live users or database.
const companyId=randomUUID(),actorId=randomUUID(),targetId=randomUUID(),roleId=randomUUID(),staffId=randomUUID();
const stamp='2026-10-11T00:00:00.000Z',token='a'.repeat(64),config={secret:'fixture-only',appOrigin:'https://fixture.example'};
let permissions=['USER_VIEW','USER_CREATE','USER_EDIT','USER_DISABLE','ROLE_CREATE'],target,revoked=0,audits=[],activeAdmins=2;
const admin={id:roleId,code:'ADMIN',name:'Admin',permissions:permissions.map(code=>({permission:{code}}))},staff={id:staffId,code:'STAFF',name:'Staff',permissions:[]};
function reset(){target={id:targetId,companyId,email:'staff@example.test',fullName:'Staff',phone:'',status:'ACTIVE',updatedAt:new Date(stamp),roles:[{role:admin}],passwordHash:'never-return-this'};revoked=0;audits=[];activeAdmins=2;}
const tx={$executeRaw:async()=>0,user:{findFirst:async({where})=>where.companyId===companyId&&[targetId,actorId].includes(where.id)?{...target,id:where.id}:null,count:async({where})=>where.roles?activeAdmins:0,create:async({data})=>{target={...target,...data};return target;},update:async({data})=>{target={...target,...data};return target;}},role:{findMany:async({where})=>where.companyId===companyId?[admin,staff].filter(r=>where.id.in.includes(r.id)):[]},userRole:{deleteMany:async()=>0},authSession:{deleteMany:async()=>{revoked++;return {}; }},auditLog:{create:async({data})=>{audits.push(data);return data;}}};
const originalTransaction=prisma.$transaction,originalSession=prisma.authSession.findUnique;
prisma.$transaction=async fn=>fn(tx);
prisma.authSession.findUnique=async()=>({expiresAt:new Date(Date.now()+60000),user:{id:actorId,companyId,status:'ACTIVE',email:'admin@example.test',fullName:'Admin',company:{status:'ACTIVE',companyCode:'GST'},roles:[{role:{companyId,status:'ACTIVE',permissions:permissions.map(code=>({permission:{code}}))}}]}});
const app=Fastify();await app.register(cookie);await app.register(userRoutes,config);
const headers={cookie:'erp_session='+token,origin:config.appOrigin,'x-csrf-token':csrfToken(token,config.secret)};
const post=(path,payload,h={})=>app.inject({method:'POST',url:'/api/v1/users'+path,payload,headers:{...headers,...h}});
const body={email:'new@example.test',fullName:'Updated',phone:'',roleIds:[staffId],expectedUpdatedAt:stamp};let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 reset();check((await post('/'+targetId+'/update',body,{'x-csrf-token':'bad'})).statusCode,403);check(target.fullName,'Staff');
 check((await post('/'+targetId+'/update',body,{origin:'https://other.example'})).statusCode,403);
 permissions=['USER_VIEW'];check((await post('/'+targetId+'/update',body)).statusCode,403);permissions=['USER_VIEW','USER_CREATE','USER_EDIT','USER_DISABLE','ROLE_CREATE'];
 check((await post('/'+randomUUID()+'/update',body)).statusCode,404);
 check((await post('/'+targetId+'/update',{...body,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 check((await post('/'+targetId+'/update',{...body,roleIds:[randomUUID()]})).statusCode,400);
 activeAdmins=1;check((await post('/'+targetId+'/update',body)).statusCode,409);activeAdmins=2;
 check((await post('/'+actorId+'/update',body)).statusCode,400);
 check((await post('/'+targetId+'/update',body)).statusCode,200);check(target.fullName,'Updated');check(revoked,1);check(audits[0].action,'USER_EDIT');
 reset();check((await post('/'+actorId+'/status',{status:'INACTIVE',expectedUpdatedAt:stamp})).statusCode,400);
 activeAdmins=1;check((await post('/'+targetId+'/status',{status:'INACTIVE',expectedUpdatedAt:stamp})).statusCode,409);activeAdmins=2;
 check((await post('/'+targetId+'/status',{status:'INACTIVE',expectedUpdatedAt:stamp})).statusCode,200);check(target.status,'INACTIVE');check(revoked,1);
 reset();check((await post('/'+targetId+'/reset-password',{password:'short',expectedUpdatedAt:stamp})).statusCode,400);
 const password='Fixture-only-long-password-42';check((await post('/'+targetId+'/reset-password',{password,expectedUpdatedAt:stamp})).statusCode,200);check(await verifyPassword(password,target.passwordHash),true);check(revoked,1);check(JSON.stringify(audits).includes(password),false);check(JSON.stringify(audits).includes(target.passwordHash),false);
 console.log('PASS: '+checks+' user-management authorization, tenant, stale, last-admin, password hash and session-revocation checks.');
}finally{await app.close();prisma.$transaction=originalTransaction;prisma.authSession.findUnique=originalSession;}
