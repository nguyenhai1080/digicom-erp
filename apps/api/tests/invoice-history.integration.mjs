import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,unlink,rm,rename,symlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
import {tokenHash} from '../dist/modules/auth/access.js';
import {invoiceHistoryFixture,archiveDigest} from './invoice-history.fixtures.mjs';
assert.ok(new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_archive_'));assert.equal(await prisma.user.count(),0,'Fresh synthetic database required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const company=await prisma.company.create({data:{companyCode:'DGC',companyName:'Synthetic archive DGC'}}),gst=await prisma.company.create({data:{companyCode:'GST',companyName:'Synthetic archive GST'}}),permission=await prisma.permission.create({data:{code:'INVOICE_VIEW',name:'Invoice reader',module:'FIXTURE'}});
async function actor(c,canRead){const u=await prisma.user.create({data:{companyId:c.id,email:randomUUID()+'@example.test',fullName:'Synthetic reader',passwordHash:'unused'}});if(canRead){const r=await prisma.role.create({data:{companyId:c.id,code:'READER',name:'Reader',permissions:{create:{permissionId:permission.id}}}});await prisma.userRole.create({data:{roleId:r.id,userId:u.id}});}const raw=randomBytes(32).toString('hex');await prisma.authSession.create({data:{companyId:c.id,userId:u.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+3600000)}});return {u,raw};}
const reader=await actor(company,true),denied=await actor(company,false),foreign=await actor(gst,true),base=await mkdtemp(join(tmpdir(),'dgc-archive-runtime-')),fixture=await invoiceHistoryFixture(join(base,'archive'));
const app=await buildApp({logger:false,auth:{secret:randomBytes(32).toString('hex'),appOrigin:'https://archive.example.test',secureCookies:false,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'}}),path='/api/v1/invoice-history',entry=fixture.index.entries[0];
async function response(who,url,status=200,method='GET'){const r=await app.inject({method,url,headers:who?{cookie:'erp_session='+who.raw}:{}});eq(r.statusCode,status);return r;}
const get=async(who,url,status=200)=>(await response(who,url,status)).json();
const counts=()=>Promise.all([prisma.invoice.count(),prisma.accountReceivable.count(),prisma.invoicePayment.count(),prisma.cashEntry.count(),prisma.document.count(),prisma.auditLog.count()]);
function configured(){process.env.DGC_INVOICE_ARCHIVE_ROOT=fixture.root;process.env.DGC_INVOICE_ARCHIVE_HASH=fixture.index.archiveHash;process.env.DGC_INVOICE_ARCHIVE_COMPANY_ID=company.id;}
try{
 for(const key of ['DGC_INVOICE_ARCHIVE_ROOT','DGC_INVOICE_ARCHIVE_HASH','DGC_INVOICE_ARCHIVE_COMPANY_ID'])delete process.env[key];
 eq((await get(reader,path)).configured,false);await get(null,path,401);
 configured();for(const suffix of ['', '/'+entry.archiveId,'/'+entry.archiveId+'/pdf']){await get(denied,path+suffix,403);await get(foreign,path+suffix,404);await get(null,path+suffix,401);}
 process.env.DGC_INVOICE_ARCHIVE_COMPANY_ID=randomUUID();await get(reader,path,404);configured();
 delete process.env.DGC_INVOICE_ARCHIVE_HASH;await get(reader,path,503);configured();
 for(const q of ['?page=0','?page=no','?companyId='+gst.id,'?invoiceNumber='+'a'.repeat(201)])await get(reader,path+q,400);
 const before=await counts(),first=await get(reader,path);eq(first.items.length,10);eq(first.total,12);eq(first.pages,2);eq(first.pageSize,10);eq(first.readOnly,true);eq(first.postingAllowed,false);eq(first.items[0].payable,'-90.0000');eq(first.items[0].invoiceDate,'2026-01-10');eq(first.items[0].source.sourceRow,2);
 eq((await get(reader,path+'?page=2')).items.length,2);eq((await get(reader,path+'?page=999')).page,2);eq((await get(reader,path+'?invoiceNumber=SYN-DUPLICATE')).total,2);eq((await get(reader,path+'?invoiceNumber=missing')).total,0);
 const detail=await get(reader,path+'/'+entry.archiveId);eq(detail.details.length,12);eq(detail.details[0].payable,'-90');eq(detail.revisionLinks[0].resolved,false);eq(detail.header.Partner_ID,'SYN_SOURCE');eq(JSON.stringify(detail).includes('DO_NOT_EXPOSE'),false);eq('capturedPayments' in detail,false);eq(JSON.stringify(detail).includes(fixture.root),false);
 const pdf=await response(reader,path+'/'+entry.archiveId+'/pdf');eq(pdf.headers['content-type'],'application/pdf');eq(pdf.rawPayload.equals(fixture.pdf),true);eq(pdf.headers['cache-control'],'no-store');eq(pdf.headers['content-disposition'],'inline; filename="historical-invoice.pdf"');
 await get(reader,path+'/not-a-hash',400);await get(reader,path+'/'+'f'.repeat(64),404);await response(reader,path+'/'+entry.archiveId,404,'POST');
 process.env.DGC_INVOICE_ARCHIVE_HASH='0'.repeat(64);await get(reader,path,409);configured();
 const payloadPath=join(fixture.root,entry.payloadPath),saved=await readFile(payloadPath);await writeFile(payloadPath,'{}');await get(reader,path,409);await get(reader,path+'/'+entry.archiveId,409);await get(reader,path+'/'+entry.archiveId+'/pdf',409);await writeFile(payloadPath,saved);
 const pdfPath=join(fixture.root,entry.pdf.path);await writeFile(pdfPath,'%PDF-changed');await get(reader,path+'/'+entry.archiveId+'/pdf',409);await writeFile(pdfPath,fixture.pdf);
 const manifestPath=join(fixture.root,'archive.json'),manifest=await readFile(manifestPath),changed=structuredClone(fixture.index);changed.entries[0].payloadPath='../escape.json';const {archiveHash,...body}=changed;changed.archiveHash=archiveDigest(body);await writeFile(manifestPath,JSON.stringify(changed));await get(reader,path,409);await writeFile(manifestPath,manifest);
 const markerPath=join(fixture.root,'COMPLETE.json'),marker=await readFile(markerPath);await unlink(markerPath);await get(reader,path,409);await writeFile(markerPath,marker);
 await rename(join(fixture.root,'records'),join(fixture.root,'records-real'));await symlink(join(fixture.root,'records-real'),join(fixture.root,'records'),process.platform==='win32'?'junction':'dir');await get(reader,path,409);await (process.platform==='win32'?rmdir(join(fixture.root,'records')):unlink(join(fixture.root,'records')));await rename(join(fixture.root,'records-real'),join(fixture.root,'records'));
 eq(await counts(),before);eq((await get(reader,path)).total,12);
 console.log('PASS: '+checks+' invoice history runtime assertions: permission/tenant binding, disabled config, pagination, original evidence, source negatives, privacy, PDF bytes, tamper/path guards and no posting.');
}finally{await app.close();await prisma.$disconnect();if(!resolve(base).startsWith(resolve(tmpdir())+sep+'dgc-archive-runtime-'))throw Error('Refusing cleanup outside fixture directory');await rm(base,{recursive:true,force:true});}
