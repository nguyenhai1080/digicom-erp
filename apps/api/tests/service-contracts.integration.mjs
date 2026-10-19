import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import { csrfToken, tokenHash } from '../dist/modules/auth/access.js';
import { prisma } from '@erp/db';
import { hashPassword } from '../dist/modules/auth/password.js';
if (!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_')) throw new Error('Use a disposable erp_execution_acceptance_ database');
const marker=randomUUID(), origin='https://partners.example.test';
const config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:true,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'GST'};
const company=await prisma.company.create({data:{companyCode:'CONTRACT_'+marker,companyName:'Disposable partner test'}});
const other=await prisma.company.create({data:{companyCode:'COTHER_'+marker,companyName:'Other test'}});
const user=await prisma.user.create({data:{companyId:company.id,email:'contract@example.test',fullName:'Test',passwordHash:await hashPassword('Disposable local partner fixture password')}});
const role=await prisma.role.create({data:{companyId:company.id,code:'CONTRACT',name:'Test',permissions:{create:(await prisma.permission.findMany()).map(p=>({permissionId:p.id}))}}});
await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{tokenHash:tokenHash(raw),companyId:company.id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
const app=await buildApp({auth:config,logger:false});let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
const request=(method,url,payload,headers={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+raw,'x-csrf-token':csrfToken(raw,config.secret),...headers}});
const post=(path,body)=>request('POST',path,body);
const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:'P1',legalName:'Local contract partner',partnerType:'CUSTOMER'}});
const foreignPartner=await prisma.partner.create({data:{companyId:other.id,partnerCode:'P1',legalName:'Foreign',partnerType:'CUSTOMER'}});
const service=await prisma.service.create({data:{companyId:company.id,serviceCode:'S1',serviceName:'Local service',category:'OTHER'}});
const service2=await prisma.service.create({data:{companyId:company.id,serviceCode:'S2',serviceName:'Local second service',category:'OTHER'}});
const foreignService=await prisma.service.create({data:{companyId:other.id,serviceCode:'S1',serviceName:'Foreign',category:'OTHER'}});
const profile={contractName:'Local contract fixture',partnerId:partner.id,serviceIds:[service.id,service.id,service2.id],revenueShareRate:'0.15',taxRate:'0.16',fixedFee:'1234.5678',currency:'USD',paymentTermDays:30};
try{
 check((await request('GET','/api/v1/service-contracts',undefined,{cookie:''})).statusCode,401);
 check((await request('POST','/api/v1/service-contracts',profile,{'x-csrf-token':'bad'})).statusCode,403);
 check((await request('POST','/api/v1/service-contracts',profile,{origin:'https://foreign.example.test'})).statusCode,403);
 for(const invalid of [{contractName:' '},{companyId:other.id},{createdBy:'spoof'},{ownerUserId:user.id},{revenueShareRate:'15'},{revenueShareRate:'0.1234567'},{taxRate:'-1'},{fixedFee:'-1'},{paymentTermDays:-1},{effectiveDate:'2026-02-30'},{effectiveDate:'2026-05-02',expiryDate:'2026-05-01'},{status:'SIGNED'},{dgcDirection:'PROJECT'},{currency:'MZN'},{attachmentUrl:'javascript:alert(1)'},{ownerEmail:'bad'}])check((await post('/api/v1/service-contracts',{...profile,...invalid})).statusCode,400);
 check((await post('/api/v1/service-contracts',{...profile,partnerId:foreignPartner.id})).statusCode,404);
 check((await post('/api/v1/service-contracts',{...profile,serviceIds:[foreignService.id]})).statusCode,404);
 const response=await post('/api/v1/service-contracts',profile);check(response.statusCode,201);let item=response.json().item;
 check(item.contractCode,'CTR0001');check(item.contractType,'OTHER');check(item.dgcDirection,'Output');check(item.status,'DRAFT');check(item.billingCycle,'Monthly');check(item.ownerEmail,user.email);check(item.createdBy,user.email);check(item.revenueShareRate,'0.15');check(item.taxRate,'0.16');check(item.fixedFee,'1234.5678');check(item.services.length,2);
 for(const s of item.services){check(s.status,'ACTIVE');check(s.dgcStatus,'ACTIVE');check(s.effectiveFrom,null);check(s.revenueShareRate,'0.15');check(s.fixedFee,'1234.5678');}
 const initialIds=item.services.map(s=>s.id).sort();const base='/api/v1/service-contracts/'+item.id;
 check((await post(base+'/delete',{expectedUpdatedAt:item.updatedAt,reason:'Disposable fixture'})).statusCode,409);
 check(await prisma.auditLog.count({where:{entityId:item.id,action:'CONTRACT_DELETE'}}),0);
 check((await post('/api/v1/service-contracts',{...profile,contractCode:item.contractCode})).statusCode,409);
 const oldTime=item.updatedAt;
 const update={...profile,serviceIds:[service2.id],dgcDirection:'Input',status:'SUSPENDED',fixedFee:'0',taxRate:'0',revenueShareRate:'0',effectiveDate:'2026-01-01',expiryDate:'2026-12-31',expectedUpdatedAt:oldTime,reason:'Fixture update'};
 const races=await Promise.all([post(base+'/update',update),post(base+'/update',{...update,contractName:'Concurrent'})]);check(races.map(r=>r.statusCode).sort(),[200,409]);item=(await request('GET',base)).json().item;
 check(item.contractCode,'CTR0001');check(item.dgcDirection,'Input');check(item.status,'SUSPENDED');check(item.services.map(s=>s.id).sort(),initialIds);check(item.services.find(s=>s.serviceId===service.id).dgcStatus,'INACTIVE');check(item.services.find(s=>s.serviceId===service2.id).dgcStatus,'SUSPENDED');check(item.services.find(s=>s.serviceId===service2.id).fixedFee,'0');
 check((await post(base+'/update',{...update,contractCode:'CHANGED',expectedUpdatedAt:item.updatedAt})).statusCode,400);
 check((await post(base+'/update',update)).statusCode,409);
 for(const status of ['ACTIVE','EXPIRED','TERMINATED','DRAFT']){
 const res=await post(base+'/update',{...profile,status,serviceIds:[service.id,service2.id],expectedUpdatedAt:item.updatedAt,reason:'Local lifecycle fixture'});check(res.statusCode,200);item=res.json().item;check(item.status,status);check(item.services.map(s=>s.id).sort(),initialIds);check(item.services[0].dgcStatus,status==='DRAFT'?'ACTIVE':status);check(item.services[0].status,status==='DRAFT'||status==='ACTIVE'?'ACTIVE':'INACTIVE');
 }
 check(await prisma.revenue.count({where:{companyId:company.id}}),0);check(await prisma.reconciliation.count({where:{companyId:company.id}}),0);
 const log=await prisma.auditLog.findFirst({where:{entityId:item.id,action:'CONTRACT_EDIT'}});check(log.companyId,company.id);check(log.userId,user.id);check(log.newValue.services.length,2);
 const unused=(await post('/api/v1/service-contracts',{contractName:'Unused default fixture',partnerId:partner.id})).json().item;check(unused.contractCode,'CTR0002');check(unused.currency,'USD');check(unused.paymentTermDays,0);check(unused.services.length,0);
 const foreign=await prisma.contract.create({data:{companyId:other.id,partnerId:foreignPartner.id,contractCode:'F1',contractName:'Foreign',dgcDirection:'Output',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE'}});
 check((await request('GET','/api/v1/service-contracts/'+foreign.id)).statusCode,404);
 check((await post('/api/v1/service-contracts/'+foreign.id+'/update',{...update,expectedUpdatedAt:foreign.updatedAt.toISOString()})).statusCode,404);
 const legacy=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:'PROJECT1',contractName:'Project legacy',businessType:'PROJECT',contractType:'MAIN',valueType:'FIXED'}});
 check((await request('GET','/api/v1/service-contracts/'+legacy.id)).statusCode,404);check((await post('/api/v1/service-contracts/'+legacy.id+'/update',update)).statusCode,404);
 const list=(await request('GET','/api/v1/service-contracts')).json();check(list.total,2);check(list.items.some(c=>c.id===legacy.id),false);check((await request('GET','/api/v1/service-contracts?status=DRAFT')).json().total,2);
 const refs=(await request('GET','/api/v1/service-contracts/references')).json();check(refs.partners.length,1);check(refs.services.length,2);
 const unusedBase='/api/v1/service-contracts/'+unused.id;const del={expectedUpdatedAt:unused.updatedAt,reason:'Disposable only'};
 check((await post(unusedBase+'/delete',{...del,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'})).statusCode,409);
 check((await post(unusedBase+'/delete',del)).statusCode,200);check((await request('GET',unusedBase)).statusCode,404);check(await prisma.auditLog.count({where:{entityId:unused.id,action:'CONTRACT_DELETE'}}),1);
 for(const permission of ['CONTRACT_CREATE','CONTRACT_EDIT','CONTRACT_VIEW']){
 const p=await prisma.permission.findUniqueOrThrow({where:{code:permission}});await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}}});
 check((await request(permission==='CONTRACT_VIEW'?'GET':'POST',permission==='CONTRACT_VIEW'?base:permission==='CONTRACT_CREATE'?'/api/v1/service-contracts':base+'/update',{...profile,expectedUpdatedAt:item.updatedAt,reason:'Fixture'})).statusCode,403);
 }
 console.log(`${checks} inherited service contract checks passed (disposable company).`);
}finally{await app.close();await prisma.$disconnect();}
