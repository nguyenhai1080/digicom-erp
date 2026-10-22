import {canonical,digest,SOURCE_ID} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
const scope=g=>canonical([g.partnerSource,g.contractSource,g.period,g.currency]);
const rowScope=e=>canonical([e.bindings.Service_ID,e.aggregationMapping.rowType]);
const sourceKey=s=>canonical(s);

// Proposal only: preserve external approval evidence without impersonating a
// local user, applying a timezone, or putting historical revenue in Invoice Ready.
export function revenueLifecyclePlan(snapshot,targetPlan,combined,pin,decisions){
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);const {reviewHash,...body}=combined??{};
 if(!/^[a-f0-9]{64}$/.test(pin??'')||reviewHash!==pin||digest(body)!==pin||combined.format!=='dgc-recon-combined-evidence-review-v1'||combined.snapshotHash!==snapshot.snapshotHash||combined.targetPlanHash!==targetPlan.planHash||combined.postingAllowed!==false||combined.readyToImport!==false||combined.acceptance!==false)throw Error('Pinned combined evidence review differs');
 const expected=new Map(targetPlan.groups.map(g=>[g.groupKey,g])),seen=new Set();
 for(const g of combined.groups){const t=expected.get(g.groupKey);if(seen.has(g.groupKey)||!t||g.businessState!==t.state||canonical(g.documentSource)!==canonical(t.documentSource)||canonical(g.rows.map(r=>r.source))!==canonical(t.entries.map(e=>e.source))||g.readyToImport!==false)throw Error('Lifecycle group source coverage differs');seen.add(g.groupKey);}
 if(seen.size!==expected.size)throw Error('Lifecycle review is missing groups');
 const mappings=[];
 for(const event of combined.replacementAudit?.events??[]){
  const old=targetPlan.groups.filter(g=>g.documentSource&&canonical(g.documentSource)===canonical(event.oldDocumentSource)),next=targetPlan.groups.filter(g=>g.documentSource&&canonical(g.documentSource)===canonical(event.replacementDocumentSource)),issues=[],pairs=[];
  if(event.state!=='SOURCE_REPLACEMENT_EVENT_BOUND'||event.explicitSourceReplacementObserved!==true)issues.push('SOURCE_AUDIT_EVENT_NOT_BOUND');
  if(!old.length||!next.length)issues.push('SOURCE_REVISION_GROUP_MISSING');
  for(const a of old){const bs=next.filter(b=>scope(a)===scope(b));if(bs.length!==1||old.filter(b=>scope(b)===scope(a)).length!==1){issues.push('REVISION_GROUP_SCOPE_NOT_ONE_TO_ONE');continue;}
   const b=bs[0],rows=[];
   if(!a.partnerSource||!a.contractSource||!b.partnerSource||!b.contractSource||[...a.entries,...b.entries].some(e=>!e.bindings.Service_ID))issues.push('REVISION_MASTER_SCOPE_UNRESOLVED');
   for(const x of a.entries){const ys=b.entries.filter(y=>rowScope(x)===rowScope(y));if(ys.length!==1||a.entries.filter(y=>rowScope(y)===rowScope(x)).length!==1){issues.push('REVISION_ROW_SCOPE_NOT_ONE_TO_ONE');continue;}rows.push({oldSource:x.source,replacementSource:ys[0].source});}
   if(rows.length!==b.entries.length)issues.push('REVISION_ROW_SET_CHANGED');pairs.push({oldGroupKey:a.groupKey,replacementGroupKey:b.groupKey,rows});
  }
  if(pairs.length!==next.length)issues.push('REVISION_GROUP_SET_CHANGED');
  mappings.push({auditSource:event.source,state:issues.length?'SOURCE_REVISION_MAPPING_REQUIRES_REVIEW':'SOURCE_REVISION_MAPPING_BOUND',issues:[...new Set(issues)],pairs,targetRevisionMappingAccepted:false});
 }
 const proposed=mappings.filter(m=>m.state==='SOURCE_REVISION_MAPPING_BOUND').flatMap(m=>m.pairs),graphIssues=[];
 for(const p of proposed){if(proposed.filter(x=>x.oldGroupKey===p.oldGroupKey).length!==1)graphIssues.push('MULTIPLE_SUCCESSORS_OR_DUPLICATE_EDGE');if(proposed.filter(x=>x.replacementGroupKey===p.replacementGroupKey).length!==1)graphIssues.push('TARGET_SINGLE_PREDECESSOR_LIMIT');
  let k=p.replacementGroupKey;const visited=new Set([p.oldGroupKey]);while(k){if(visited.has(k)){graphIssues.push('SOURCE_REVISION_CYCLE');break;}visited.add(k);k=proposed.find(x=>x.oldGroupKey===k)?.replacementGroupKey;}
 }
 if(graphIssues.length)for(const mapping of mappings)if(mapping.state==='SOURCE_REVISION_MAPPING_BOUND'){mapping.state='SOURCE_REVISION_MAPPING_REQUIRES_REVIEW';mapping.issues.push(...new Set(graphIssues));}
 const edges=graphIssues.length?[]:proposed,parent=new Map(edges.map(p=>[p.replacementGroupKey,p.oldGroupKey])),successor=new Map(edges.map(p=>[p.oldGroupKey,p.replacementGroupKey])),rowParent=new Map(edges.flatMap(p=>p.rows.map(r=>[sourceKey(r.replacementSource),r.oldSource]))),combinedGroups=new Map(combined.groups.map(g=>[g.groupKey,g]));
 const groups=targetPlan.groups.map(g=>{
  let root=g.groupKey,ordinal=1;while(parent.has(root)){root=parent.get(root);ordinal++;}
  const replaced=successor.has(g.groupKey),chain=combined.lifecycle.chains.find(c=>g.documentSource&&canonical(c.source)===canonical(g.documentSource)),statuses=[...new Set(g.entries.map(e=>e.sourceStatus))];
  const proposedRecon=replaced?'SUPERSEDED':chain?.donorActivity!=='ACTIVE'?null:statuses.length===1?({Approved:'APPROVED',Draft:'DRAFT',Submitted:'PENDING_APPROVAL'}[statuses[0]]??null):null;
  const rows=g.entries.map(e=>{
   let rootSource=e.source;while(rowParent.has(sourceKey(rootSource)))rootSource=rowParent.get(sourceKey(rootSource));
   const previous=rowParent.get(sourceKey(e.source))??null;
   return {source:e.source,sourceStatus:e.sourceStatus,sourceRowType:e.aggregationMapping.rowType,sourceIncludeInMonthlyTotal:e.aggregationMapping.includeInMonthlyTotal,logicalSourceFamilyKey:digest(['DGC_HISTORY_REVENUE_FAMILY',SOURCE_ID,rootSource]),capturedChainOrdinal:ordinal,supersedesSource:previous,
    proposedRevenueStatus:replaced?'SUPERSEDED':null,proposedStateReason:replaced?'AUDIT_BOUND_SOURCE_REPLACEMENT':e.sourceStatus==='Approved'?'INVOICE_PAYMENT_AR_MAPPING_REQUIRED':'PREAPPROVAL_SOURCE_REVENUE_EVIDENCE_ONLY',
    capturedRevenueJson:canonical(e.capturedRevenue),legacyReconciliationsJson:canonical(e.legacyReconciliations),invoiceBasis:e.capturedInvoiceUsd,managementBasis:e.capturedManagement,
    safeRehearsalStatus:'BLOCKED',safeRehearsalIsCurrent:false,localApprovalCreated:false,readyToImport:false};
  });
  return {groupKey:g.groupKey,sourceDocument:g.documentSource,evidenceState:combinedGroups.get(g.groupKey).state,businessState:g.state,businessReasons:g.reasons,logicalSourceFamilyKey:digest(['DGC_HISTORY_RECON_FAMILY',SOURCE_ID,root]),capturedChainOrdinal:ordinal,ordinalScope:'CAPTURED_CHAIN_ORDER_NOT_ORIGINAL_DONOR_REVISION_NUMBER',supersedesGroupKey:parent.get(g.groupKey)??null,supersededByGroupKey:successor.get(g.groupKey)??null,proposedReconciliationStatus:proposedRecon,proposedIsCurrent:replaced?false:chain?.donorActivity==='ACTIVE'?true:null,
   sourceDocumentJson:canonical(g.documentEvidence),rows,localCreatedById:null,localApprovedById:null,localApprovedAt:null,historicalTimestampTimezoneAssumed:false,safeRehearsalStatus:'BLOCKED',safeRehearsalIsCurrent:false,targetRevisionMappingAccepted:false,readyToImport:false};
 });
 const report={format:'dgc-revenue-lifecycle-proposal-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,combinedReviewHash:pin,mode:'PROPOSAL_ONLY_NO_DATABASE_WRITER',revisionMappings:mappings,revisionGraphIssues:[...new Set(graphIssues)],proposedRevisionEdges:edges.length,proposedRevenueRevisionEdges:edges.reduce((n,e)=>n+e.rows.length,0),groups,counts:groups.reduce((a,g)=>(a[g.proposedReconciliationStatus??'REQUIRES_REVIEW']=(a[g.proposedReconciliationStatus??'REQUIRES_REVIEW']??0)+1,a),{}),postingAllowed:false,acceptance:false,readyToImport:false,historicalCashPosting:false,recomputeAmounts:false};
 return {...report,planHash:digest(report)};
}
