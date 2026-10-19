import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';

// Inspect the private snapshot; never evaluate donor code or print its contents.
const directory=process.argv[2];
if(!directory)throw new Error('Usage: node scripts/verify-dgc-donor.mjs <private deployed-v61 directory>');
const root=resolve(directory);
const catalog=JSON.parse(await readFile(new URL('../docs/DGC_SOURCE_INVENTORY.json',import.meta.url),'utf8'));
let failed=0;
for(const item of catalog.files){
  const path=resolve(root,item.file),local=relative(root,path);
  if(local==='..'||local.startsWith('..\\')||local.startsWith('../')||isAbsolute(local))throw new Error('Invalid donor catalog path');
  try{
    const data=await readFile(path);
    const matches=createHash('sha256').update(data).digest('hex')===item.sha256;
    if(!matches)failed++;
    console.log(`${matches?'OK':'HASH MISMATCH'} ${item.file}`);
  }catch{failed++;console.log(`UNREADABLE ${item.file}`);}
}
console.log(`${catalog.files.length-failed}/${catalog.files.length} donor files match the recorded v61 snapshot. Live deployment version remains unverified.`);
if(failed)process.exitCode=1;
