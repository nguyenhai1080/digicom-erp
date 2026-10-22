import {digest,canonical} from './core.mjs';
import {referenceGraph} from './graph.mjs';
import {financeReview} from './finance-review.mjs';
import {memoSourcePlan} from './planning-context.mjs';
const text=v=>v==null?'':String(v).trim();
const key=a=>`${a.sheet}|${a.sourceRow}`;
const current=v=>v===true||text(v).toUpperCase()==='TRUE';
const archiveStatuses=new Set(['CANCELLED','CANCELED','SUPERSEDED']);
const openStatuses=new Set(['DRAFT','ISSUED','OVERDUE','PARTIALLY PAID','PAID']);

// An executable preparation step for a future importer, not a financial write.
// Historical revisions retain their captured header/detail payloads. They must
// never be passed to the new-invoice generator, which would recompute history.
export function invoiceHistoryPlan(snapshot,decisions){
 return memoSourcePlan(snapshot,'invoice-history',[snapshot,decisions],()=>buildInvoiceHistoryPlan(snapshot,decisions));
}
function buildInvoiceHistoryPlan(snapshot,decisions){
 const graph=referenceGraph(snapshot,decisions),finance=financeReview(snapshot,decisions),nodes=new Map();
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const row of t.rows)nodes.set(key({sheet,...row}),{sheet,sheetId:t.sheetId,...row});
 const addr=r=>({sheet:r.sheet,sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
 const headers=[...nodes.values()].filter(r=>r.sheet==='48_INVOICE_HEADER'),byId=new Map(),byBusiness=new Map(),outgoing=new Map(),children=new Map();
 for(const h of headers){const ids=byId.get(h.legacyId)??[];ids.push(h);byId.set(h.legacyId,ids);const b=text(h.values.Business_Key),all=byBusiness.get(b)??[];all.push(h);byBusiness.set(b,all);}
 for(const l of graph.links){const k=key(l.source),all=outgoing.get(k)??[];all.push(l);outgoing.set(k,all);if(l.targetSheet==='48_INVOICE_HEADER'&&l.field==='Invoice_ID'&&['49_INVOICE_DETAIL','50_AR_AP','52_INVOICE_PAYMENT'].includes(l.source.sheet)){
  // Ambiguous invoice parents affect every candidate, not a guessed first row.
  for(const target of l.target?[l.target]:l.evidence.map(e=>e.target)){const k=key(target),all=children.get(k)??[];all.push(nodes.get(key(l.source)));children.set(k,all);}
 }}
 const groups=[],groupIssues=new Map();
 const add=(map,k,issue)=>{const all=map.get(k)??[];all.push(issue);map.set(k,all);};
 for(const [businessKey,all] of byBusiness){
  const issues=[],revisions=new Set(),active=all.filter(h=>current(h.values.Is_Current)&&!archiveStatuses.has(text(h.values.Status).toUpperCase()));
  if(!businessKey)issues.push({code:'MISSING_BUSINESS_KEY'});
  if(active.length>1)issues.push({code:'MULTIPLE_CURRENT_REVISIONS',rows:active.map(addr)});
  for(const h of all){const rev=h.values.Revision_No;if(!Number.isSafeInteger(rev)||rev<1)issues.push({code:'INVALID_REVISION_NUMBER',source:addr(h)});else if(revisions.has(rev))issues.push({code:'DUPLICATE_REVISION_NUMBER',revisionNo:rev});revisions.add(rev);}
  for(const h of all)for(const issue of issues)add(groupIssues,key(h),issue);
  groups.push({sourceBusinessKey:businessKey,rows:all.map(addr),currentRows:active.map(addr),issues});
 }
 const entries=[];
 for(const h of headers){
  const status=text(h.values.Status).toUpperCase(),archive=archiveStatuses.has(status),related=children.get(key(h))??[],issues=[...(groupIssues.get(key(h))??[])];
  if(!h.legacyId||byId.get(h.legacyId)?.length!==1)issues.push({code:'MISSING_OR_DUPLICATE_INVOICE_ID'});
  if(!openStatuses.has(status)&&!archive)issues.push({code:'UNSUPPORTED_STATUS',status});
  if(archive&&current(h.values.Is_Current)||!archive&&!current(h.values.Is_Current))issues.push({code:'STATUS_CURRENT_FLAG_CONFLICT'});
  const duplicateNumbers=headers.filter(r=>text(r.values.Invoice_Number)===text(h.values.Invoice_Number));
  if(!text(h.values.Invoice_Number)||duplicateNumbers.length!==1)issues.push({code:'MISSING_OR_DUPLICATE_INVOICE_NUMBER',rows:duplicateNumbers.map(addr)});
  // Traverse actual source dependencies, not every row with the same legacy ID.
  // Invoice-to-detail containment is required as well as forward references.
  const queue=[h,...related],visited=new Set(),unresolved=[],dependencies=[];
  while(queue.length){const r=queue.pop(),k=key(r);if(visited.has(k))continue;visited.add(k);dependencies.push(addr(r));
   for(const l of outgoing.get(k)??[]){
    // Revision links are reviewed separately. Following them here would make
    // one historical revision's obsolete data block every current revision.
    if(l.source.sheet==='48_INVOICE_HEADER'&&['Supersedes_Invoice_ID','Superseded_By_Invoice_ID'].includes(l.field))continue;
    if(!l.target)unresolved.push(l);else queue.push(nodes.get(key(l.target)));
   }
  }
  if(unresolved.length)issues.push({code:'UNRESOLVED_SOURCE_DEPENDENCIES',count:unresolved.length});
  const ownDetails=related.filter(r=>r.sheet==='49_INVOICE_DETAIL');
  if(!ownDetails.length)issues.push({code:'MISSING_INVOICE_DETAILS'});
  const revisionLinks=[];
  for(const [field,reverse] of [['Supersedes_Invoice_ID','Superseded_By_Invoice_ID'],['Superseded_By_Invoice_ID','Supersedes_Invoice_ID']]){
   const id=text(h.values[field]);if(!id)continue;const matches=byId.get(id)??[],target=matches.length===1?matches[0]:null;
   revisionLinks.push({field,legacyId:id,target:target?addr(target):null});
   if(!target){issues.push({code:'UNRESOLVED_REVISION_LINK',field,legacyId:id});continue;}
   if(target===h)issues.push({code:'SELF_REVISION_LINK',field});
   if(text(target.values.Business_Key)!==text(h.values.Business_Key))issues.push({code:'CROSS_BUSINESS_REVISION_LINK',field,target:addr(target)});
   if(text(target.values[reverse])!==h.legacyId)issues.push({code:'NONRECIPROCAL_REVISION_LINK',field,target:addr(target)});
   const rev=h.values.Revision_No,next=target.values.Revision_No;
   if(Number.isSafeInteger(rev)&&Number.isSafeInteger(next)&&(field==='Supersedes_Invoice_ID'?next>=rev:next<=rev))issues.push({code:'REVISION_ORDER_CONFLICT',field,target:addr(target)});
  }
  if(!archive&&text(h.values.Superseded_By_Invoice_ID))issues.push({code:'CURRENT_HAS_SUCCESSOR'});
  const seen=new Set([h.legacyId]);let cursor=h;
  while(text(cursor.values.Superseded_By_Invoice_ID)){
   const nextId=text(cursor.values.Superseded_By_Invoice_ID);if(seen.has(nextId)){issues.push({code:'REVISION_CYCLE'});break;}seen.add(nextId);const matches=byId.get(nextId)??[];if(matches.length!==1)break;cursor=matches[0];
  }
  const relevant=new Set([key(h),...related.map(key)]),differences=finance.checks.filter(c=>relevant.has(key(c.source))&&c.state!=='MATCH'),amountIssues=finance.issues.filter(i=>relevant.has(key(i.source)));
  entries.push({source:addr(h),sourceStatus:h.values.Status,sourceIsCurrent:h.values.Is_Current,sourceBusinessKey:h.values.Business_Key,sourceRevisionNo:h.values.Revision_No,
   disposition:archive?'PRESERVE_HISTORY_ONLY':status==='DRAFT'?'PREPARE_UNISSUED_DRAFT':'PREPARE_CURRENT_LEDGER',
   integrity:issues.length?'REVIEW_REQUIRED':'STRUCTURAL_CHECKS_PASSED',postingAllowed:false,
   restoreRoute:archive?'IMMUTABLE_SOURCE_HISTORY':status==='DRAFT'?'DRAFT_RESTORE':'CURRENT_INVOICE_RESTORE',
   // Exact source rows retain cells/formulas/display text, including negatives.
   capturedHeader:h,capturedDetails:ownDetails,capturedReceivables:related.filter(r=>r.sheet==='50_AR_AP'),capturedPayments:related.filter(r=>r.sheet==='52_INVOICE_PAYMENT'),
   dependencies,unresolvedDependencies:unresolved,revisionLinks,issues,amountDifferences:differences,amountIssues,
   importerRequirements:['VERIFIED_ORIGINAL_PDF_BYTES','REVIEWED_MASTER_TARGET_LINKS','EXPLICIT_MIGRATION_ACTOR_PROVENANCE','PRESERVE_CAPTURED_AMOUNTS_AND_DATES',...(archive?['HISTORY_MUST_NOT_CREATE_CURRENT_AR_OR_REBILL_SOURCE']:['VALIDATED_FINANCIAL_SNAPSHOT','REPLAY_AND_ROLLBACK_REHEARSAL'])],
   recomputeAmounts:false,postHistoricalCash:false});
 }
 const counts=entries.reduce((a,e)=>{a[e.disposition]=(a[e.disposition]??0)+1;a[e.integrity]=(a[e.integrity]??0)+1;return a;},{});
 const issueCounts=entries.flatMap(e=>e.issues).reduce((a,i)=>(a[i.code]=(a[i.code]??0)+1,a),{});
 const report={format:'dgc-invoice-history-plan-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,financePlanHash:finance.planHash,postingAllowed:false,acceptance:false,groups,entries,counts,issueCounts};
 return {...report,planHash:digest(report)};
}

export function verifyInvoiceHistoryPlan(plan,snapshot,decisions){
 if(!plan||plan.format!=='dgc-invoice-history-plan-v1')throw Error('Invalid invoice history plan format');
 const {planHash,...body}=plan;
 if(planHash!==digest(body))throw Error('Invoice history plan checksum mismatch');
 const expected=invoiceHistoryPlan(snapshot,decisions);
 // Recomputing prevents a rehashed package from silently changing money,
 // dependency selection, archive/current disposition or posting flags.
 if(canonical(plan)!==canonical(expected))throw Error('Invoice history plan differs from its verified snapshot and decisions');
 return plan;
}
