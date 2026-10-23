import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {masterTransfer} from './dgc-migration/master-transfer.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing --'+name);return args[i+1];};
const root=resolve('artifacts'),out=resolve(option('out')),rel=relative(root,out);
if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Transfer files must stay in private artifacts');
const actualRoot=await realpath(root);let existing=resolve(out,'..');
for(;;){try{const actual=await realpath(existing),r=relative(actualRoot,actual);if(r.startsWith('..')||isAbsolute(r))throw Error('Transfer output escapes private artifacts');break;}catch(e){if(e.code!=='ENOENT')throw e;existing=resolve(existing,'..');}}
const snapshot=JSON.parse(await readFile(option('snapshot'),'utf8')),decisions=args.includes('--decisions')?JSON.parse(await readFile(option('decisions'),'utf8')):undefined;
const result=masterTransfer(snapshot,decisions,{expectedPlanHash:option('plan-hash'),expectedDatabase:option('database'),operatorEmail:option('operator-email'),commit:args.includes('--commit'),expectedTransferHash:args.includes('--commit')?option('transfer-hash'):undefined,reason:args.includes('--commit')?option('reason'):undefined});
await mkdir(resolve(out,'..'),{recursive:true});
// Exclusive creation prevents an apply script silently replacing a reviewed rehearsal.
await writeFile(out,result.sql,{encoding:'utf8',flag:'wx',mode:0o600});
await writeFile(out+'.bundle.json',JSON.stringify({transferHash:result.transferHash,bundle:result.bundle}),{encoding:'utf8',flag:'wx',mode:0o600});
const {sql,bundle,statements,...summary}=result;console.log(JSON.stringify({...summary,output:out,executed:false}));
