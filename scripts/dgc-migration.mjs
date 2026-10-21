import {readFile,readdir,mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {normalizeCapture,preflight,masterPlan,verifySnapshot} from './dgc-migration/core.mjs';
import {requireStaging,stageSnapshot,applyMasters} from './dgc-migration/staging.mjs';
import {referenceGraph} from './dgc-migration/graph.mjs';
import {financeReview} from './dgc-migration/finance-review.mjs';
import {invoiceHistoryPlan,verifyInvoiceHistoryPlan} from './dgc-migration/invoice-history.mjs';
import {verifyInvoiceFiles} from './dgc-migration/invoice-files.mjs';
import {createInvoiceArchive,verifyInvoiceArchive,listInvoiceArchive} from './dgc-migration/invoice-archive.mjs';
import {inputFinanceReview,verifyInputFinanceReview} from './dgc-migration/input-finance-review.mjs';
import {verifyInputFiles} from './dgc-migration/input-files.mjs';

const [command,...args]=process.argv.slice(2);
function option(name){const i=args.indexOf('--'+name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing --'+name);return args[i+1];}
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const resolutions=args.includes('--decisions')?await json(option('decisions')):undefined;
function privateOutput(path){const root=resolve('artifacts'),target=resolve(path),rel=relative(root,target);if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Private reports must be written inside this checkout artifacts directory');return target;}
async function privateArchivePath(path){
 const target=privateOutput(path),base=await realpath('artifacts');let existing=target;
 for(;;){try{const actual=await realpath(existing),rel=relative(base,actual);if(actual!==base&&(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel)))throw Error('Archive path escapes private artifacts directory');return target;}catch(e){if(e.code!=='ENOENT')throw e;existing=resolve(existing,'..');}}
}
if(command==='prepare'){
 const dir=resolve(option('cells')),out=privateOutput(option('out'));
 const files=(await readdir(dir)).filter(f=>f.endsWith('.json')).sort();
 const snapshot=normalizeCapture(await Promise.all(files.map(f=>json(resolve(dir,f))))),report=preflight(snapshot),plan=masterPlan(snapshot,resolutions);
 await mkdir(out,{recursive:true});
 for(const [file,data] of Object.entries({'snapshot.json':snapshot,'preflight.json':report,'master-plan.json':plan}))await writeFile(resolve(out,file),JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({snapshotHash:snapshot.snapshotHash,tables:Object.keys(snapshot.tables).length,rows:Object.values(report.counts).reduce((a,b)=>a+b,0),sourceIssues:report.issues.length,masterIssues:plan.issues.length,planHash:plan.planHash,privateReports:out}));
}else if(command==='list-invoice-archive'){
 const report=await listInvoiceArchive(await privateArchivePath(option('root')),option('archive-hash'),{invoiceNumber:args.includes('--invoice-number')?option('invoice-number'):'',page:args.includes('--page')?Number(option('page')):1});
 console.log(JSON.stringify({command,...report}));
}else if(['create-invoice-archive','verify-invoice-archive'].includes(command)){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const inputs={snapshot,plan:await json(option('plan')),decisions:resolutions,manifest:await json(await privateArchivePath(option('manifest'))),sourceRoot:await privateArchivePath(option('source-root')),root:await privateArchivePath(option('root'))};
 console.log(JSON.stringify({command,...await (command==='create-invoice-archive'?createInvoiceArchive(inputs):verifyInvoiceArchive(inputs))}));
}else if(command==='verify-invoice-files'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 console.log(JSON.stringify({command,...await verifyInvoiceFiles(snapshot,await json(privateOutput(option('manifest'))),privateOutput(option('root')))}));
}else if(command==='verify-input-files'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 console.log(JSON.stringify({command,...await verifyInputFiles(snapshot,await json(await privateArchivePath(option('manifest'))),await privateArchivePath(option('root')))}));
}else if(command==='verify-input-finance'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const report=verifyInputFinanceReview(await json(await privateArchivePath(option('plan'))),snapshot,resolutions);
 console.log(JSON.stringify({command,verified:true,snapshotHash:report.snapshotHash,planHash:report.planHash,inputRows:report.inputRows,apRows:report.apRows,postingAllowed:false}));
}else if(command==='verify-invoice-history'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const report=verifyInvoiceHistoryPlan(await json(option('plan')),snapshot,resolutions);
 console.log(JSON.stringify({command,verified:true,snapshotHash:report.snapshotHash,planHash:report.planHash,entries:report.entries.length,postingAllowed:false}));
}else if(['review-references','review-finance','review-input-finance','prepare-invoice-history'].includes(command)){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const out=command==='review-input-finance'?await privateArchivePath(option('out')):privateOutput(option('out')),report=command==='review-references'?referenceGraph(snapshot,resolutions):command==='review-finance'?financeReview(snapshot,resolutions):command==='review-input-finance'?inputFinanceReview(snapshot,resolutions):invoiceHistoryPlan(snapshot,resolutions);
 await mkdir(resolve(out,'..'),{recursive:true});
 await writeFile(out,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({command,snapshotHash:report.snapshotHash,planHash:report.planHash,physicalRows:report.nodes?.length,duplicateGroups:report.duplicatesRetained?.length,links:report.links?.length,inputRows:report.inputRows,apRows:report.apRows,counts:report.counts,unresolved:report.unresolved??report.unresolvedReferences,calendarIssues:report.calendarIssues?.length,issueCounts:report.issueCounts,postingAllowed:false,privateReport:out}));
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
}else throw Error('Usage: dgc-migration.mjs prepare | review-references | review-finance | review-input-finance | verify-input-finance | verify-input-files | prepare-invoice-history | verify-invoice-history | verify-invoice-files | create-invoice-archive | verify-invoice-archive | list-invoice-archive | stage | apply-masters. Input review/verification requires --snapshot --snapshot-hash [--decisions] and --out or --plan; input files require --snapshot --snapshot-hash --manifest --root. See docs/handover/DGC_INPUT_FINANCE_MIGRATION_20261021.md. Archive creation/verification requires --snapshot --snapshot-hash --plan --manifest --source-root --root [--decisions]; listing requires --root --archive-hash [--invoice-number] [--page]. See docs/handover/DGC_INVOICE_ARCHIVE_20261020.md.');
