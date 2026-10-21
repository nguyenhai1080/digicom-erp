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
import {revenueReview,verifyRevenueReview} from './dgc-migration/revenue-review.mjs';
import {revenueTargetPlan,verifyRevenueTargetPlan} from './dgc-migration/revenue-target.mjs';
import {rehearseRevenue} from './dgc-migration/revenue-rehearsal.mjs';
import {reconFilePlan,verifyReconFiles,reviewRevenueCustody} from './dgc-migration/recon-files.mjs';
import {reviewReconSemantics} from './dgc-migration/recon-semantics.mjs';

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
}else if(command==='review-recon-semantics'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const report=await reviewReconSemantics(snapshot,await json(await privateArchivePath(option('manifest'))),await privateArchivePath(option('root')),option('manifest-hash'),option('python'),await json(await privateArchivePath(option('plan'))),resolutions);
 const out=await privateArchivePath(option('out'));await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({command,reviewHash:report.reviewHash,fileStates:report.fileStates,revenueStates:report.revenueStates,detailStates:report.detailStates,groupStates:report.groupStates,postingAllowed:false,privateReport:out}));
}else if(['prepare-recon-files','verify-recon-files','review-revenue-custody'].includes(command)){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const out=await privateArchivePath(option('out'));
 let report;
 if(command==='prepare-recon-files')report=reconFilePlan(snapshot);
 else {const manifest=await json(await privateArchivePath(option('manifest'))),root=await privateArchivePath(option('root'));
  report=command==='verify-recon-files'?await verifyReconFiles(snapshot,manifest,root,option('manifest-hash')):await reviewRevenueCustody(snapshot,await json(await privateArchivePath(option('plan'))),manifest,root,option('manifest-hash'),resolutions);
 }
 await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({command,planHash:report.planHash,reviewHash:report.reviewHash,integrityVerified:report.integrityVerified??report.files?.integrityVerified,complete:report.complete??report.files?.complete,files:typeof report.files==='number'?report.files:Array.isArray(report.files)?report.files.length:report.files?.files,missingFiles:report.missingFiles?.length??report.files?.missingFiles?.length,sourceHeaders:report.sourceHeaders??report.files?.sourceHeaders,bytes:report.bytes??report.files?.bytes,counts:report.counts,nextReviewGroups:report.nextReviewGroups,nextReviewRevenueRows:report.nextReviewRevenueRows,postingAllowed:false,acceptance:false,privateReport:out}));
}else if(command==='rehearse-revenue'){
 requireStaging(process.env.DATABASE_URL??'');
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const plan=await json(await privateArchivePath(option('plan'))),out=await privateArchivePath(option('out'));
 const {PrismaClient}=createRequire(new URL('../packages/db/package.json',import.meta.url))('@prisma/client'),prisma=new PrismaClient();
 try{
  const c=await prisma.company.findUniqueOrThrow({where:{companyCode:'DGC'}}),report=await rehearseRevenue(prisma,snapshot,c.id,plan,option('group-keys').split(','),option('plan-hash'),resolutions);
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
  console.log(JSON.stringify({command,rolledBack:report.rolledBack,snapshotHash:report.snapshotHash,planHash:report.planHash,first:report.first,replay:report.replay,postingAllowed:false,filesVerified:false,privateReport:out}));
 }finally{await prisma.$disconnect();}
}else if(['verify-input-finance','verify-revenue','verify-revenue-target'].includes(command)){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const verify={'verify-revenue':verifyRevenueReview,'verify-input-finance':verifyInputFinanceReview,'verify-revenue-target':verifyRevenueTargetPlan};
 const report=verify[command](await json(await privateArchivePath(option('plan'))),snapshot,resolutions);
 console.log(JSON.stringify({command,verified:true,snapshotHash:report.snapshotHash,planHash:report.planHash,inputRows:report.inputRows,apRows:report.apRows,revenueRows:report.revenueRows,postingAllowed:false}));
}else if(command==='verify-invoice-history'){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const report=verifyInvoiceHistoryPlan(await json(option('plan')),snapshot,resolutions);
 console.log(JSON.stringify({command,verified:true,snapshotHash:report.snapshotHash,planHash:report.planHash,entries:report.entries.length,postingAllowed:false}));
}else if(['review-references','review-finance','review-input-finance','review-revenue','prepare-revenue-target','prepare-invoice-history'].includes(command)){
 const snapshot=verifySnapshot(await json(option('snapshot')));
 if(option('snapshot-hash')!==snapshot.snapshotHash)throw Error('Snapshot digest does not match');
 const out=['review-input-finance','review-revenue','prepare-revenue-target'].includes(command)?await privateArchivePath(option('out')):privateOutput(option('out'));
 const review={'review-references':referenceGraph,'review-finance':financeReview,'review-input-finance':inputFinanceReview,'review-revenue':revenueReview,'prepare-revenue-target':revenueTargetPlan,'prepare-invoice-history':invoiceHistoryPlan},report=review[command](snapshot,resolutions);
 await mkdir(resolve(out,'..'),{recursive:true});
 await writeFile(out,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({command,snapshotHash:report.snapshotHash,planHash:report.planHash,physicalRows:report.nodes?.length,duplicateGroups:report.duplicatesRetained?.length,links:report.links?.length,inputRows:report.inputRows,apRows:report.apRows,revenueRows:report.revenueRows,reviewStates:report.reviewStates,counts:report.counts,rowCounts:report.rowCounts,reasonCounts:report.reasonCounts,unresolved:report.unresolved??report.unresolvedReferences,calendarIssues:report.calendarIssues?.length,issueCounts:report.issueCounts,postingAllowed:false,privateReport:out}));
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
}else throw Error('Usage: dgc-migration.mjs prepare | review-references | review-finance | review-revenue | verify-revenue | prepare-revenue-target | verify-revenue-target | rehearse-revenue | prepare-recon-files | verify-recon-files | review-revenue-custody | review-recon-semantics | review-input-finance | verify-input-finance | verify-input-files | prepare-invoice-history | verify-invoice-history | verify-invoice-files | create-invoice-archive | verify-invoice-archive | list-invoice-archive | stage | apply-masters. Recon semantic review requires --snapshot --snapshot-hash --manifest --manifest-hash --root --plan --python --out [--decisions]. See docs/handover/DGC_RECON_SEMANTICS_20261021.md. Recon custody requires --snapshot --snapshot-hash --out; verification additionally --manifest --manifest-hash --root; revenue custody additionally --plan [--decisions]. See docs/handover/DGC_RECON_FILES_20261021.md. Revenue rehearsal requires --snapshot --snapshot-hash --plan --plan-hash --group-keys --out [--decisions] and a dedicated local staging DATABASE_URL; it always rolls back. See docs/handover/DGC_REVENUE_REHEARSAL_20261021.md. Revenue/Input review/verification requires --snapshot --snapshot-hash [--decisions] and --out or --plan; input files require --snapshot --snapshot-hash --manifest --root. See docs/handover/DGC_REVENUE_MIGRATION_20261021.md and docs/handover/DGC_INPUT_FINANCE_MIGRATION_20261021.md. Archive creation/verification requires --snapshot --snapshot-hash --plan --manifest --source-root --root [--decisions]; listing requires --root --archive-hash [--invoice-number] [--page]. See docs/handover/DGC_INVOICE_ARCHIVE_20261020.md.');
