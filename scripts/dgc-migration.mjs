import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {normalizeCapture,preflight,masterPlan,verifySnapshot} from './dgc-migration/core.mjs';
import {requireStaging,stageSnapshot,applyMasters} from './dgc-migration/staging.mjs';

const [command,...args]=process.argv.slice(2);
function option(name){const i=args.indexOf('--'+name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing --'+name);return args[i+1];}
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const resolutions=args.includes('--decisions')?await json(option('decisions')):undefined;
function privateOutput(path){const root=resolve('artifacts'),target=resolve(path),rel=relative(root,target);if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Private reports must be written inside this checkout artifacts directory');return target;}
if(command==='prepare'){
 const dir=resolve(option('cells')),out=privateOutput(option('out'));
 const files=(await readdir(dir)).filter(f=>f.endsWith('.json')).sort();
 const snapshot=normalizeCapture(await Promise.all(files.map(f=>json(resolve(dir,f))))),report=preflight(snapshot),plan=masterPlan(snapshot,resolutions);
 await mkdir(out,{recursive:true});
 for(const [file,data] of Object.entries({'snapshot.json':snapshot,'preflight.json':report,'master-plan.json':plan}))await writeFile(resolve(out,file),JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({snapshotHash:snapshot.snapshotHash,tables:Object.keys(snapshot.tables).length,rows:Object.values(report.counts).reduce((a,b)=>a+b,0),sourceIssues:report.issues.length,masterIssues:plan.issues.length,planHash:plan.planHash,privateReports:out}));
}else if(['stage','apply-masters'].includes(command)){
 requireStaging(process.env.DATABASE_URL??'');
 const snapshot=verifySnapshot(await json(option('snapshot'))),expected=option('snapshot-hash');
 if(expected!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const {PrismaClient}=createRequire(new URL('../packages/db/package.json',import.meta.url))('@prisma/client'),prisma=new PrismaClient();
 try{
  const c=await prisma.company.findUnique({where:{companyCode:'DGC'}});if(!c)throw Error('Provision one DGC staging tenant first');
  const result=command==='stage'?await stageSnapshot(prisma,snapshot,c.id):await applyMasters(prisma,snapshot,c.id,option('scope'),option('plan-hash'),resolutions);
  console.log(JSON.stringify({command,...result}));
 }finally{await prisma.$disconnect();}
}else throw Error('Usage: dgc-migration.mjs prepare --cells <directory> --out artifacts/<private reports> | stage --snapshot <path> --snapshot-hash <digest> | apply-masters --snapshot <path> --snapshot-hash <digest> --scope services|partners|contracts|all --plan-hash <digest>');
