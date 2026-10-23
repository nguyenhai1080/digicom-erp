import {verifySnapshot,canonical,digest} from './core.mjs';
const key=s=>s.sheet+'|'+s.sourceRow+'|'+s.field;
const hex=/^[a-f0-9]{64}$/;
function proposalRows(snapshot,proposal){
 verifySnapshot(snapshot);
 const {proposalHash,...body}=proposal??{};
 if(body.format!=='dgc-financial-link-proposals-v1'||body.snapshotHash!==snapshot.snapshotHash||body.approved!==false||body.postingAllowed!==false||!hex.test(proposalHash??'')||digest(body)!==proposalHash||!Array.isArray(body.proposals)||!body.proposals.length)throw Error('Invalid or stale financial link proposal');
 const used=new Set();
 for(const p of body.proposals){
  const s=p.source,t=p.target,source=snapshot.tables[s?.sheet],target=snapshot.tables[t?.sheet],r=source?.rows.find(r=>r.sourceRow===s.sourceRow),to=target?.rows.find(r=>r.sourceRow===t.sourceRow);
  if(!['49_INVOICE_DETAIL','50_AR_AP'].includes(s?.sheet)||s.field!=='Revenue_ID'||t?.sheet!=='40_MONTHLY_REVENUE'||p.state!=='PROPOSED_AWAITING_OWNER'||p.changeSource!==false||p.changeMoney!==false||used.has(key(s))||!r||!to||source.sheetId!==s.sheetId||target.sheetId!==t.sheetId||r.legacyId!==s.legacyId||r.rowHash!==s.expectedRowHash||to.legacyId!==t.legacyId||to.rowHash!==t.expectedRowHash||canonical(r.values[s.field])!==canonical(s.expectedValue)||!hex.test(p.evidence?.sha256??'')||!p.evidence?.fileId||!p.evidence?.invoiceId)throw Error('Financial decision source/target/evidence differs');
  // The PDF must belong to the explicit invoice parent, not just share a label.
  const invoices=snapshot.tables['48_INVOICE_HEADER'].rows.filter(h=>h.legacyId===p.evidence.invoiceId);
  if(invoices.length!==1||r.values.Invoice_ID!==p.evidence.invoiceId)throw Error('Financial decision Invoice parent differs');
  used.add(key(s));
 }
 return proposal;
}
export function approveFinancialLinkProposal(snapshot,proposal,{expectedProposalHash,approvedBy,approvedAt,decision}={}){
 proposalRows(snapshot,proposal);
 if(expectedProposalHash!==proposal.proposalHash||approvedBy!=='OWNER'||decision!=='APPROVE_ALL'||!Number.isFinite(Date.parse(approvedAt)))throw Error('Explicit owner approval of this proposal digest required');
 const body={format:'dgc-financial-link-decisions-v1',snapshotHash:snapshot.snapshotHash,proposal,approval:{approvedBy,approvedAt,decision,sourceChanged:false,moneyChanged:false,datesChanged:false,pdfsChanged:false}};
 return {...body,approvalHash:digest(body)};
}
export function financialLinkOverrides(snapshot,envelope){
 if(envelope===undefined)return new Map();
 const {approvalHash,...body}=envelope??{};
 if(body.format!=='dgc-financial-link-decisions-v1'||body.snapshotHash!==snapshot.snapshotHash||!hex.test(approvalHash??'')||digest(body)!==approvalHash)throw Error('Invalid financial link approval checksum');
 const a=body.approval;
 if(a?.approvedBy!=='OWNER'||a.decision!=='APPROVE_ALL'||!Number.isFinite(Date.parse(a.approvedAt))||a.sourceChanged!==false||a.moneyChanged!==false||a.datesChanged!==false||a.pdfsChanged!==false)throw Error('Explicit immutable financial link owner decision required');
 proposalRows(snapshot,body.proposal);
 return new Map(body.proposal.proposals.map(p=>[key(p.source),{...p,proposalHash:body.proposal.proposalHash,approvalHash,approvedAt:a.approvedAt}]));
}
