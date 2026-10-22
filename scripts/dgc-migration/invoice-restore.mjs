import {canonical,digest,sourceDate} from './core.mjs';
import {invoiceHistoryPlan} from './invoice-history.mjs';
import {revenueScopePlan} from './revenue-scopes.mjs';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:120}),key=s=>s.sheet+'|'+s.sourceRow;
const hex=/^[a-f0-9]{64}$/;

// Blueprint for rollback-only trials. Never issue/regenerate an Invoice, create
// local approvals, or turn historical receipts into runtime cash/payment rows.
export function invoiceRestorePlan(snapshot,targetPlan,combined,reviewPin,manifest,manifestPin,decisions){
 const scopes=revenueScopePlan(snapshot,targetPlan,combined,reviewPin,decisions),history=invoiceHistoryPlan(snapshot,decisions),{manifestHash,...body}=manifest??{};
 if(!hex.test(manifestPin??'')||manifestHash!==manifestPin||manifest?.format!=='dgc-source-invoice-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.acceptance!==false||digest(body)!==manifestPin||!Array.isArray(manifest.files))throw Error('Pinned Invoice PDF manifest differs');
 const pdfs=new Map();for(const f of manifest.files){const h=history.entries.find(e=>e.source.sourceRow===f.sourceRow);if(!h||pdfs.has(f.sourceRow)||f.rowHash!==h.source.rowHash||f.legacyId!==h.source.legacyId||f.fileId!==String(h.capturedHeader.values.Pdf_File_ID??'').trim()||!/^[A-Za-z0-9_-]{20,200}$/.test(f.fileId)||f.relativePath!==f.fileId+'.pdf'||f.mimeType!=='application/pdf'||!Number.isSafeInteger(f.size)||f.size<=0||f.size>64*1024*1024||!hex.test(f.sha256??''))throw Error('Invoice PDF row coverage or metadata differs');pdfs.set(f.sourceRow,f);}
 if(pdfs.size!==history.entries.length)throw Error('Missing Invoice PDF coverage');
 const bySource=new Map(scopes.invoices.map(i=>[key(i.source),i]));
 const entries=history.entries.map(h=>{
  const scope=bySource.get(key(h.source)),v=h.capturedHeader.values,reasons=[];
  const evidence={capturedHeaderJson:canonical(h.capturedHeader),capturedDetailsJson:canonical(h.capturedDetails),capturedReceivablesJson:canonical(h.capturedReceivables),capturedPaymentsJson:canonical(h.capturedPayments)};
  const common={source:h.source,sourceStatus:h.sourceStatus,disposition:h.disposition,...evidence,pdf:pdfs.get(h.source.sourceRow),readyToImport:false,filesVerified:false,postingAllowed:false,historicalCashPosting:false,localApprovalCreated:false};
  if(h.disposition==='PRESERVE_HISTORY_ONLY')return {...common,state:'ARCHIVE_SEPARATE_NO_CURRENT_AR',reasons:[],invoice:null,receivable:null,scopes:[],revenueGroupKeys:[]};
  if(h.disposition==='PREPARE_UNISSUED_DRAFT')return {...common,state:'DRAFT_RESTORE_DEFERRED_NO_AR',reasons:[],invoice:null,receivable:null,scopes:scope.scopes,revenueGroupKeys:[]};
  if(scope.bindingState!=='STRUCTURAL_SCOPE_BOUND')reasons.push('SCOPE_BINDING_REQUIRES_REVIEW');
  if(scope.financialReasons.length||h.amountDifferences.length||h.amountIssues.length)reasons.push('CAPTURED_FINANCE_REQUIRES_REVIEW');
  const items=scope.scopes.flatMap(s=>s.items);
  if(!items.length||items.some(i=>i.sourceBusinessState!=='REHEARSABLE'||i.sourceEvidenceState!=='EVIDENCE_CLEAR_FOR_NEXT_REVIEW'))reasons.push('REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD');
  if(!scope.proposedRevenueStatuses.length||scope.proposedRevenueStatuses.some(r=>!r.status))reasons.push('REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW');
  const dates={};for(const field of ['Invoice_Date','Payment_Due_Date'])try{dates[field]=sourceDate(h.capturedHeader,field);if(!dates[field])reasons.push('MISSING_SOURCE_'+field);}catch{dates[field]=null;reasons.push('UNRESOLVED_SOURCE_'+field);}
  function money(row,field){try{const v=row.values[field];if(!['number','string'].includes(typeof v)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v)))throw Error();const d=new Decimal(String(v));if(!d.isFinite()||d.lt(0)||d.decimalPlaces()>4||d.gte('10000000000000000'))throw Error();return d.toFixed();}catch{reasons.push('TARGET_AMOUNT_REQUIRES_REVIEW');return null;}}
  const invoice={invoiceNumber:v.Invoice_Number,businessKey:v.Business_Key,sourceRevisionNo:v.Revision_No,invoiceMode:scope.scopes[0]?.proposedInvoiceMode??null,period:items[0]?.period??null,currency:v.Currency,invoiceDate:dates.Invoice_Date,dueDate:dates.Payment_Due_Date,revenueAmount:money(h.capturedHeader,'Total_Revenue_USD'),whtAmount:money(h.capturedHeader,'Total_WHT_USD'),payableAmount:money(h.capturedHeader,'Total_Payable_USD'),paidAmount:money(h.capturedHeader,'Paid_Amount_USD'),proposedOperationalStatus:({Paid:'PAID',Issued:'ISSUED',Overdue:'ISSUED','Partially Paid':'PARTIALLY_PAID'})[v.Status]??null,safeTrialStatus:'CANCELLED',safeTrialIsCurrent:false,issuedAt:null,issuedById:null,creatorPolicy:'EPHEMERAL_DISABLED_TECHNICAL_ACTOR_NOT_SOURCE_APPROVER'};
  if(invoice.invoiceDate&&invoice.dueDate&&invoice.dueDate<invoice.invoiceDate)reasons.push('SOURCE_INVOICE_DATE_ORDER_CONFLICT');
  const ars=h.capturedReceivables.filter(r=>String(r.values.ARAP_Type).toUpperCase()==='AR'&&String(r.values.Is_Current).toUpperCase()==='TRUE'&&!['CANCELLED','SUPERSEDED'].includes(String(r.values.Status).toUpperCase()));
  if(ars.length!==1)reasons.push('CURRENT_AR_NOT_UNIQUE');
  const ar=ars.length===1?ars[0]:null,receivable=ar?{source:{sheet:ar.sheet,sheetId:ar.sheetId,sourceRow:ar.sourceRow,legacyId:ar.legacyId,rowHash:ar.rowHash},originalAmount:money(ar,'Original_Amount'),paidAmount:money(ar,'Paid_Amount'),outstandingAmount:money(ar,'Outstanding_Amount'),sourceStatus:ar.values.Status,safeTrialStatus:'CANCELLED'}:null;
  if(!invoice.proposedOperationalStatus||v.Currency!=='USD')reasons.push('UNSUPPORTED_CURRENT_INVOICE_STATE_OR_CURRENCY');
  return {...common,state:reasons.length?'RESTORE_HELD':'CANDIDATE_FOR_VERIFIED_ROLLBACK_TRIAL',reasons:[...new Set(reasons)],invoice,receivable,scopes:scope.scopes,revenueGroupKeys:[...new Set(items.map(i=>i.sourceGroupKey))],paymentRestorePolicy:'CANONICAL_SOURCE_EVIDENCE_ONLY_NO_APPROVED_PAYMENT_ROWS'};
 });
 const report={format:'dgc-invoice-restore-plan-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,scopePlanHash:scopes.planHash,invoiceHistoryPlanHash:history.planHash,combinedReviewHash:reviewPin,invoiceManifestHash:manifestPin,mode:'BLOCKED_ROLLBACK_TRIAL_BLUEPRINT_NO_COMMIT',entries,counts:entries.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),readyToImport:false,filesVerified:false,postingAllowed:false,historicalCashPosting:false,recomputeAmounts:false,acceptance:false};return {...report,planHash:digest(report)};
}
export function verifyInvoiceRestorePlan(plan,...inputs){const {planHash,...body}=plan??{};if(planHash!==digest(body))throw Error('Invoice restore plan checksum differs');if(canonical(plan)!==canonical(invoiceRestorePlan(...inputs)))throw Error('Invoice restore plan differs from pinned source evidence');return plan;}
