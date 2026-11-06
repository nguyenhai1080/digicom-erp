import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {tokenHash} from '../dist/modules/auth/access.js';
const url=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/dgc_migration_staging_recon_history_20261107(?:_v\d+)?_synthetic$/.test(url.pathname));
assert.equal(await prisma.user.count(),0,'Fresh synthetic DB required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const company=await prisma.company.create({data:{companyCode:'DGC',companyName:'Synthetic Digicom'}}),other=await prisma.company.create({data:{companyCode:'GST',companyName:'Synthetic other'}});
const permission=await prisma.permission.create({data:{code:'RECON_VIEW',name:'Read recon',module:'TEST'}});
async function actor(c,read){const u=await prisma.user.create({data:{companyId:c.id,email:randomUUID()+'@example.test',fullName:'Synthetic reader',passwordHash:'unused'}});if(read){const role=await prisma.role.create({data:{companyId:c.id,code:'READER',name:'Reader',permissions:{create:{permissionId:permission.id}}}});await prisma.userRole.create({data:{userId:u.id,roleId:role.id}});}const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:c.id,userId:u.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return raw;}
const reader=await actor(company,true),denied=await actor(company,false),foreign=await actor(other,true);
const partner=await prisma.partner.create({data:{companyId:company.id,partnerCode:'SYN-P',partnerKey:'SYN-P',legalName:'Synthetic Partner',partnerType:'CUSTOMER'}});
const service=await prisma.service.create({data:{companyId:company.id,serviceCode:'SYN-S',serviceKey:'SYN-S',serviceName:'Synthetic service',category:'OTHER'}});
const contract=await prisma.contract.create({data:{companyId:company.id,partnerId:partner.id,contractCode:'SYN-C',contractName:'Synthetic contract',contractType:'OTHER',businessType:'REVENUE_SHARE',valueType:'REVENUE_SHARE'}});
const snapshotHash='a'.repeat(64),rowHash='b'.repeat(64),sourceSpreadsheetId='synthetic-source';
await prisma.dgcImportSnapshot.create({data:{companyId:company.id,snapshotHash,sourceSpreadsheetId,sourceMetadata:{synthetic:true},rowCount:1}});
await prisma.auditLog.create({data:{companyId:company.id,action:'DGC_CAPTURED_BOOK_TRANSFER',entityType:'Configuration',entityId:randomUUID(),newValue:{sourceSnapshotHash:snapshotHash}}});
const source={sheetId:1,sourceRow:2,rowHash,legacyId:'RPD-SYNTHETIC',snapshotHash};
await prisma.dgcImportRow.create({data:{companyId:company.id,snapshotHash,sheetId:1,sourceRow:2,rowHash,legacyId:source.legacyId,sheetName:'43_RECON_PDF_HEADER',payload:{synthetic:true}}});
const storage=await mkdtemp(join(tmpdir(),'dgc-recon-history-'));process.env.STORAGE_ROOT=storage;
const aid=randomUUID(),bytes=Buffer.from('%PDF-1.4\nSynthetic historical bytes\n%%EOF'),path=`dgc-history/${company.id}/${aid}.pdf`;
await mkdir(join(storage,'dgc-history',company.id),{recursive:true});await writeFile(join(storage,path),bytes);
const attachment=await prisma.attachment.create({data:{id:aid,companyId:company.id,originalFilename:'synthetic-recon.pdf',storedFilename:aid+'.pdf',storageProvider:'local',storagePath:path,mimeType:'application/pdf',fileSize:BigInt(bytes.length),checksumSha256:createHash('sha256').update(bytes).digest('hex')}});
const document=await prisma.document.create({data:{companyId:company.id,documentCode:'SYN-DOC',documentType:'DGC_SOURCE_RECON',entityType:'DGC_SOURCE_RECON',entityId:randomUUID(),attachmentId:aid}});
await prisma.dgcImportLink.create({data:{companyId:company.id,sourceSpreadsheetId,...source,targetModel:'document',targetId:document.id,targetHash:'c'.repeat(64)}});
async function recon(n,extra={}){const start=new Date('2026-09-01'),end=new Date('2026-09-30');return prisma.reconciliation.create({data:{companyId:company.id,partnerId:partner.id,contractId:contract.id,reconCode:'SYN-'+String(n).padStart(2,'0'),logicalGroupId:randomUUID(),periodStart:start,periodEnd:end,currency:'USD',sourceType:'SYSTEM_IMPORT',status:'APPROVED',ocrRawJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash,documentSource:source,privateActor:'DO_NOT_EXPOSE'},...extra,items:{create:{companyId:company.id,serviceId:service.id,lineNo:1,businessScopeKey:'synthetic-'+n,periodStart:start,periodEnd:end,grossRevenue:'-7.1234',netRevenue:'-5.6789'}}}});}
const first=await recon(0);for(let i=1;i<12;i++)await recon(i);
const {snapshotHash:ignoredSnapshot,...legacySource}=source;await prisma.reconciliation.update({where:{id:first.id},data:{ocrRawJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:'e'.repeat(64),documentSource:legacySource}}});
const archived=await recon(12,{isCurrent:false,status:'SUPERSEDED',periodStart:new Date('2026-10-01'),periodEnd:new Date('2026-10-31')});
const missing=await recon(13,{ocrRawJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash,documentSource:{...source,rowHash:'d'.repeat(64)}}});
await recon(14,{sourceType:'FILE_UPLOAD',ocrRawJson:{}});
const app=await buildApp({logger:false,auth:{secret:randomBytes(32).toString('hex'),appOrigin:'https://synthetic.example.test',secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'}});
async function get(token,path,status=200){const r=await app.inject({method:'GET',url:'/api/v1/output-recon/history'+path,headers:token?{cookie:'erp_session='+token}:{}});eq(r.statusCode,status);return r;}
const fingerprint=async()=>{const rows=await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`),result={};for(const {tablename} of rows){assert(/^[a-z_]+$/.test(tablename));result[tablename]=await prisma.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM public."${tablename}" t`);}return result;};
try{
 const before=await fingerprint();
 await get(null,'',401);await get(denied,'',403);await get(foreign,'',404);
 const list=(await get(reader,'')).json();eq(list.total,13);eq(list.items.length,10);eq(list.limit,10);eq(list.readOnly,true);eq(list.items[0].code,source.legacyId);eq(list.items[0].hasPdf,true);eq(list.items[0].services[0].serviceKey,'SYN-S');eq(JSON.stringify(list).includes('DO_NOT_EXPOSE'),false);eq(JSON.stringify(list).includes(storage),false);
 eq((await get(reader,'?page=2')).json().items.length,3);eq((await get(reader,'?page=999')).json().page,2);
 eq((await get(reader,'?includeArchived=true')).json().total,14);eq((await get(reader,'?period=2026-10')).json().total,0);eq((await get(reader,'?period=2026-10&includeArchived=true')).json().total,1);
 for(const search of ['syn-s','synthetic Partner','rpd-synthetic'])eq((await get(reader,'?search='+encodeURIComponent(search))).json().total,13);
 eq((await get(reader,'?search=absent')).json().total,0);
 for(const q of ['?page=0','?period=2026-13','?includeArchived=1','?companyId='+other.id,'?search='+'a'.repeat(201)])await get(reader,q,400);
 const pdf=await get(reader,'/'+first.id+'/pdf');eq(pdf.rawPayload.equals(bytes),true);eq(pdf.headers['cache-control'],'no-store');
 await get(reader,'/'+archived.id+'/pdf');await get(reader,'/'+missing.id+'/pdf',404);await get(foreign,'/'+first.id+'/pdf',404);await get(denied,'/'+first.id+'/pdf',403);await get(null,'/'+first.id+'/pdf',401);await get(reader,'/bad/pdf',400);
 await writeFile(join(storage,path),'tampered');await get(reader,'/'+first.id+'/pdf',409);await writeFile(join(storage,path),bytes);
 eq(await fingerprint(),before);
 console.log('PASS '+checks+' synthetic history checks: pagination/search/archive/permission/tenant/PDF integrity/privacy and all 63 table fingerprints unchanged.');
}finally{await app.close();await prisma.$disconnect();}
