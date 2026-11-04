import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,digest} from './core.mjs';
import {verifyVisualUsdFiles} from './visual-usd-source.mjs';
const b='artifacts/dgc-migration/',obs=JSON.parse(await readFile(b+'20261104/document-review/visual-usd-observations.json','utf8')),temp=await mkdtemp(join(tmpdir(),'dgc-visual-usd-')),pdf=join(temp,obs.fileId+'.pdf'),render=join(temp,obs.visualRender.relativePath);let n=0;
try{
 await copyFile(b+'20261021/source-recons/'+obs.fileId+'.pdf',pdf);await copyFile(b+'20261104/document-review/'+obs.visualRender.relativePath,render);const options={observations:obs,root:temp,renderRoot:temp,python:process.env.DGC_PDF_PYTHON??resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')};
 await verifyVisualUsdFiles(options);n++;const before=canonical(obs),forged=structuredClone(obs);forged.usd.Partner_Revenue_USD='1653.29';const {observationHash,...body}=forged;forged.observationHash=digest(body);await assert.rejects(()=>verifyVisualUsdFiles({...options,observations:forged}),/pin differs/);n++;
 for(const file of [pdf,render]){const original=await readFile(file),changed=Buffer.from(original);changed[changed.length-1]^=1;await writeFile(file,changed);try{await assert.rejects(()=>verifyVisualUsdFiles(options),/bytes differ/);n++;}finally{await writeFile(file,original);}await verifyVisualUsdFiles(options);n++;}
 assert.equal(canonical(obs),before);n++;console.log(`Visual USD fresh-file guards: ${n} assertions passed; same-root byte tampering and rehashed observation forgery rejected`);
}finally{if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith('dgc-visual-usd-'))throw Error('Unexpected private guard temp directory');await rm(temp,{recursive:true,force:true});}
