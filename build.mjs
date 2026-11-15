// Type-checking and compilation happen in package-single-site.mjs before publish.
// The small host verifies that exact checked bundle, then generates its DB client.
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'BUILD_MANIFEST.json'),'utf8'));
const deployment=JSON.parse(await readFile(resolve(root,'DEPLOYMENT.json'),'utf8'));
if(manifest.format!=='dgc-checked-build-v1'||manifest.sourceCommit!==deployment.sourceCommit||!manifest.files||!Object.keys(manifest.files).length)throw Error('Missing checked release manifest; regenerate the deployment package');
for(const [name,hash] of Object.entries(manifest.files)){
 const path=resolve(root,name),rel=relative(root,path);
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||!/^[a-f0-9]{64}$/.test(String(hash)))throw Error('Invalid checked release path');
 if(createHash('sha256').update(await readFile(path)).digest('hex')!==hash)throw Error('Checked source or build changed: '+name+'. Regenerate the deployment package');
}
await readFile(resolve(root,'dist/server.js'));await readFile(resolve(root,'database/dist/index.js'));
const result=spawnSync(process.execPath,['--max-old-space-size=192',resolve(root,'node_modules/prisma/build/index.js'),'generate','--schema','database/prisma/schema.prisma'],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exitCode=result.status??1;
