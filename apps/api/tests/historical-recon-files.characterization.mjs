import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,rename,symlink,rmdir,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {prisma} from '@erp/db';
import {digest,canonical} from '../../../scripts/dgc-migration/core.mjs';
import {historicalRevenueFixture} from './historical-revenue-source.fixtures.mjs';
import {readHistoricalRevenueSource,historicalRevenueSourceRoutes} from '../dist/modules/projects/historical-revenue-source.js';
import {readHistoricalReconPdf,historicalReconPdfConfiguration} from '../dist/modules/projects/historical-recon-files.js';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(fn,status=409)=>{await assert.rejects(fn,e=>e.statusCode===status);n++;};
const f=historicalRevenueFixture(),source=await readHistoricalRevenueSource(f.tx,f.companyId,f.id,f.snapshot.snapshotHash),binding={snapshotHash:f.snapshot.snapshotHash,document:source.source.document,fileId:source.source.fileId};
const base=await mkdtemp(join(tmpdir(),'dgc-recon-custody-')),pdf=Buffer.from('%PDF-1.4\nSynthetic byte custody fixture; not a semantic PDF acceptance\n%%EOF'),sha=v=>createHash('sha256').update(v).digest('hex');
const body={format:'dgc-source-recon-files-v1',snapshotHash:f.snapshot.snapshotHash,filePlanHash:'a'.repeat(64),sourceRevisionGuarantee:'CAPTURE_ONLY',complete:false,postingAllowed:false,acceptance:false,pdfSemanticsVerified:false,files:[{fileId:binding.fileId,title:'PRIVATE_TITLE',url:'PRIVATE_SOURCE_URL',mimeType:'application/pdf',relativePath:binding.fileId+'.pdf',size:pdf.length,sha256:sha(pdf),sourceHeaders:[binding.document]}],unavailable:[]};
const manifest={...body,manifestHash:digest(body)},config={root:base,manifestHash:manifest.manifestHash,snapshotHash:f.snapshot.snapshotHash},manifestPath=join(base,'recon-files-manifest.json'),pdfPath=join(base,binding.fileId+'.pdf');
async function save(m=manifest){await writeFile(manifestPath,JSON.stringify(m));await writeFile(pdfPath,pdf);}
const read=(c=config,b=binding)=>readHistoricalReconPdf(c,b),pinChanged=m=>{const {manifestHash,...body}=m;return {...body,manifestHash:digest(body)};};
const envKeys=['DGC_MIGRATION_EVIDENCE_COMPANY_ID','DGC_MIGRATION_EVIDENCE_SNAPSHOT_HASH','DGC_RECON_EVIDENCE_ROOT','DGC_RECON_EVIDENCE_MANIFEST_HASH'],savedEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const oldSession=prisma.authSession.findUnique,oldTx=prisma.$transaction,app=Fastify();let actor='admin',transactions=0;
try{
 await save();const before=await readFile(pdfPath),result=await read();eq(result.bytes.equals(pdf),true);eq(result.metadata.bytesVerified,true);eq(result.metadata.manifestComplete,false);eq(result.metadata.pdfSemanticsVerified,false);eq(result.metadata.signedStatusVerified,false);eq(result.metadata.operationalUseAllowed,false);eq(result.metadata.postingAllowed,false);eq(result.metadata.historicalCashPosting,false);eq(result.metadata.acceptance,false);eq(result.metadata.sourceDocument,binding.document);eq((await readFile(pdfPath)).equals(before),true);eq(JSON.stringify(result.metadata).includes('PRIVATE_'),false);eq(JSON.stringify(result.metadata).includes(base),false);
 await reject(()=>read({...config,manifestHash:'0'.repeat(64)}));await reject(()=>read({...config,snapshotHash:'0'.repeat(64)}));await reject(()=>read(config,{...binding,document:{...binding.document,rowHash:'0'.repeat(64)}}));await reject(()=>read(config,{...binding,fileId:'../../escape'}));
 const absent='Z'.repeat(25);await reject(()=>read(config,{...binding,fileId:absent}),404);
 for(const mutate of [m=>m.files.push(m.files[0]),m=>m.files[0].sourceHeaders.push(m.files[0].sourceHeaders[0]),m=>m.files[0].relativePath='../escape.pdf',m=>m.files[0].mimeType='text/html',m=>m.postingAllowed=true,m=>m.acceptance=true,m=>m.pdfSemanticsVerified=true,m=>m.files[0].size=64*1024*1024+1,m=>m.files[0].sourceHeaders[0].extra='x']){
  const m=structuredClone(manifest);mutate(m);const changed=pinChanged(m);await writeFile(manifestPath,JSON.stringify(changed));await reject(()=>read({...config,manifestHash:changed.manifestHash}));
 }
 await save();await writeFile(pdfPath,Buffer.from(pdf).fill(32,0,5));await reject(()=>read());await save();await writeFile(pdfPath,Buffer.concat([pdf,Buffer.from('extra')]));await reject(()=>read());await save();await writeFile(pdfPath,Buffer.from(pdf).fill(32,8,12));await reject(()=>read());await save();
 // Windows file symlinks require a privilege absent on the test host. Root
 // junction rejection is still exercised below; file symlinks run on POSIX.
 if(process.platform!=='win32'){
  await rename(pdfPath,pdfPath+'.real');await symlink(pdfPath+'.real',pdfPath,'file');await reject(()=>read());await unlink(pdfPath);await rename(pdfPath+'.real',pdfPath);
  await rename(manifestPath,manifestPath+'.real');await symlink(manifestPath+'.real',manifestPath,'file');await reject(()=>read());await unlink(manifestPath);await rename(manifestPath+'.real',manifestPath);
 }
 const alias=base+'-alias';await symlink(base,alias,process.platform==='win32'?'junction':'dir');try{await reject(()=>read({...config,root:alias}));}finally{await(process.platform==='win32'?rmdir(alias):unlink(alias));}
 for(const k of envKeys)delete process.env[k];assert.throws(()=>historicalReconPdfConfiguration(f.snapshot.snapshotHash),e=>e.statusCode===503);n++;
 process.env.DGC_MIGRATION_EVIDENCE_COMPANY_ID=f.companyId;process.env.DGC_MIGRATION_EVIDENCE_SNAPSHOT_HASH=f.snapshot.snapshotHash;
 const session=(permissions,companyCode='DGC',companyId=f.companyId)=>({expiresAt:new Date(Date.now()+3600000),user:{id:randomUUID(),companyId,status:'ACTIVE',fullName:'Synthetic',email:'synthetic@example.invalid',company:{companyCode,status:'ACTIVE'},roles:[{role:{companyId,status:'ACTIVE',permissions:permissions.map(code=>({permission:{code}}))}}]}});
 prisma.authSession.findUnique=async()=>actor==='expired'?null:actor==='foreign'?session(['SYSTEM_CONFIG_EDIT'],'DGC',randomUUID()):session(actor==='staff'?['REVENUE_VIEW']:['SYSTEM_CONFIG_EDIT'],actor==='gst'?'GST':'DGC');prisma.$transaction=async fn=>{transactions++;return fn(f.tx);};
 await app.register(cookie);app.setErrorHandler((e,req,reply)=>reply.code(e.statusCode??500).send({message:e.message}));await app.register(historicalRevenueSourceRoutes,{});
 const prefix='/api/v1/dgc-migration/revenues/'+f.id,request=async(suffix,method='GET')=>app.inject({method,url:prefix+suffix,headers:{cookie:'erp_session='+'a'.repeat(64)}});
 eq((await request('/source-pdf')).statusCode,503);process.env.DGC_RECON_EVIDENCE_ROOT=base;process.env.DGC_RECON_EVIDENCE_MANIFEST_HASH=manifest.manifestHash;
 const count=transactions;for(const [who,status] of [['staff',403],['gst',404],['foreign',404],['expired',401]])for(const suffix of ['/source-pdf','/source-pdf-info']){actor=who;eq((await request(suffix)).statusCode,status);}eq(transactions,count);actor='admin';
 const info=await request('/source-pdf-info');eq(info.statusCode,200);eq(info.json().bytesVerified,true);eq(info.json().operationalUseAllowed,false);eq(info.json().pdfUrl,prefix+'/source-pdf');eq(info.body.includes('PRIVATE_'),false);eq(info.body.includes(base),false);eq(info.headers['cache-control'],'no-store');
 const download=await request('/source-pdf');eq(download.statusCode,200);eq(download.rawPayload.equals(pdf),true);eq(download.headers['content-type'],'application/pdf');eq(download.headers['content-disposition'],'attachment; filename="historical-reconciliation.pdf"');eq(download.headers['x-content-type-options'],'nosniff');eq(download.headers['cache-control'],'no-store');
 eq((await request('/source-pdf?root='+encodeURIComponent(base))).statusCode,400);eq((await request('/source-pdf','POST')).statusCode,404);process.env.DGC_RECON_EVIDENCE_MANIFEST_HASH='0'.repeat(64);eq((await request('/source-pdf')).statusCode,409);process.env.DGC_RECON_EVIDENCE_MANIFEST_HASH=manifest.manifestHash;
 await writeFile(pdfPath,'changed');eq((await request('/source-pdf')).statusCode,409);await save();eq((await request('/source-evidence')).json().migrationProvenance.originalPdfVerified,false);
 console.log(`Historical recon PDF custody: ${n} assertions passed; filesystem bytes and HTTP auth/DB doubles, no financial writes`);
}finally{
 prisma.authSession.findUnique=oldSession;prisma.$transaction=oldTx;for(const [k,v] of Object.entries(savedEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;await app.close();
 if(!resolve(base).startsWith(resolve(tmpdir())+sep+'dgc-recon-custody-'))throw Error('Refuse fixture cleanup outside temp directory');await rm(base,{recursive:true,force:true});
}
