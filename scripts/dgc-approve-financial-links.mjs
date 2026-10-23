import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {approveFinancialLinkProposal,financialLinkOverrides} from './dgc-migration/financial-link-decisions.mjs';
import {masterPlan} from './dgc-migration/core.mjs';
const args=process.argv.slice(2),option=n=>{const i=args.indexOf('--'+n);if(i<0||!args[i+1])throw Error('Missing --'+n);return args[i+1];};
if(!args.includes('--owner-approved-all'))throw Error('Requires an explicit owner reply approving all proposed mappings');
const read=async p=>JSON.parse(await readFile(p,'utf8')),snapshot=await read(option('snapshot')),proposal=await read(option('proposal')),decisions=await read(option('decisions'));
masterPlan(snapshot,decisions);
const approved=approveFinancialLinkProposal(snapshot,proposal,{expectedProposalHash:option('proposal-hash'),approvedBy:'OWNER',approvedAt:option('approved-at'),decision:'APPROVE_ALL'});
const artifacts=await realpath('artifacts'),pdfRoot=await realpath(option('pdf-root')),out=resolve(option('out'));
for(const path of [pdfRoot,out]){const r=relative(artifacts,path);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Private evidence must stay inside artifacts');}
for(const p of proposal.proposals){
 const file=await realpath(resolve(pdfRoot,p.evidence.relativePdfPath)),r=relative(pdfRoot,file);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('PDF path escapes evidence root');
 const bytes=await readFile(file);if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==p.evidence.sha256)throw Error('Original PDF differs from approved evidence');
}
let ancestor=resolve(out,'..');for(;;){try{const actual=await realpath(ancestor),r=relative(artifacts,actual);if(r.startsWith('..')||isAbsolute(r))throw Error('Private output escapes artifacts');break;}catch(e){if(e.code!=='ENOENT')throw e;ancestor=resolve(ancestor,'..');}}
await mkdir(out,{recursive:true});const actualOut=await realpath(out),r=relative(artifacts,actualOut);if(r.startsWith('..')||isAbsolute(r))throw Error('Private output escapes artifacts');
const combined={...decisions,financialLinkDecisions:approved};
for(const [name,data] of [['approved-financial-links.json',approved],['owner-decisions.json',combined]])await writeFile(resolve(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({snapshotHash:snapshot.snapshotHash,proposalHash:proposal.proposalHash,approvalHash:approved.approvalHash,approvedLinks:financialLinkOverrides(snapshot,approved).size,sourceChanged:false,moneyChanged:false,pdfsVerified:true,financialPosting:false}));
