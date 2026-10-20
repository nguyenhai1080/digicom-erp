import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {csrfToken,tokenHash} from '../dist/modules/auth/access.js';
import {dgcRolePresets} from '../dist/modules/auth/dgc-role-presets.js';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_dgc_roles_'))throw Error('Disposable DGC roles database required');
assert.equal(await prisma.user.count(),0,'Fresh synthetic database required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const presets=dgcRolePresets(),staff=presets.find(p=>p.donorRole==='Staff'),manager=presets.find(p=>p.donorRole==='Manager'),bod=presets.find(p=>p.donorRole==='BOD');
eq(presets.length,3);
for(const p of presets){eq(p.proposalOnly,true);eq(p.fullParity,false);eq(p.permissionCodes.some(c=>c.startsWith('PROJECT_')),false);eq(p.permissionCodes.length,new Set(p.permissionCodes).size);}
for(const c of ['RECON_REVIEW','RECON_APPROVE','INPUT_RECON_APPROVE','USER_CREATE','INVOICE_CANCEL','MANUAL_REVENUE_APPROVE'])eq(staff.permissionCodes.includes(c),false);
for(const c of ['MANUAL_REVENUE_CREATE','MANUAL_REVENUE_EDIT','MANUAL_REVENUE_SUBMIT'])eq(staff.permissionCodes.includes(c),true);
for(const c of ['INPUT_RECON_APPROVE','RECON_RESTAMP','SYSTEM_CONFIG_EDIT','ROLE_CREATE']){eq(manager.permissionCodes.includes(c),false);eq(bod.permissionCodes.includes(c),true);}
const company=await prisma.company.create({data:{companyCode:'DGC',companyName:'Synthetic DGC roles',defaultCurrency:'USD'}}),gst=await prisma.company.create({data:{companyCode:'GST',companyName:'Synthetic GST regression'}});
const codes=[...new Set([...presets.flatMap(p=>p.permissionCodes),'RECON_CANCEL'])],ps=await Promise.all(codes.map(code=>prisma.permission.create({data:{code,name:code,module:'FIXTURE'}})));
const origin='https://roles.example.test',config={secret:randomBytes(32).toString('hex'),appOrigin:origin,secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
async function actor(companyId,label,permissions){const u=await prisma.user.create({data:{companyId,email:randomUUID()+'@example.test',fullName:label,passwordHash:'unused'}}),r=await prisma.role.create({data:{companyId,code:label,name:label,permissions:{create:permissions.map(code=>({permissionId:ps.find(p=>p.code===code).id}))}}});await prisma.userRole.create({data:{userId:u.id,roleId:r.id}});const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId,userId:u.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return {user:u,role:r,raw};}
const s=await actor(company.id,'STAFF_FIXTURE',staff.permissionCodes),m=await actor(company.id,'MANAGER_FIXTURE',manager.permissionCodes),b=await actor(company.id,'BOD_FIXTURE',bod.permissionCodes),legacyCodes=['REVENUE_VIEW','RECON_UPLOAD','RECON_REVIEW','RECON_APPROVE','RECON_CANCEL'],oldDgc=await actor(company.id,'LEGACY_DGC_FIXTURE',legacyCodes),oldGst=await actor(gst.id,'LEGACY_GST_FIXTURE',legacyCodes),onlyApprove=await actor(company.id,'APPROVER_FIXTURE',['MANUAL_REVENUE_APPROVE']);
async function source(c){const partner=await prisma.partner.create({data:{companyId:c.id,partnerCode:'SYN',partnerKey:'SYN',legalName:'Synthetic partner',partnerType:'CUSTOMER',status:'ACTIVE'}}),service=await prisma.service.create({data:{companyId:c.id,serviceCode:'SYN',serviceKey:'SYN',serviceName:'Synthetic service',category:'OTHER'}}),contract=await prisma.contract.create({data:{companyId:c.id,partnerId:partner.id,contractCode:'SYN',contractName:'Synthetic output',dgcDirection:'Output',currency:'USD',status:'ACTIVE',businessType:'REVENUE_SHARE',contractType:'OTHER',valueType:'REVENUE_SHARE',services:{create:{companyId:c.id,serviceId:service.id,businessModel:'REVENUE_SHARE',currency:'USD',dgcStatus:'ACTIVE'}}}});return {partnerId:partner.id,rows:[{period:'2026-01',serviceId:service.id,contractId:contract.id,currency:'USD',amount:'100.00',deduction:'10.00',note:'Synthetic boundary test'}]};}
const body=await source(company),gstBody=await source(gst),app=await buildApp({auth:config,logger:false});
const req=(who,method,url,payload,extra={})=>app.inject({method,url,payload,headers:{origin,cookie:'erp_session='+who.raw,'x-csrf-token':csrfToken(who.raw,config.secret),...extra}}),post=(who,url,payload,extra)=>req(who,'POST',url,payload,extra);
async function expect(who,method,url,payload,status=200,extra){const r=await req(who,method,url,payload,extra);assert.equal(r.statusCode,status,r.body);checks++;return r.json();}
const base='/api/v1/manual-revenue',row=async id=>prisma.reconciliation.findUniqueOrThrow({where:{id}}),revision=async id=>({expectedUpdatedAt:(await row(id)).updatedAt.toISOString(),confirmed:true});
try{
 eq((await post(s,base+'/drafts',body,{cookie:''})).statusCode,401);
 for(const extra of [{'x-csrf-token':'bad'},{origin:'https://foreign.test'}])eq((await post(s,base+'/drafts',body,extra)).statusCode,403);
 await expect(s,'POST',base+'/drafts',{...body,companyId:gst.id},400);
 const flags=(await expect(s,'GET',base+'/references')).actions;eq(flags,{create:true,edit:true,submit:true,approve:false,cancel:false});
 const d=await expect(s,'POST',base+'/drafts',body,201),id=d.items[0].id;
 await expect(s,'POST',base+'/'+id+'/edit',{expectedUpdatedAt:(await row(id)).updatedAt.toISOString(),amount:'120.00',deduction:'12.00',note:'Synthetic edited amount'});
 await expect(s,'POST',base+'/'+id+'/submit',await revision(id));eq((await row(id)).status,'PENDING_APPROVAL');eq(await prisma.revenue.count(),0);
 for(const action of ['approve','cancel'])await expect(s,'POST',base+'/'+id+'/'+action,await revision(id),403);
 for(const [who,url] of [[s,'/output-recon/uploads/'+id+'/correct-financial'],[s,'/output-recon/uploads/'+id+'/finalize'],[s,'/input-recon/'+id+'/approve'],[m,'/input-recon/'+id+'/approve'],[onlyApprove,'/output-recon/uploads/'+id+'/finalize']])await expect(who,'POST','/api/v1'+url,{},403);
 await expect(s,'GET','/api/v1/users/roles',undefined,403);await expect(m,'GET','/api/v1/users/roles',undefined,403);
 await expect(oldDgc,'POST',base+'/drafts',body,403);for(const action of ['submit','approve'])await expect(oldDgc,'POST',base+'/'+id+'/'+action,await revision(id),403);
 await expect(m,'POST',base+'/'+id+'/approve',await revision(id));eq((await row(id)).status,'APPROVED');const revenue=await prisma.revenue.findFirstOrThrow({where:{reconciliationId:id}});eq(revenue.netAmount.toFixed(2),'108.00');eq(revenue.companyShareAmount.toFixed(2),'120.00');eq(revenue.whtAmount.toFixed(2),'12.00');eq(revenue.currency,'USD');eq(revenue.status,'INVOICE_READY');
 const ledger=await expect(s,'GET','/api/v1/revenues');eq(ledger.manualActions,flags);
 const editPermission=ps.find(p=>p.code==='MANUAL_REVENUE_EDIT');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:s.role.id,permissionId:editPermission.id}}});eq((await expect(s,'GET',base+'/references')).actions.edit,false);await expect(s,'POST',base+'/'+id+'/edit',{},403);
 const d2=await expect(s,'POST',base+'/drafts',{...body,rows:[{...body.rows[0],period:'2026-02'}]},201);await expect(onlyApprove,'POST',base+'/'+d2.items[0].id+'/approve',await revision(d2.items[0].id));
 // Foreign reconciliation IDs stay inaccessible after permission passes.
 const gd=await expect(oldGst,'POST',base+'/drafts',gstBody,201),gid=gd.items[0].id;await expect(m,'POST',base+'/'+gid+'/approve',await revision(gid),404);
 await expect(oldGst,'POST',base+'/'+gid+'/submit',await revision(gid));await expect(oldGst,'POST',base+'/'+gid+'/approve',await revision(gid));eq((await row(gid)).status,'APPROVED');
 const counts=async()=>[await prisma.role.count(),await prisma.user.count(),await prisma.auditLog.count(),await prisma.rolePermission.count()],before=await counts();const refs=await expect(b,'GET','/api/v1/users/roles');eq(refs.dgcPresets,presets);eq(await counts(),before);eq(refs.dgcPresets.flatMap(p=>p.permissionCodes).every(code=>refs.permissions.some(p=>p.code===code)),true);
 const userRolesBefore=await prisma.userRole.count();
 for(const p of refs.dgcPresets){const payload={code:p.code,name:p.name,permissionIds:p.permissionCodes.map(code=>ps.find(v=>v.code===code).id)};await expect(s,'POST','/api/v1/users/roles',payload,403);await expect(b,'POST','/api/v1/users/roles',payload);await expect(b,'POST','/api/v1/users/roles',payload,409);const saved=await prisma.role.findUniqueOrThrow({where:{companyId_code:{companyId:company.id,code:p.code}},include:{permissions:{include:{permission:true}}}});eq(saved.permissions.map(v=>v.permission.code).sort(),p.permissionCodes);}
 eq(await prisma.userRole.count(),userRolesBefore);eq(await prisma.user.count(),before[1]);
 const withheld=ps.find(p=>p.code==='MANUAL_REVENUE_EDIT');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:b.role.id,permissionId:withheld.id}}});const limited=await expect(b,'GET','/api/v1/users/roles');eq(limited.permissions.some(p=>p.code===withheld.code),false);eq(limited.dgcPresets,presets);await expect(b,'POST','/api/v1/users/roles',{code:'ESCALATION',name:'Must fail',permissionIds:[withheld.id]},403);
 const roleCreate=ps.find(p=>p.code==='ROLE_CREATE');await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:b.role.id,permissionId:roleCreate.id}}});eq((await expect(b,'GET','/api/v1/users/roles')).dgcPresets,[]);
 eq(await prisma.cashEntry.count(),0);eq(await prisma.cashAccount.count(),0);eq(await prisma.accountReceivable.count(),0);eq(await prisma.accountPayable.count(),0);
 console.log('PASS: '+checks+' DGC role/manual-revenue assertions: explicit capabilities, Staff submit without OCR edits, Manager approval, legacy GST, tenant/CSRF, readonly proposed presets and no cash.');
}finally{await app.close();await prisma.$disconnect();}
