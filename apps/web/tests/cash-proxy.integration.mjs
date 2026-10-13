import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const upstream=createServer(async(req,res)=>{let size=0;for await(const b of req)size+=b.length;if(req.url.endsWith('/document')){res.writeHead(200,{'content-type':'image/png','content-disposition':'inline; filename="test.png"'});res.end(Buffer.from([137,80,78,71]));}else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({size}));}});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),API_BASE_URL:'http://127.0.0.1:'+upstream.address().port},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('Proxy exited '+c)));});
 const base='http://127.0.0.1:'+port,body=JSON.stringify({synthetic:'a'.repeat(2*1024*1024)}),id='11111111-1111-4111-8111-111111111111';
 for(const path of ['/api/v1/cash-history/import','/api/v1/expenses','/api/v1/expenses/'+id+'/update']){const r=await fetch(base+path,{method:'POST',body,headers:{'content-type':'application/json'}});assert.equal(r.status,200);assert.equal((await r.json()).size,Buffer.byteLength(body));}
 let r=await fetch(base+'/api/v1/cash-accounts',{method:'POST',body:JSON.stringify({synthetic:'a'.repeat(40000)})});assert.equal(r.status,413);
 r=await fetch(base+'/api/v1/expenses/'+id+'/document');assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('content-disposition'),/^inline/);assert.equal((await r.arrayBuffer()).byteLength,4);
 console.log('PASS: proxy accepts historical imports/expense evidence, preserves ordinary body limit and inline image documents.');
}finally{child.kill();await new Promise(r=>upstream.close(r));}
