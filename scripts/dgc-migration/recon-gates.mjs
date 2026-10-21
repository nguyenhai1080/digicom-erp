import {canonical,digest} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {verifyReconFiles,reconHeaderFileIds} from './recon-files.mjs';
import {matchChildSources} from './recon-lines.mjs';
import {reviewReconOcr} from './recon-ocr.mjs';
import {reconLifecycleReview} from './recon-lifecycle.mjs';
import {reviewReconReplacementAudit} from './recon-audit.mjs';
const key=a=>a.sheet+'|'+a.sourceRow;
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});

export function verifyPinnedEvidence(report,pin,format,snapshot,targetPlan,manifest){
 const {reviewHash,...body}=report??{};
 if(!/^[a-f0-9]{64}$/.test(pin??'')||reviewHash!==pin||digest(body)!==pin||report.format!==format||report.snapshotHash!==snapshot.snapshotHash||report.postingAllowed!==false||report.acceptance!==false||report.pdfSemanticsVerified!==false)throw Error('Pinned evidence review differs');
 if(format!=='dgc-recon-ocr-review-v1'&&(report.targetPlanHash!==targetPlan.planHash||report.manifestHash!==manifest.manifestHash))throw Error('Evidence target plan or manifest differs');
 if(format==='dgc-recon-ocr-review-v1'&&report.sourceManifestHash!==manifest.manifestHash)throw Error('OCR source manifest differs');
 return report;
}
function verifyCoverage(snapshot,entries,sheets,filter=()=>true){
 const expected=new Map(sheets.flatMap(sheet=>snapshot.tables[sheet].rows.filter(filter).map(r=>{const a=addr(sheet,snapshot.tables[sheet],r);return [key(a),a];}))),seen=new Set();
 for(const e of entries){const k=key(e.source??{});if(seen.has(k)||!expected.has(k)||canonical(e.source)!==canonical(expected.get(k))||e.readyToImport!==false)throw Error('Evidence physical row coverage differs');seen.add(k);}
 if(seen.size!==expected.size)throw Error('Evidence is missing physical rows');
}
function verifyFileCoverage(report,manifest,shaField){
 const expected=new Map(manifest.files.map(f=>[f.fileId,f.sha256])),seen=new Set();
 for(const f of report.files){if(seen.has(f.fileId)||!expected.has(f.fileId)||f[shaField]!==expected.get(f.fileId))throw Error('Evidence PDF binding differs');seen.add(f.fileId);}
 if(seen.size!==expected.size)throw Error('Evidence PDF coverage differs');
}

// This is the combined evidence gate for the next review, never an import gate.
// A clean PDF comparison cannot promote an existing business HELD group.
export function combineReconGates(targetPlan,summary,child,ocr,lifecycle,custody,replacementAudit=null){
 const s=new Map(summary.entries.filter(e=>e.source.sheet==='40_MONTHLY_REVENUE').map(e=>[key(e.source),e])),c=new Map(child.entries.map(e=>[key(e.source),e])),o=new Map(ocr.files.flatMap(f=>f.entries.map(e=>[key(e.source),e]))),lc=new Map(lifecycle.chains.map(x=>[key(x.source),x]));
 const groups=targetPlan.groups.map(g=>{
  const reasons=[],chain=g.documentSource?lc.get(key(g.documentSource)):null;
  if(g.state!=='REHEARSABLE')reasons.push('BUSINESS_HELD');
  const ids=g.documentEvidence?reconHeaderFileIds(g.documentEvidence):[],fileId=ids.length===1?ids[0]:null;
  if(!g.documentSource||!fileId||fileId!==g.sourceFileId)reasons.push('DOCUMENT_SOURCE_OR_FILE_UNRESOLVED');
  else if(custody.missingFiles.includes(fileId))reasons.push('PDF_BYTES_MISSING');
  const rows=g.entries.map(e=>{
   const summaryEntry=s.get(key(e.source)),childEntry=c.get(key(e.source)),observation=o.get(key(e.source));
   if(!summaryEntry||canonical(summaryEntry.source)!==canonical(e.source)||canonical(summaryEntry.sourceDocument)!==canonical(g.documentSource)||summaryEntry.fileId!==fileId)reasons.push('SUMMARY_SOURCE_BINDING_UNVERIFIED');
   if(e.aggregationMapping.rowType==='TOTAL'){
    if(summaryEntry?.state==='CAPTURED_USD_DIFFERS')reasons.push('PRINTED_USD_TOTAL_DIFFERS');
    else if(summaryEntry?.state!=='EXACT_USD_SUMMARY_MATCH')reasons.push('PRINTED_USD_TOTAL_UNVERIFIED');
   }else if(e.aggregationMapping.rowType==='CHILD'){
    if(!childEntry||canonical(childEntry.source)!==canonical(e.source)||childEntry.fileId!==fileId)reasons.push('CHILD_SOURCE_BINDING_UNVERIFIED');
    else if(childEntry.state!=='PRINTED_CHILD_AND_CAPTURED_USD_LINK_MATCH')reasons.push('PRINTED_CHILD_OR_CAPTURED_USD_LINK_UNVERIFIED');
   }else reasons.push('UNSUPPORTED_REVENUE_ROW_TYPE');
   // OCR Payable evidence is retained but cannot replace full USD/identity gates.
   if(observation&&summaryEntry?.state!=='EXACT_USD_SUMMARY_MATCH'&&e.aggregationMapping.rowType==='TOTAL')reasons.push('OCR_PAYABLE_ONLY_FULL_USD_REVIEW_PENDING');
   return {source:e.source,summaryState:summaryEntry?.state??null,childState:childEntry?.state??null,ocrPayableState:observation?.payable?.state??null,readyToImport:false};
  });
  if(!g.entries.some(e=>e.aggregationMapping.rowType==='TOTAL'))reasons.push('NO_TOTAL_SUMMARY_TO_REVIEW');
  if(!chain||canonical(chain.source)!==canonical(g.documentSource))reasons.push('SOURCE_LIFECYCLE_UNRESOLVED');
  else {if(chain.donorActivity==='INACTIVE')reasons.push('SOURCE_DOCUMENT_INACTIVE');if(chain.issues.length)reasons.push('SOURCE_CHAIN_REQUIRES_REVIEW');}
  const sourceReplacementEvents=(replacementAudit?.events??[]).filter(e=>g.documentSource&&[e.oldDocumentSource,e.replacementDocumentSource].some(s=>s&&canonical(s)===canonical(g.documentSource))).map(e=>({source:e.source,role:canonical(e.oldDocumentSource)===canonical(g.documentSource)?'REPLACED_DOCUMENT':'REPLACEMENT_DOCUMENT',state:e.state,explicitSourceReplacementObserved:e.explicitSourceReplacementObserved,targetRevisionMappingAccepted:false}));
  if(sourceReplacementEvents.some(e=>e.state!=='SOURCE_REPLACEMENT_EVENT_BOUND'))reasons.push('REPLACEMENT_AUDIT_REQUIRES_REVIEW');
  const unique=[...new Set(reasons)],state=unique.length?'EVIDENCE_REVIEW_HELD':'EVIDENCE_CLEAR_FOR_NEXT_REVIEW';
  return {groupKey:g.groupKey,businessState:g.state,businessReasons:g.reasons,documentSource:g.documentSource,sourceFileId:fileId,state,reasons:unique,rows,sourcePattern:chain?.sourcePattern??null,replacementBlockedByCapturedPayments:chain?.replacementBlockedByCapturedPayments??null,sourceReplacementEvents,
   remainingGates:['TARGET_LIFECYCLE_AND_REVISION_MAPPING','HISTORICAL_ACTOR_AND_DATE_MAPPING','INVOICE_PAYMENT_AR_CHAIN_ACCEPTANCE','FINAL_FINANCIAL_ACCEPTANCE'],readyToImport:false,postingAllowed:false};
 });
 return groups;
}

