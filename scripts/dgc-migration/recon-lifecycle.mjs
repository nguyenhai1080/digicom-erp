import {verifySnapshot,digest,text} from './core.mjs';
import {referenceGraph} from './graph.mjs';
import {capturedMonth} from './recon-semantics.mjs';
const inactive=['cancelled','superseded','deleted','rejected'];
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const key=a=>a.sheet+'|'+a.sourceRow;
const ids=raw=>[...new Set(text(raw).split(/[,;\n]/).map(text).filter(Boolean))];
const tags=(raw,pattern)=>[...new Set([...text(raw).matchAll(pattern)].map(m=>m[1]))];
export const reconSourceFileTags=raw=>tags(raw,/(?:^|[;\s])Recon_Doc_ID=([A-Za-z0-9_-]+)(?=$|[;\s])/g);
export const reconNoteTags=raw=>tags(raw,/(?:^|\s)Imported from Movitel PDF\s+([A-Za-z0-9_-]+)(?=$|[\s/|;])/g);
// Donor normalization is for a replacement candidate key only, not a master alias.
export const donorReconServiceKey=v=>text(v).replace(/\s*[-–—]\s*/g,'-').replace(/\s+/g,'_').replace(/_*-_*/g,'-').replace(/__+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();
export const donorInvoiceCurrent=v=>!['superseded','cancelled'].includes(text(v.Status).toLowerCase())&&text(v.Is_Current).toUpperCase()!=='FALSE';

export function reconLifecycleReview(snapshot,decisions){
 verifySnapshot(snapshot);const graph=referenceGraph(snapshot,decisions),rows={};
 for(const [sheet,t] of Object.entries(snapshot.tables))rows[sheet]=t.rows.map(r=>({...r,source:addr(sheet,t,r)}));
 const headers=rows['43_RECON_PDF_HEADER'],revenues=rows['40_MONTHLY_REVENUE'],recons=rows['41_RECONCILIATION'],lines=rows['49_INVOICE_DETAIL'],invoices=rows['48_INVOICE_HEADER'],payments=rows['52_INVOICE_PAYMENT'],ars=rows['50_AR_AP'],packages=rows['55_APPROVAL_PACKAGE'];
 const headerKey=h=>{const v=h.values,p=capturedMonth(h,'Period_Month')??capturedMonth(h,'Period'),s=donorReconServiceKey(v.Service_Header),partner=text(v.Partner_ID).toUpperCase();return p&&s&&partner?[partner,s,p].join('|'):null;};
 const chains=headers.map(h=>{
  const id=text(h.legacyId),status=text(h.values.Status),isInactive=inactive.includes(status.toLowerCase()),issues=[];
  const rs=revenues.filter(r=>text(r.values.Source_Recon_Doc_ID)===id||reconSourceFileTags(r.values.Source_File).includes(id)),revenueIds=new Set(rs.map(r=>text(r.legacyId)).filter(Boolean));
  const cs=recons.filter(r=>revenueIds.has(text(r.values.Revenue_ID))||reconNoteTags(r.values.Note).includes(id));
  const ds=lines.filter(r=>text(r.values.Source_Recon_Doc_ID)===id||revenueIds.has(text(r.values.Revenue_ID))),invoiceIds=new Set(ds.map(r=>text(r.values.Invoice_ID)).filter(Boolean));
  const invs=invoices.filter(r=>invoiceIds.has(text(r.legacyId))),ps=payments.filter(r=>invoiceIds.has(text(r.values.Invoice_ID))),current=invs.filter(r=>donorInvoiceCurrent(r.values));
  const aps=ars.filter(r=>invoiceIds.has(text(r.values.Invoice_ID))),pkgs=packages.filter(r=>ids(r.values.Related_Recon_Doc_IDs).includes(id)||ids(r.values.Related_Revenue_IDs).some(x=>revenueIds.has(x))||ids(r.values.Related_Invoice_IDs).some(x=>invoiceIds.has(x)));
  if(!id||headers.filter(x=>x.legacyId===h.legacyId).length!==1)issues.push('HEADER_ID_NOT_UNIQUE');
  for(const r of rs){const direct=text(r.values.Source_Recon_Doc_ID),tagged=reconSourceFileTags(r.values.Source_File);
   if(!direct)issues.push('REVENUE_HAS_TAG_ONLY_DOCUMENT_REFERENCE');
   if(direct&&tagged.some(x=>x!==direct))issues.push('REVENUE_DOCUMENT_TAG_CONFLICT');
   if(revenues.filter(x=>x.legacyId===r.legacyId).length!==1)issues.push('REVENUE_ID_NOT_UNIQUE');
  }
  for(const d of ds)if(text(d.values.Source_Recon_Doc_ID)&&text(d.values.Source_Recon_Doc_ID)!==id)issues.push('INVOICE_DETAIL_DOCUMENT_CONFLICT');
  for(const iid of invoiceIds)if(invoices.filter(r=>text(r.legacyId)===iid).length!==1)issues.push('INVOICE_ID_NOT_UNIQUE_OR_MISSING');
  const members=new Set([...rs,...cs,...ds,...invs,...ps,...aps].map(r=>key(r.source)));
  const referenceIssues=graph.links.filter(l=>members.has(key(l.source))&&!l.target&&['Revenue_ID','Invoice_ID','Source_Recon_Doc_ID','Source_Recon_Detail_ID','Supersedes_Invoice_ID','Superseded_By_Invoice_ID'].includes(l.field));
  if(referenceIssues.length)issues.push('UNRESOLVED_CHAIN_REFERENCES');
  if(isInactive){
   if(!rs.length)issues.push('INACTIVE_CHAIN_WITHOUT_CAPTURED_REVENUE');
   if(rs.some(r=>text(r.values.Include_In_Monthly_Total).toUpperCase()!=='N'))issues.push('INACTIVE_REVENUE_NOT_EXCLUDED_FROM_MONTHLY');
   if(!cs.length||cs.some(r=>text(r.values.Status).toLowerCase()!=='cancelled'))issues.push('INACTIVE_RECON_NOT_CANCELLED_OR_MISSING');
   if(ps.length)issues.push('PAYMENT_ON_INACTIVE_CHAIN_REQUIRES_TIMELINE_REVIEW');
   if(current.some(r=>text(r.values.Needs_Regeneration).toUpperCase()!=='TRUE'))issues.push('CURRENT_INVOICE_NOT_MARKED_FOR_REGENERATION');
  }
  const businessKey=headerKey(h),candidates=businessKey?headers.filter(x=>x.source.sourceRow!==h.source.sourceRow&&headerKey(x)===businessKey&&!inactive.includes(text(x.values.Status).toLowerCase())):[];
  if(!isInactive&&candidates.length)issues.push('MULTIPLE_ACTIVE_HEADERS_FOR_DONOR_KEY');
  const uniqueIssues=[...new Set(issues)];
  return {source:h.source,status,donorActivity:isInactive?'INACTIVE':'ACTIVE',businessKey,sourcePattern:isInactive?(uniqueIssues.length?'INACTIVE_PATTERN_REQUIRES_REVIEW':'INACTIVE_PATTERN_OBSERVED'):'ACTIVE_CAPTURED_CHAIN',issues:uniqueIssues,referenceIssues,
   revenue:rs.map(r=>({source:r.source,status:r.values.Status??null,rowType:r.values.Revenue_Row_Type??null,includeInMonthlyTotal:r.values.Include_In_Monthly_Total??null})),reconciliations:cs.map(r=>({source:r.source,status:r.values.Status??null})),invoiceDetails:ds.map(r=>r.source),invoices:invs.map(r=>({source:r.source,status:r.values.Status??null,isCurrent:r.values.Is_Current??null,donorCurrent:donorInvoiceCurrent(r.values),needsRegeneration:r.values.Needs_Regeneration??null,supersedes:r.values.Supersedes_Invoice_ID??null,supersededBy:r.values.Superseded_By_Invoice_ID??null})),payments:ps.map(r=>r.source),arAp:aps.map(r=>({source:r.source,type:r.values.ARAP_Type??null,status:r.values.Status??null,isCurrent:r.values.Is_Current??null})),approvalPackages:pkgs.map(r=>({source:r.source,status:r.values.Approval_Status??null})),
   replacementBlockedByCapturedPayments:ps.length>0,counterpartCandidates:candidates.map(r=>r.source),replacementRelationshipAccepted:false,targetLifecycleMapped:false,readyToImport:false};
 });
 const body={format:'dgc-recon-lifecycle-review-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,chains,counts:chains.reduce((a,c)=>(a[c.sourcePattern]=(a[c.sourcePattern]??0)+1,a),{}),scope:'CAPTURED_SOURCE_PATTERN_AND_EXACT_TOKEN_CHAIN_NO_REPLACEMENT_OR_PAYMENT_TIMELINE_INFERENCE',postingAllowed:false,acceptance:false,historicalCashPosting:false};
 return {...body,reviewHash:digest(body)};
}
