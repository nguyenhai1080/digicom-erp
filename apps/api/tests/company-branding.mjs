import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildApp} from '../dist/app.js';
const config={secret:randomBytes(32).toString('hex'),appOrigin:'https://erp.digicomjsc.com',secureCookies:true,bootstrapEnabled:false,bootstrapToken:'disabled',defaultCompanyCode:'DGC'};
const originalName=process.env.APP_NAME,originalTitle=process.env.APP_TITLE;
delete process.env.APP_NAME;delete process.env.APP_TITLE;
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 const dgc=await buildApp({auth:config,logger:false});let r=await dgc.inject({method:'GET',url:'/api/v1/public-config'});check(r.statusCode,200);check(r.json(),{companyCode:'DGC',appName:'DGC Finance',appTitle:'DGC Finance'});check(r.headers['cache-control'],'no-store');check(JSON.stringify(r.json()).includes(config.secret),false);
 check((await dgc.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'https://erp.gsttech.vn'},payload:{companyCode:'DGC',email:'fixture@example.test',password:'synthetic'}})).statusCode,403);await dgc.close();
 const gst=await buildApp({auth:{...config,defaultCompanyCode:'GST'},logger:false});check((await gst.inject({method:'GET',url:'/api/v1/public-config'})).json(),{companyCode:'GST',appName:'ERP Core',appTitle:'ERP Core - GST'});await gst.close();
 process.env.APP_NAME='DGC';process.env.APP_TITLE='DGC Finance · ERP';const custom=await buildApp({auth:config,logger:false});check((await custom.inject({method:'GET',url:'/api/v1/public-config'})).json().appTitle,'DGC Finance · ERP');await custom.close();
 const env={...process.env,NODE_ENV:'production'};delete env.API_BASE_URL;
 for(const file of ['../../apps/web/server.mjs','../../deploy/web/server.mjs']){const result=spawnSync(process.execPath,[resolve(file)],{env,encoding:'utf8',timeout:5000});check(result.status,1);check(result.stderr.includes('Production requires the dedicated API_BASE_URL'),true);}
 console.log('PASS: '+checks+' company branding, origin isolation and mandatory dedicated API configuration checks.');
}finally{if(originalName===undefined)delete process.env.APP_NAME;else process.env.APP_NAME=originalName;if(originalTitle===undefined)delete process.env.APP_TITLE;else process.env.APP_TITLE=originalTitle;}