export async function reviewReconGates({snapshot,targetPlan,decisions,manifest,root,manifestPin,summary,summaryPin,child,childPin,ocr,ocrPin,ocrManifest,ocrManifestPin,ocrRoot,auditCapture,auditPin}){
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 verifyPinnedEvidence(summary,summaryPin,'dgc-recon-usd-summary-review-v1',snapshot,targetPlan,manifest);
 verifyPinnedEvidence(child,childPin,'dgc-recon-printed-child-review-v1',snapshot,targetPlan,manifest);
 verifyPinnedEvidence(ocr,ocrPin,'dgc-recon-ocr-review-v1',snapshot,targetPlan,manifest);
 const custody=await verifyReconFiles(snapshot,manifest,root,manifestPin);
 verifyCoverage(snapshot,summary.entries,['40_MONTHLY_REVENUE','44_RECON_PDF_DETAIL']);
 verifyCoverage(snapshot,child.entries,['40_MONTHLY_REVENUE'],r=>String(r.values.Revenue_Row_Type).toUpperCase()==='CHILD');
 verifyFileCoverage(summary,manifest,'sha256');verifyFileCoverage(child,manifest,'pdfSha256');
 if(canonical(matchChildSources(snapshot,child.files))!==canonical(child.entries))throw Error('Child review differs from pinned sources');
 const actualOcr=await reviewReconOcr(snapshot,manifest,root,manifestPin,ocrManifest,ocrRoot,ocrManifestPin);
 if(canonical(actualOcr)!==canonical(ocr))throw Error('OCR review differs from current pinned artifacts');
 const lifecycle=reconLifecycleReview(snapshot,decisions),replacementAudit=auditCapture?reviewReconReplacementAudit(snapshot,lifecycle,auditCapture,auditPin):null;
 if(!auditCapture&&auditPin)throw Error('Audit pin requires supplemental capture');
 const groups=combineReconGates(targetPlan,summary,child,ocr,lifecycle,custody,replacementAudit);
 const body={format:'dgc-recon-combined-evidence-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,manifestHash:manifestPin,inputPins:{summary:summaryPin,child:childPin,ocr:ocrPin,ocrManifest:ocrManifestPin,auditCapture:auditPin??null},custody,lifecycle,replacementAudit,groups,counts:groups.reduce((a,g)=>(a[g.state]=(a[g.state]??0)+1,a),{}),reasonCounts:groups.flatMap(g=>g.reasons).reduce((a,r)=>(a[r]=(a[r]??0)+1,a),{}),postingAllowed:false,acceptance:false,readyToImport:false,pdfSemanticsVerified:false,historicalCashPosting:false,scope:'COMBINED_EVIDENCE_ONLY_NEXT_REVIEW_NOT_FINANCIAL_IMPORT_OR_LIFECYCLE_ACCEPTANCE'};
 return {...body,reviewHash:digest(body)};
}
