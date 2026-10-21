import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {digest} from './core.mjs';
import {revenueSnapshot} from './revenue-fixtures.mjs';
import {reconFilePlan} from './recon-files.mjs';
import {reviewReconOcr,ocrUsdCandidates,compareObservedPayable} from './recon-ocr.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;},reject=async(p,re)=>{await assert.rejects(p,re);n++;};
eq(ocrUsdCandidates('1,234.56 USD. 1,234.56 USD'),['1234.56']);eq(ocrUsdCandidates('1.00 MZN 2.00 VND'),[]);eq(ocrUsdCandidates('1,23 USD -90.00 USD +90.00 USD'),[]);eq(ocrUsdCandidates('90.00 USD 91.00 USD'),['90','91']);eq(ocrUsdCandidates('0.00 USD'),['0']);
eq(compareObservedPayable(0,'0.00').state,'MATCH');eq(compareObservedPayable(null,'90.00').state,'UNAVAILABLE');eq(compareObservedPayable('','90.00').state,'UNAVAILABLE');eq(compareObservedPayable(90.01,'90.00').difference,'0.01');
const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'dgc-recon-ocr-')),A='AAAAAAAAAAAAAAAAAAAAAAAAA',pdf=Buffer.from('%PDF-1.4\nSynthetic custody evidence only\n%%EOF'),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const snapshot=revenueSnapshot(),plan=reconFilePlan(snapshot),sb={format:'dgc-source-recon-files-v1',snapshotHash:snapshot.snapshotHash,filePlanHash:plan.planHash,postingAllowed:false,acceptance:false,complete:true,files:[{fileId:A,relativePath:A+'.pdf',sourceHeaders:plan.files[0].sourceHeaders,mimeType:'application/pdf',size:pdf.length,sha256:hash(pdf)}]},sm={...sb,manifestHash:digest(sb)};
 await writeFile(join(root,A+'.pdf'),pdf);
 const artifact=async(name,value)=>{const b=Buffer.from(value);await writeFile(join(root,name),b);return {relativePath:name,size:b.length,sha256:hash(b)};};
 const render=await artifact('render.png','synthetic image bytes only'),txt=await artifact('pass.txt','90.00 USD'),tsv=await artifact('pass.tsv','synthetic confidence evidence');
 const body={format:'dgc-recon-ocr-evidence-v1',snapshotHash:snapshot.snapshotHash,sourceManifestHash:sm.manifestHash,acceptance:false,postingAllowed:false,engine:{name:'SYNTHETIC_ONLY'},files:[{fileId:A,pdfSha256:hash(pdf),sourceHeaders:plan.files[0].sourceHeaders,visualRender:render,ocrRender:render,passes:[{psm:3,text:txt,tsv},{psm:6,text:txt,tsv}],observed:{method:'CODEX_VISUAL_REVIEW',period:'2026-01',serviceText:'SYNTH_SERVICE',payableUsd:'90.00',identityCoverage:'HEADER_AND_FOOTER'}}]},m={...body,manifestHash:digest(body)},run=(x=m,pin=x.manifestHash)=>reviewReconOcr(snapshot,sm,root,sm.manifestHash,x,root,pin),rehash=x=>{const {manifestHash,...b}=x;return {...b,manifestHash:digest(b)};};
 const report=await run();eq(report.files.length,1);eq(report.files[0].passes.map(p=>p.state),['OCR_AGREES_WITH_VISUAL_OBSERVATION','OCR_AGREES_WITH_VISUAL_OBSERVATION']);eq(report.files[0].entries[0].payable.state,'MATCH');eq(report.files[0].entries[0].state,'OBSERVED_PAYABLE_MATCH_REMAINING_GATES_PENDING');eq(report.files[0].entries[1].state,'SOURCE_IDENTITY_REQUIRES_REVIEW');eq(report.files[0].entries[0].invoiceRevenueUsdVerified,false);eq(report.files[0].entries[0].invoiceWhtUsdVerified,false);eq(report.acceptance,false);eq(report.postingAllowed,false);eq(report.files[0].entries[0].readyToImport,false);
 await reject(run(m,'0'.repeat(64)),/pinned/);
 const bad=structuredClone(m);bad.files[0].observed.payableUsd='91.00';await reject(run(rehash(bad),m.manifestHash),/pinned/);eq((await run(rehash(bad))).files[0].entries[0].payable.state,'MISMATCH');
 for(const mutate of [x=>x.acceptance=true,x=>x.snapshotHash='bad',x=>x.sourceManifestHash='bad']){const b=structuredClone(m);mutate(b);await reject(run(rehash(b)),/pinned/);}
 for(const mutate of [x=>x.files[0].pdfSha256='0'.repeat(64),x=>x.files[0].sourceHeaders=[],x=>x.files.push(x.files[0])]){const b=structuredClone(m);mutate(b);await reject(run(rehash(b)),/provenance/);}
 for(const mutate of [x=>x.files[0].passes.pop(),x=>x.files[0].passes[1].psm=3]){const b=structuredClone(m);mutate(b);await reject(run(rehash(b)),/both recorded/);}
 const traversal=structuredClone(m);traversal.files[0].visualRender.relativePath='../outside.png';await reject(run(rehash(traversal)),/metadata/);
 const partial=structuredClone(m);partial.files[0].observed.identityCoverage='FOOTER_ONLY';eq((await run(rehash(partial))).files[0].entries[0].state,'OBSERVED_PAYABLE_MATCH_IDENTITY_REVIEW_PENDING');
 const alias=structuredClone(m);alias.files[0].observed.serviceText='UNCONFIRMED_ALIAS';eq((await run(rehash(alias))).files[0].entries[0].state,'OBSERVED_PAYABLE_MATCH_IDENTITY_REVIEW_PENDING');
 await writeFile(join(root,'pass.txt'),'91.00 USD');await reject(run(),/checksum/);await writeFile(join(root,'pass.txt'),'90.00 USD');
 await writeFile(join(root,A+'.pdf'),'%PDF-tampered');await reject(run(),/checksum/);
 console.log(`OCR visual evidence custody: ${n} assertions passed`);
}finally{const rel=relative(base,await realpath(root));if(!rel.startsWith('dgc-recon-ocr-')||rel.includes('..'))throw Error('Temporary cleanup escaped fixture root');await rm(root,{recursive:true,force:true});}
