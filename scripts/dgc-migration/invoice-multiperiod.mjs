import {canonical,digest,sourceDate} from './core.mjs';
import {withSourcePlanningCache} from './planning-context.mjs';
import {capturedMonth} from './recon-semantics.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {invoiceRestorePlan} from './invoice-restore.mjs';
import {revenueBillingPlan} from './revenue-billing.mjs';
import {referenceGraph} from './graph.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client'),D=v=>new Prisma.Decimal(String(v)),same=(a,b)=>canonical(a)===canonical(b),key=s=>s.sheet+'|'+s.sourceRow;

// Captured dates are calendar evidence. Never replace Revenue_Month with a
// derived first month or infer a missing range from the detail rows.
export function capturedInvoiceWindow(header){
 const marker=capturedMonth(header,'Revenue_Month');let start,end;
 try{start=sourceDate(header,'Billing_Period_Start');end=sourceDate(header,'Billing_Period_End');}catch{return {state:'INVALID_CAPTURED_BILLING_RANGE',marker,periods:[]};}
 if(!start&&!end)return {state:'NO_CAPTURED_BILLING_RANGE',marker,periods:[]};
 if(!start||!end||start>end||!start.endsWith('-01')||new Date(Date.parse(end)+86400000).getUTCDate()!==1)return {state:'INVALID_CAPTURED_BILLING_RANGE',marker,start,end,periods:[]};
 const periods=[];let month=start.slice(0,7);while(month<=end.slice(0,7)&&periods.length<=120){periods.push(month);const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);}
 if(periods.length>120||!periods.includes(marker))return {state:'INVALID_CAPTURED_BILLING_RANGE',marker,start,end,periods:[]};
 return {state:periods.length>1?'CAPTURED_MULTIPERIOD_RANGE':'CAPTURED_SINGLE_PERIOD_RANGE',marker,start,end,periods};
}
async function verifiedRender(root,render){
 if(!render||typeof render.relativePath!=='string'||!Number.isSafeInteger(render.size)||!/^[a-f0-9]{64}$/.test(render.sha256??''))throw Error('Pinned visual render required');
 const base=await realpath(root),path=await realpath(resolve(base,render.relativePath)),rel=relative(base,path);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Visual render escaped evidence directory');
 const bytes=await readFile(path);if(bytes.length!==render.size||createHash('sha256').update(bytes).digest('hex')!==render.sha256)throw Error('Visual render checksum differs');
}
// A separate structural proposal. Older scope/restore/unified plans are
// rederived unchanged; financial, lifecycle, OCR, FX and PDF holds stay intact.
export async function invoiceMultiPeriodReview({invoiceOptions:i,observations,observationPin,observationRoot}){return withSourcePlanningCache(async()=>{
 const {observationHash,...body}=observations??{};if(observationHash!==observationPin||observationHash!==digest(body)||observations.format!=='dgc-scan-and-multiperiod-visual-observations-v1'||observations.snapshotHash!==i.snapshot.snapshotHash||observations.operationalAcceptance!==false)throw Error('Unpinned multi-period visual observations');
 const o=observations.multiPeriodInvoice;if(!o||o.method!=='CODEX_VISUAL_REVIEW'||o.acceptance!==false||o.sourceValuesChanged!==false)throw Error('Explicit original Invoice observation required');
 const source=i.snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===o.source?.sourceRow),sourceAddress=source&&{sheet:'48_INVOICE_HEADER',sheetId:i.snapshot.tables['48_INVOICE_HEADER'].sheetId,sourceRow:source.sourceRow,legacyId:source.legacyId,rowHash:source.rowHash};
 if(!source||!same(sourceAddress,o.source))throw Error('Invoice observation row binding differs');
 if(i.manifest.manifestHash!==i.manifestPin)throw Error('Invoice manifest pin differs');await verifyInvoiceFiles(i.snapshot,i.manifest,i.root);await verifiedRender(observationRoot,o.visualRender);
 const file=i.manifest.files.find(f=>f.sourceRow===source.sourceRow),window=capturedInvoiceWindow(source),v=source.values;
 if(file?.sha256!==o.pdfSha256||file?.fileId!==o.fileId||v.Invoice_Number!==o.invoiceNumber||sourceDate(source,'Invoice_Date')!==o.invoiceDate||window.start!==o.billingStart||window.end!==o.billingEnd||!['revenue','wht','payable'].every((f,n)=>{try{return D(v[['Total_Revenue_USD','Total_WHT_USD','Total_Payable_USD'][n]]).eq(o.components?.[f]);}catch{return false;}}))throw Error('Printed Invoice identity, dates or components differ from captured source');
 const strict=revenueScopePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),restore=invoiceRestorePlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin,i.decisions),inv=strict.invoices.find(e=>same(e.source,o.source)),original=restore.entries.find(e=>same(e.source,o.source));
 if(!inv||!original||inv.disposition!=='PREPARE_CURRENT_LEDGER')throw Error('Current captured Invoice required');
 const entries=new Map(i.targetPlan.groups.flatMap(g=>g.entries.map(e=>[key(e.source),{e,g}]))),graph=referenceGraph(i.snapshot,i.decisions),links=new Map(graph.links.map(l=>[key(l.source)+'|'+l.field,l])),own=new Map(inv.lineMappings.map(m=>[key(m.detailSource),m])),reasons=[];
 if(window.state!=='CAPTURED_MULTIPERIOD_RANGE')reasons.push('NO_VALID_CAPTURED_MULTIPERIOD_RANGE');
 const periods=[...new Set(inv.scopes.map(s=>s.period))].sort();if(!same(periods,window.periods))reasons.push('INCOMPLETE_OR_EXTRA_CAPTURED_PERIOD_COVERAGE');
 const lineMatches=m=>{const bound=entries.get(key(m.revenueSource??{}));return !!bound&&window.periods.includes(bound.g.period)&&bound.g.currency===String(v.Currency)&&String(bound.e.capturedRevenue.values.Partner_ID)===String(v.Partner_ID)&&same(links.get(key(m.detailSource)+'|Revenue_ID')?.target,m.revenueSource)&&same(links.get(key(m.detailSource)+'|Invoice_ID')?.target,inv.source)&&same(links.get(key(m.detailSource)+'|Service_ID')?.target,bound.e.bindings.Service_ID)&&same(links.get(key(m.detailSource)+'|Source_Recon_Doc_ID')?.target,bound.g.documentSource)&&same(links.get(key(m.detailSource)+'|Source_Recon_Detail_ID')?.target,bound.e.bindings.Source_Recon_Detail_ID);};
 if(inv.lineMappings.some(m=>!lineMatches(m)))reasons.push('LINE_PERIOD_PARTNER_CURRENCY_OR_GRAPH_CONFLICT');
 const justifiedReservation=r=>{const m=own.get(key(r.evidence?.detailSource??{})),a=entries.get(key(r.revenueSource??{})),b=m&&entries.get(key(m.revenueSource??{}));return !!m&&!!a&&!!b&&r.evidence.reason==='SAME_PARTNER_SERVICE_MONTH_WITHOUT_EXACT_REVENUE_LINK'&&same(r.evidence.invoiceSource,inv.source)&&lineMatches(m)&&a.g.period!==b.g.period&&window.periods.includes(a.g.period)&&window.periods.includes(b.g.period)&&same(a.e.bindings.Service_ID,b.e.bindings.Service_ID)&&same(a.g.partnerSource,b.g.partnerSource)&&same(a.g.contractSource,b.g.contractSource);};
 const printedService=String(o.serviceText??'').trim().toUpperCase().replace(/\s+/g,''),printedServiceBound=!!printedService&&inv.lineMappings.every(m=>{const bound=entries.get(key(m.revenueSource??{})),detail=bound?.e.bindings.Source_Recon_Detail_ID;const row=i.snapshot.tables['44_RECON_PDF_DETAIL'].rows.find(r=>r.sourceRow===detail?.sourceRow&&r.rowHash===detail.rowHash);return String(row?.values.Service_Name??'').trim().toUpperCase().replace(/\s+/g,'')===printedService;});
 if(!printedServiceBound)reasons.push('PRINTED_SERVICE_LABEL_REQUIRES_REVIEW');
 const resolvedScopeIssues=[],remainingScopeIssues=[];
 for(const issue of inv.issues){
  if(!reasons.length&&issue.code==='INVOICE_AND_SOURCE_SCOPE_CONFLICT'&&lineMatches(own.get(key(issue.detailSource))??{})){resolvedScopeIssues.push({...issue,basis:'CAPTURED_RANGE_AND_ORIGINAL_PDF'});continue;}
  if(!reasons.length&&issue.code==='SOURCE_SCOPE_RESERVED_OR_REFERENCED_ELSEWHERE'){
   const cleared=issue.reservations.filter(justifiedReservation),held=issue.reservations.filter(r=>!justifiedReservation(r));if(cleared.length)resolvedScopeIssues.push({...issue,reservations:cleared,basis:'EXACT_OTHER_PERIOD_DETAIL_IN_SAME_INVOICE'});if(held.length)remainingScopeIssues.push({...issue,reservations:held});continue;
  }remainingScopeIssues.push(issue);
 }
 const structurallyBound=!reasons.length&&!remainingScopeIssues.length,billing=revenueBillingPlan(i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.decisions),billingRows=new Map(billing.rows.map(r=>[key(r.source),r])),mappedStatus=({'PAID':'PAID','PARTIALLY PAID':'PARTIALLY_PAID','ISSUED':'INVOICED','OVERDUE':'INVOICED'})[String(v.Status).toUpperCase()]??null;
 const billingStateReview=inv.lineMappings.map(m=>{const r=billingRows.get(key(m.revenueSource??{})),reservations=r?.scopeReservations??[],allOwned=reservations.length>0&&reservations.every(evidence=>justifiedReservation({revenueSource:r.source,evidence}));const eligible=!!mappedStatus&&!!r&&r.sourceStatus==='Approved'&&r.directCurrentLines.length===1&&same(r.directCurrentLines[0].invoiceSource,inv.source)&&r.directCurrentLines[0].referenceState==='RESOLVED'&&!r.unresolvedParentLines.length&&(r.proposedRevenueStatus===mappedStatus||allOwned&&r.reasons.length>0&&r.reasons.every(reason=>reason==='BUSINESS_SCOPE_RESERVATION_REQUIRES_REVIEW'));return {source:m.revenueSource,originalStatus:r?.proposedRevenueStatus??null,originalReasons:r?.reasons??[],ownOtherPeriodReservations:allOwned?reservations:[],proposedStatus:structurallyBound&&eligible?mappedStatus:null};});
 const billingStateBound=structurallyBound&&!inv.financialReasons.length&&inv.headerChecks.every(c=>c.state==='MATCH')&&billingStateReview.length>0&&billingStateReview.every(r=>r.proposedStatus===mappedStatus)&&!!mappedStatus;
 const proposedRevenueStatuses=inv.scopes.flatMap(s=>s.items.map(item=>({source:item.source,status:billingStateBound?mappedStatus:null})));
 const remainingImportReasons=original.reasons.filter(r=>!(structurallyBound&&r==='SCOPE_BINDING_REQUIRES_REVIEW')&&!(billingStateBound&&r==='REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW'));
 const report={format:'dgc-captured-multiperiod-scope-review-v1',snapshotHash:i.snapshot.snapshotHash,source:o.source,observationHash,invoiceManifestHash:i.manifestPin,strictScopePlanHash:strict.planHash,strictRestorePlanHash:restore.planHash,window,sourceHeaderPeriod:window.marker,printedServiceBound,scopePeriods:periods,state:structurallyBound?'MULTIPERIOD_STRUCTURE_BOUND_FINANCIAL_REVIEW_PENDING':'MULTIPERIOD_STRUCTURE_HELD',reasons,resolvedScopeIssues,remainingScopeIssues,remainingImportReasons,billingStateBound,billingStateReview,proposedRevenueStatuses,financialReasons:inv.financialReasons,headerChecks:inv.headerChecks,scopes:inv.scopes,capturedHeaderJson:inv.capturedHeaderJson,capturedDetailsJson:inv.capturedDetailsJson,originalRestoreState:original.state,originalRestoreReasons:original.reasons,sourceValuesChanged:false,recomputeAmounts:false,originalGatesUnchanged:true,localApprovalCreated:false,historicalCashPosting:false,postingAllowed:false,readyToImport:false,acceptance:false};return {...report,reviewHash:digest(report)};
});}
