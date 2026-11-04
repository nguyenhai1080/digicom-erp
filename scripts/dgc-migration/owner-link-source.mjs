import {canonical,digest,verifySnapshot} from './core.mjs';
import {financialLinkOverrides} from './financial-link-decisions.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
const approvalPin='a75b0238c43d73b8192fa1d26fdbb5bc99415266d75f4a3beb8c16833833d369',same=(a,b)=>canonical(a)===canonical(b);
export function ownerLinkedSourceReview(i){
 const {snapshot,targetPlan,combined,decisions,manifest}=i;verifySnapshot(snapshot);
 const envelope=decisions?.financialLinkDecisions;if(envelope?.approvalHash!==approvalPin)throw Error('Trusted owner financial links required');verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 const overrides=financialLinkOverrides(snapshot,envelope),proposals=[...overrides.values()].filter(p=>p.evidence.invoiceId==='INV0023');
 if(proposals.length!==2||!proposals.some(p=>p.source.sheet==='49_INVOICE_DETAIL'&&p.source.sourceRow===73)||!proposals.some(p=>p.source.sheet==='50_AR_AP'&&p.source.sourceRow===16))throw Error('Exact Invoice17 owner source set differs');
 const header=snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===17),file=manifest.files.find(f=>f.sourceRow===17);
 if(!header||header.legacyId!=='INV0023'||proposals.some(p=>p.evidence.fileId!==file?.fileId||p.evidence.sha256!==file?.sha256||p.target.sourceRow!==123))throw Error('Owner Invoice17 original PDF binding differs');
 const {reviewHash,...body}=combined;if(digest(body)!==reviewHash||combined.snapshotHash!==snapshot.snapshotHash||combined.targetPlanHash!==targetPlan.planHash)throw Error('Owner link combined source pin differs');
 const groups=targetPlan.groups.filter(g=>g.entries.some(e=>[122,123].includes(e.source.sourceRow))).map(g=>{
  const c=combined.groups.find(c=>c.groupKey===g.groupKey),chain=combined.lifecycle.chains.find(c=>same(c.source,g.documentSource)),row=g.entries[0];
  const expected=row?.source.sourceRow===122?['INVOICE_DETAIL_DOCUMENT_CONFLICT']:['REVENUE_ID_NOT_UNIQUE','INVOICE_DETAIL_DOCUMENT_CONFLICT'];
  if(g.entries.length!==1||!same(c?.rows.map(r=>r.summaryState),['EXACT_USD_SUMMARY_MATCH'])||!same([...(chain?.issues??[])].sort(),expected.sort())||chain.referenceIssues.length||chain.donorActivity!=='ACTIVE'||chain.sourcePattern!=='ACTIVE_CAPTURED_CHAIN'||c.sourceReplacementEvents.length||c.reasons.some(r=>!['BUSINESS_HELD','SOURCE_CHAIN_REQUIRES_REVIEW'].includes(r)))throw Error('Other owner-linked source chain holds remain');
  const detail=snapshot.tables['49_INVOICE_DETAIL'].rows.find(r=>r.sourceRow===73),target=snapshot.tables['40_MONTHLY_REVENUE'].rows.find(r=>r.sourceRow===123);
  if(detail.values.Revenue_ID!==snapshot.tables['40_MONTHLY_REVENUE'].rows.find(r=>r.sourceRow===122).legacyId||detail.values.Source_Recon_Doc_ID!==target.values.Source_Recon_Doc_ID||detail.values.Source_Recon_Detail_ID!==target.values.Source_Recon_Detail_ID||detail.values.Service_ID!==target.values.Service_ID)throw Error('Owner-preserved source document conflict differs');
  return {groupKey:g.groupKey,source:row.source,sourceDocument:g.documentSource,originalChainIssues:chain.issues,sourceReplacementEvents:[],explanation:'EXACT_OWNER_APPROVED_REVENUE_LINK_WITH_CAPTURED_LEGACY_ID_PRESERVED',physicalIdentityRequired:row.source.sourceRow===123};
 });
 if(groups.length!==2)throw Error('Owner source group closure differs');
 const report={format:'dgc-owner-linked-source-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,combinedReviewHash:combined.reviewHash,ownerApprovalHash:approvalPin,invoiceSource:{sheet:'48_INVOICE_HEADER',sheetId:snapshot.tables['48_INVOICE_HEADER'].sheetId,sourceRow:17,legacyId:header.legacyId,rowHash:header.rowHash},originalInvoicePdf:{fileId:file.fileId,sha256:file.sha256},groups,sourceCellsChanged:false,ownerDecisionGeneralized:false,financialAcceptance:false,acceptance:false};return {...report,reviewHash:digest(report)};
}
