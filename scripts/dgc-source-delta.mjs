import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {sourceDelta} from './dgc-migration/source-delta.mjs';
const args=process.argv.slice(2),option=n=>{const i=args.indexOf('--'+n);if(i<0||!args[i+1])throw Error('Missing --'+n);return args[i+1];};
const root=await realpath('artifacts');
async function privateFile(p,existing=true){const target=existing?await realpath(p):resolve(await realpath(resolve(p,'..')),resolve(p).split(/[\\/]/).at(-1)),r=relative(root,target);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Delta evidence must remain in private artifacts');return target;}
const read=async p=>JSON.parse(await readFile(await privateFile(p),'utf8'));
const report=sourceDelta(await read(option('baseline')),await read(option('capture')));
await writeFile(await privateFile(option('out'),false),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({reportHash:report.reportHash,summary:report.summary,contentUnchanged:report.contentUnchanged,finalFrozenSnapshot:false,financialPosting:false}));
