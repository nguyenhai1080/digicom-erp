import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {prisma} from '@erp/db';
import {buildApp} from '../dist/app.js';
const root=await mkdtemp(join(tmpdir(),'dgc-unified-web-')),web=join(root,'web'),config={secret:'synthetic-only-'.repeat(4),appOrigin:'https://dgc.example.test',secureCookies:true,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};const query=prisma.$queryRaw;prisma.$queryRaw=async()=>[{one:1}];
let app,legacy;
try{
 await mkdir(join(web,'assets'),{recursive:true});await writeFile(join(web,'index.html'),'<!doctype html><html><body>DGC synthetic UI</body></html>');await writeFile(join(web,'assets','app-12345678.js'),'console.log("fixture");');await writeFile(join(web,'.env'),'private-fixture');await writeFile(join(web,'.private.html'),'private-fixture');await mkdir(join(root,'outside'));await writeFile(join(root,'outside','leak.js'),'private-fixture');await symlink(join(root,'outside'),join(web,'escape'),'junction');
 app=await buildApp({auth:config,logger:false,webRoot:web});
 for(const url of ['/','/invoices','/invoices?page=2']){const r=await app.inject({url});eq(r.statusCode,200);eq(r.body.includes('DGC synthetic UI'),true);eq(r.headers['cache-control'],'no-cache');eq(r.headers['content-type'].startsWith('text/html'),true);}
 const asset=await app.inject({url:'/assets/app-12345678.js'});eq(asset.statusCode,200);eq(asset.headers['cache-control'],'public, max-age=31536000, immutable');eq(asset.body,'console.log("fixture");');
 eq((await app.inject({method:'HEAD',url:'/'})).body,'');eq((await app.inject({method:'POST',url:'/invoices'})).statusCode,405);
 for(const url of ['/assets/missing.js','/assets/missing','/.env','/%2eenv','/.private.html','/escape/leak.js','/source.ts','/assets/app.js.map','/api/unknown','/API/unknown']){const r=await app.inject({url});eq(r.statusCode,404);eq(r.body.includes('DGC synthetic UI'),false);eq(r.body.includes('private-fixture'),false);}
 const health=await app.inject({url:'/api/v1/health'});eq(health.statusCode,200);eq(health.json().database,'connected');
 const publicConfig=await app.inject({url:'/api/v1/public-config'});eq(publicConfig.statusCode,200);eq(publicConfig.json().companyCode,'DGC');eq(publicConfig.headers['cache-control'],'no-store');
 eq((await app.inject({url:'/api/v1/auth/me'})).statusCode,401);eq((await app.inject({method:'POST',url:'/api/v1/auth/bootstrap',payload:{}})).statusCode,404);
 eq((await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.appOrigin},payload:{email:'invalid'}})).statusCode,400);
 eq((await app.inject({url:'/%ZZ'})).statusCode,400);eq(asset.headers['x-content-type-options'],'nosniff');eq(asset.headers['content-security-policy'].includes("connect-src 'self'"),true);
 legacy=await buildApp({auth:config,logger:false});eq((await legacy.inject({url:'/'})).json().database,'connected');eq((await legacy.inject({url:'/invoices'})).statusCode,404);
 await assert.rejects(()=>buildApp({auth:config,logger:false,webRoot:join(root,'missing')}),/ENOENT/);n++;
 await assert.rejects(()=>buildApp({auth:config,logger:false,webRoot:'relative/web'}),/absolute/);n++;
 // Smoke the actual production Vite output through the same Fastify process.
 const built=resolve('apps/web/dist');const html=await readFile(join(built,'index.html'),'utf8'),actual=await buildApp({auth:config,logger:false,webRoot:built});
 try{eq((await actual.inject({url:'/'})).body,html);const scripts=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);eq(scripts.length>0,true);for(const url of scripts)eq((await actual.inject({url})).statusCode,200);}finally{await actual.close();}
 console.log(`Single website web/API: ${n} assertions passed; built UI/assets, API auth/health, paths and legacy mode`);
}finally{await app?.close();await legacy?.close();prisma.$queryRaw=query;await prisma.$disconnect();if(!resolve(root).startsWith(resolve(tmpdir())+sep+'dgc-unified-web-'))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
