import {createRequire} from 'node:module';
import {canonical,digest,verifySnapshot,sourceDate} from './core.mjs';
import {referenceGraph} from './graph.mjs';
import {capturedMonth} from './recon-semantics.mjs';
import {receiptTargetPlan} from './receipt-target.mjs';
import {invoiceReferenceReview} from './invoice-references.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const D=Prisma.Decimal.clone({precision:120});
const ref=key=>({$record:key}),master=s=>({$master:s}),date=value=>({$date:value});
const archive=new Set(['Cancelled','Canceled','Superseded']);
const documentWarnings={4:['Giữ ngày/số tiền sổ; bản ký khác ngày, hạn và Revenue 0,01 USD.'],14:['Sổ 14.668,99 USD; PDF gốc 14.669,00 USD. Không thêm công nợ hoặc điều chỉnh.'],33:['Giữ trường sổ; bản ký khác ngày, hạn và Revenue 0,01 USD.'],38:['CRBT sổ/Invoice 3,28 USD; Recon gốc 3,27 USD. Giữ cả hai chứng từ.'],43:['Giữ sổ/Invoice/Recon CRBT 2,51 USD; detail nguồn cũ 2,91 USD được bảo toàn riêng.'],44:['Kỳ 07/2026; năm bản sao Recon có chân trang 06/2026. Năm bản gốc vẫn thiếu.']};
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const at=s=>s.sheet+'|'+s.sourceRow;
function money(v,scale=4,precision=20){
 if(!['string','number'].includes(typeof v)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v)))throw Error('Source amount cannot be stored losslessly');
 const n=new D(String(v));if(!n.isFinite()||n.decimalPlaces()>scale||n.abs().gte(new D(10).pow(precision-scale)))throw Error('Source amount exceeds database precision');return n.toFixed();
}
const dates=period=>({periodStart:date(period+'-01'),periodEnd:date(new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10))});

// Owner-directed carry-forward, not a historical validity review. Old review
// reasons remain warnings. No PDF/native/rounding acceptance is required here.
export function capturedBookPlan({snapshot,baseSnapshot=snapshot,appendix=null,decisions,targetPlan,invoiceManifest,referenceManifest,reconManifest}){
 verifySnapshot(snapshot);
 verifySnapshot(baseSnapshot);if(targetPlan.snapshotHash!==baseSnapshot.snapshotHash||invoiceManifest.snapshotHash!==snapshot.snapshotHash)throw Error('Mixed source snapshots');
 const graph=referenceGraph(baseSnapshot,decisions),links=new Map(graph.links.map(l=>[at(l.source)+'|'+l.field,l.target]));
 const source=(sheet,row)=>({...addr(sheet,snapshot.tables[sheet],row),...(appendix?.rows.some(x=>x.sheetName===sheet&&x.payload.sourceRow===row.sourceRow)?{snapshotHash:appendix.appendixHash}:{})}),rows=sheet=>snapshot.tables[sheet].rows;
 if(appendix){
  const fields={'40_MONTHLY_REVENUE':{Contract_ID:'30_CONTRACTS',Partner_ID:'21_DM_PARTNER',Service_ID:'20_DM_SERVICE',Parent_Service_ID:'20_DM_SERVICE'},'48_INVOICE_HEADER':{Partner_ID:'21_DM_PARTNER'},'49_INVOICE_DETAIL':{Revenue_ID:'40_MONTHLY_REVENUE'}};
  for(const x of appendix.rows)for(const [field,targetSheet] of Object.entries(fields[x.sheetName]??{})){const id=x.payload.values[field];if(!id)continue;const found=rows(targetSheet).filter(r=>r.legacyId===id);if(found.length!==1)throw Error('New record has ambiguous database relation');links.set(x.sheetName+'|'+x.payload.sourceRow+'|'+field,source(targetSheet,found[0]));}
 }
 const binding=(r,field)=>{const s=links.get(at(r)+'|'+field);if(!s)throw Error('Unresolved database relation '+at(r)+' '+field);return master(s);};
 const operations=[],add=(model,key,data,s)=>{if(s&&appendix?.rows.some(r=>r.sheetName===s.sheet&&r.payload.sourceRow===s.sourceRow))s={...s,snapshotHash:appendix.appendixHash};operations.push({model,key,data,...(s?{source:s}:{})});return ref(key);};
 const entries=new Map(),groups=new Map();
 for(const g of targetPlan.groups)for(const e of g.entries){const raw=rows('40_MONTHLY_REVENUE').find(r=>r.sourceRow===e.source.sourceRow);if(!raw||raw.rowHash!==e.source.rowHash)throw Error('Revenue coverage differs');entries.set(e.source.sourceRow,{e,g,raw});groups.set(g.groupKey,g);}
 if(entries.size!==rows('40_MONTHLY_REVENUE').length)throw Error('Incomplete revenue transfer');
 const headers=rows('48_INVOICE_HEADER'),active=headers.filter(r=>!archive.has(r.values.Status)),archives=headers.filter(r=>archive.has(r.values.Status));
 const invoiceDetails=h=>rows('49_INVOICE_DETAIL').filter(r=>r.values.Invoice_ID===h.legacyId);
 const billed=new Map(),scopeRoots=new Map(),lineRows=new Map();
 for(const h of active){
  const roots=new Map(),lines=[];
  for(const line of invoiceDetails(h)){
   const s=links.get('49_INVOICE_DETAIL|'+line.sourceRow+'|Revenue_ID'),x=s&&entries.get(s.sourceRow);
   if(!x)throw Error('Invoice line has no exact revenue relation');
   const {e,g}=x;
   const root=e.aggregationMapping.rowType==='TOTAL'?e:g.entries.find(t=>t.aggregationMapping.rowType==='TOTAL'&&canonical(t.bindings.Service_ID)===canonical(e.bindings.Parent_Service_ID));
   if(!root)throw Error('Invoice scope has no source TOTAL');roots.set(root.source.sourceRow,{e:root,g});
   lines.push({revenueId:ref('revenue:'+e.source.sourceRow),source:source('49_INVOICE_DETAIL',line),serviceId:master(e.bindings.Service_ID),serviceName:line.values.Service_Name,description:line.values.Description??'',revenue:new D(money(line.values.Revenue_USD)).toFixed(2),wht:new D(money(line.values.WHT_USD)).toFixed(2),payable:new D(money(line.values.Payable_USD)).toFixed(2)});
  }
  if(!roots.size)throw Error('Invoice is missing source details');
  scopeRoots.set(h.sourceRow,roots);lineRows.set(h.sourceRow,lines);
  if(h.values.Status!=='Draft')for(const {e,g} of roots.values())for(const r of g.entries.filter(r=>r.sourceStatus==='Approved'&&(r.source.sourceRow===e.source.sourceRow||r.aggregationMapping.rowType==='CHILD'&&canonical(r.bindings.Parent_Service_ID)===canonical(e.bindings.Service_ID))))billed.set(r.source.sourceRow,h.values.Status);
 }
 const warnings=targetPlan.groups.filter(g=>g.reasons.length).map(g=>({groupKey:g.groupKey,sourceRows:g.entries.map(e=>e.source.sourceRow),codes:g.reasons}));
 for(const g of groups.values()){
  const p=dates(g.period),totals=g.entries.filter(e=>e.aggregationMapping.rowType==='TOTAL'&&e.aggregationMapping.includeInMonthlyTotal),sum=f=>totals.reduce((n,e)=>n.plus(e.capturedRevenue.values[f]),new D(0)).toFixed();
  add('reconciliation','recon:'+g.groupKey,{reconCode:'DGC-SOURCE-'+g.groupKey.slice(0,24),logicalGroupId:ref('recon-group:'+g.groupKey),revisionNo:1,isCurrent:true,partnerId:master(g.partnerSource??g.entries[0].bindings.Partner_ID),contractId:master(g.contractSource??g.entries[0].bindings.Contract_ID),periodType:'MONTHLY',...p,currency:g.currency,sourceType:'SYSTEM_IMPORT',status:g.entries.some(e=>e.sourceStatus==='Approved')?'APPROVED':'DRAFT',totalGrossRevenue:sum('Gross_Revenue'),totalPartnerShare:sum('Partner_Share'),totalCompanyShare:sum('Company_Share'),totalNetRevenue:sum('Company_Share'),totalWht:'0',ocrRawJson:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:snapshot.snapshotHash,documentSource:g.documentSource,sourceFileId:g.sourceFileId,warningCodes:g.reasons,capturedStatuses:g.entries.map(e=>({source:e.source,status:e.sourceStatus})),localApprovalCreated:false}});
  for(const [index,e] of g.entries.entries()){
   const v=e.capturedRevenue.values,s=e.source,m=e.capturedManagement,monthTotal=e.aggregationMapping.rowType==='TOTAL'&&e.aggregationMapping.includeInMonthlyTotal;
   // Donor includes only TOTAL/Y in the monthly book. Children of an excluded
   // TOTAL/N remain captured Approved history, without competing current scopes.
   const current=(monthTotal||e.aggregationMapping.rowType==='CHILD'&&g.entries.some(t=>t.aggregationMapping.rowType==='TOTAL'&&t.aggregationMapping.includeInMonthlyTotal&&canonical(t.bindings.Service_ID)===canonical(e.bindings.Parent_Service_ID)))&&!archive.has(e.sourceStatus);
   const status=billed.has(s.sourceRow)?({Paid:'PAID','Partially Paid':'PARTIALLY_PAID'})[billed.get(s.sourceRow)]??'INVOICED':e.sourceStatus==='Approved'&&current?'INVOICE_READY':e.sourceStatus==='Cancelled'?'CANCELLED':e.sourceStatus==='Superseded'?'SUPERSEDED':'GENERATED';
   const calc={dgc:true,sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:s.snapshotHash??baseSnapshot.snapshotHash,source:s,sourceStatus:e.sourceStatus,capturedRevenueJson:canonical(e.capturedRevenue),rowType:e.aggregationMapping.rowType,includeInMonthlyTotal:e.aggregationMapping.includeInMonthlyTotal,parentServiceId:e.bindings.Parent_Service_ID?master(e.bindings.Parent_Service_ID):null,invoiceRevenueUsd:money(v.Invoice_Revenue_USD),invoiceWhtUsd:money(v.Invoice_WHT_USD),invoicePayableUsd:money(v.Invoice_Payable_USD),sourceActorJson:canonical({createdBy:v.Created_By,createdAt:v.Created_At,approvedBy:v.Approved_By,approvedAt:v.Approved_At,timezone:snapshot.source.timezone}),localApprovalCreated:false,warningCodes:[...g.reasons,...e.rehearsalReasons]};
   const common={reconciliationId:ref('recon:'+g.groupKey),serviceId:master(e.bindings.Service_ID),businessScopeKey:[e.bindings.Partner_ID.legacyId,e.bindings.Service_ID.legacyId,g.period].join('|'),...p,isCurrent:current,calculationJson:calc};
   add('reconciliationItem','item:'+s.sourceRow,{...common,lineNo:index+1,grossRevenue:m.Gross_Revenue,partnerShareAmount:m.Partner_Share,companyShareAmount:m.Company_Share,taxAmount:m.Tax_Amount,netRevenue:m.Company_Share,sourceRowReference:canonical(s)});
   const duplicate=rows('40_MONTHLY_REVENUE').filter(r=>r.legacyId===s.legacyId).length>1;
   add('revenue','revenue:'+s.sourceRow,{...common,revenueCode:duplicate?'DGC-SRC-'+s.sheetId+'-'+s.sourceRow+'-'+s.rowHash.slice(0,12):s.legacyId,logicalGroupId:ref('revenue-group:'+s.sourceRow),revisionNo:1,reconciliationItemId:ref('item:'+s.sourceRow),partnerId:master(e.bindings.Partner_ID),contractId:master(e.bindings.Contract_ID),periodType:'MONTHLY',currency:g.currency,grossAmount:m.Gross_Revenue,partnerShareAmount:m.Partner_Share,companyShareAmount:m.Company_Share,taxAmount:m.Tax_Amount,whtAmount:'0',netAmount:m.Company_Share,status},s);
  }
 }
 const documents=[],archiveDocuments=new Map(),referenceLinks=[];
 function historicalDocument(key,pdf,type,entityType,s,status='ACTIVE'){
  const attachment=key+':attachment';documents.push({key:attachment,fileId:pdf.fileId,sha256:pdf.sha256,size:pdf.size,folder:'dgc-history'});
  add('attachment',attachment,{originalFilename:pdf.filename??pdf.title??pdf.fileId+'.pdf',storedFilename:{$filename:attachment},storageProvider:'local',storagePath:{$file:attachment},mimeType:'application/pdf',fileSize:{$bigint:String(pdf.size)},checksumSha256:pdf.sha256,uploadedById:null});
  return add('document',key,{documentCode:'DGC-SOURCE-'+key,documentType:type,entityType,entityId:ref(key+':entity'),documentNumber:s.legacyId,attachmentId:ref(attachment),status,createdById:{$operator:true}},s);
 }
 for(const h of active){
  const s=source('48_INVOICE_HEADER',h),v=h.values,pdf=invoiceManifest.files.find(f=>f.sourceRow===h.sourceRow&&f.rowHash===h.rowHash);if(!pdf)throw Error('Original Invoice file metadata missing');
  const key='invoice:'+h.sourceRow,docKey='invoice-document:'+h.sourceRow,attachment='invoice-attachment:'+h.sourceRow,period=capturedMonth(h,'Revenue_Month'),status=({Draft:'DRAFT',Paid:'PAID',Issued:'ISSUED',Overdue:'OVERDUE','Partially Paid':'PARTIALLY_PAID'})[v.Status];if(!status)throw Error('Unknown source Invoice status');
  documents.push({key:attachment,fileId:pdf.fileId,sha256:pdf.sha256,size:pdf.size,folder:'invoices'});
  add('attachment',attachment,{originalFilename:pdf.filename??v.Invoice_Number+'.pdf',storedFilename:{$filename:attachment},storageProvider:'local',storagePath:{$file:attachment},mimeType:'application/pdf',fileSize:{$bigint:String(pdf.size)},checksumSha256:pdf.sha256,uploadedById:null});
  add('document',docKey,{documentCode:'DGC-SOURCE-INV-'+h.sourceRow,documentType:'INVOICE',entityType:'Invoice',entityId:ref(key),documentNumber:v.Invoice_Number,documentDate:date(sourceDate(h,'Invoice_Date')),attachmentId:ref(attachment),createdById:{$operator:true}});
  const roots=scopeRoots.get(h.sourceRow),sourceRevenueIds=[...roots.keys()].map(n=>ref('revenue:'+n));
  add('invoice',key,{invoiceNumber:v.Invoice_Number,businessKey:v.Business_Key,revisionNo:v.Revision_No,isCurrent:v.Is_Current===true,status,partnerId:binding(s,'Partner_ID'),period,invoiceMode:String(v.Invoice_Mode).toLowerCase()==='service'?'PER_SERVICE':'CONSOLIDATED',serviceId:roots.size===1?master([...roots.values()][0].e.bindings.Service_ID):null,invoiceDate:date(sourceDate(h,'Invoice_Date')),dueDate:date(sourceDate(h,'Payment_Due_Date')),currency:v.Currency,revenueAmount:money(v.Total_Revenue_USD),whtAmount:money(v.Total_WHT_USD),payableAmount:money(v.Total_Payable_USD),paidAmount:money(v.Paid_Amount_USD),issuedAt:v.Issued_At==null?null:date(sourceDate(h,'Issued_At')),issuedById:null,documentId:ref(docKey),createdById:{$operator:true},snapshot:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:s.snapshotHash??baseSnapshot.snapshotHash,source:s,sourceStatus:v.Status,documentWarnings:documentWarnings[h.sourceRow]??[],capturedHeaderJson:canonical(h),capturedDetailsJson:canonical(invoiceDetails(h)),sourceRevenueIds,lines:lineRows.get(h.sourceRow),totals:{revenue:new D(v.Total_Revenue_USD).toFixed(2),wht:new D(v.Total_WHT_USD).toFixed(2),payable:new D(v.Total_Payable_USD).toFixed(2)},invoiceDate:sourceDate(h,'Invoice_Date'),dueDate:sourceDate(h,'Payment_Due_Date'),historicalCashPosting:false,localApprovalCreated:false,issuedAtProjection:'CAPTURED_CALENDAR_DATE_RAW_SERIAL_AND_TIMEZONE_RETAINED',sourceActorJson:canonical({issuedBy:v.Issued_By,issuedAt:v.Issued_At,approvedBy:v.Approved_By,approvedAt:v.Approved_At,timezone:snapshot.source.timezone}),warningPolicy:'PRESERVE_CAPTURED_VALUES_WITH_SOURCE_DISCREPANCIES'}},s);
  const scopes=new Map();for(const {e,g} of roots.values()){const sk=g.contractSource.sourceRow+'|'+g.period,scope=scopes.get(sk)??{g,items:[]};scope.items.push(e);scopes.set(sk,scope);}
  for(const [sk,{g,items}] of scopes){const scopeKey='scope:'+h.sourceRow+':'+sk;add('invoiceScope',scopeKey,{invoiceId:ref(key),scopeCode:'DGC-SOURCE-'+h.sourceRow+'-'+g.contractSource.sourceRow+'-'+g.period,logicalGroupId:ref('scope-group:'+h.sourceRow+':'+sk),revisionNo:1,isCurrent:v.Is_Current===true,partnerId:master(g.partnerSource),contractId:master(g.contractSource),periodType:'MONTHLY',...dates(g.period),invoiceMode:String(v.Invoice_Mode).toLowerCase()==='service'?'PER_SERVICE':'CONSOLIDATED',scopeKey:v.Business_Key+'|'+sk,currency:v.Currency,totalAmount:items.reduce((n,e)=>n.plus(e.capturedRevenue.values.Invoice_Payable_USD),new D(0)).toFixed(),status:status==='DRAFT'?'INVOICE_READY':'INVOICED'});for(const [n,e] of items.entries())add('invoiceScopeItem',scopeKey+':'+e.source.sourceRow,{scopeId:ref(scopeKey),revenueId:ref('revenue:'+e.source.sourceRow),lineNo:n+1,amount:money(e.capturedRevenue.values.Invoice_Payable_USD),isCurrent:true});}
 }
 for(const h of archives){const s=source('48_INVOICE_HEADER',h),pdf=invoiceManifest.files.find(f=>f.sourceRow===h.sourceRow&&f.rowHash===h.rowHash);if(!pdf)throw Error('Archive file transfer metadata missing');archiveDocuments.set(h.sourceRow,historicalDocument('archive:'+h.sourceRow,pdf,'DGC_INVOICE_HISTORY','DGC_INVOICE_HISTORY',s));}
 if(!referenceManifest||!reconManifest||referenceManifest.snapshotHash!==snapshot.snapshotHash||reconManifest.snapshotHash!==snapshot.snapshotHash)throw Error('Full document transfer manifests required');
 const referenceReview=invoiceReferenceReview(snapshot);
 for(const d of referenceReview.documents){
  const pdf=referenceManifest.files.find(f=>f.sources.some(s=>at(s)===at(d.source)&&s.rowHash===d.source.rowHash));if(!pdf)throw Error('Reference document transfer metadata missing');
  const documentId=historicalDocument('reference:'+d.source.sheetId+':'+d.source.sourceRow,pdf,d.kind,'DGC_SOURCE_REFERENCE',d.source,d.sourceStatus==='Draft'?'DRAFT':'ACTIVE');
  const invoiceIds=[...new Set(d.references.flatMap(r=>r.donorBlockingTargets).filter(s=>active.some(h=>h.sourceRow===s.sourceRow)).map(s=>'invoice:'+s.sourceRow))].map(ref);
  if(invoiceIds.length)referenceLinks.push({documentId,kind:d.kind,invoiceIds});
 }
 for(const pdf of reconManifest.files){for(const s of pdf.sourceHeaders)historicalDocument('recon-pdf:'+s.sourceRow,pdf,'DGC_SOURCE_RECON','DGC_SOURCE_RECON',s);}
 for(const r of rows('50_AR_AP')){
  const h=headers.find(h=>h.legacyId===r.values.Invoice_ID);if(!h||archive.has(h.values.Status))continue;const v=r.values;
  add('accountReceivable','ar:'+r.sourceRow,{invoiceId:ref('invoice:'+h.sourceRow),originalAmount:money(v.Original_Amount),paidAmount:money(v.Paid_Amount),outstandingAmount:money(v.Outstanding_Amount),status:v.Status==='Paid'?'PAID':v.Status==='Partially Paid'?'PARTIALLY_PAID':'OPEN'},source('50_AR_AP',r));
 }
 const receipts=receiptTargetPlan(baseSnapshot,decisions);
 for(const e of receipts.entries){if(!e.data||!e.invoiceSource)throw Error('Receipt storage mapping missing');add('invoicePayment','receipt:'+e.source.sourceRow,{...e.data,invoiceId:ref('invoice:'+e.invoiceSource.sourceRow),requestId:ref('receipt-request:'+e.source.sourceRow),requestDigest:digest({snapshotHash:snapshot.snapshotHash,source:e.source,policy:'CAPTURED_BOOK'}),paymentDate:date(e.data.paymentDate)},e.source);}
 for(const r of rows('56_INPUT_RECONCILIATION')){
  const s=source('56_INPUT_RECONCILIATION',r),v=r.values,revenue=links.get(at(s)+'|Source_Revenue_ID');if(!revenue)throw Error('Input source relation missing');
  if(v.Status!=='Generated'||v.ARAP_ID)throw Error('Input payable needs a captured storage mapping');
  add('inputReconciliation','input:'+r.sourceRow,{inputReconCode:r.legacyId,period:capturedMonth(r,'Period'),sourceRevenueId:ref('revenue:'+revenue.sourceRow),serviceId:binding(s,'Service_ID'),outputPartnerId:binding(s,'Output_Partner_ID'),outputContractId:binding(s,'Output_Contract_ID'),inputPartnerId:binding(s,'Input_Partner_ID'),inputContractId:binding(s,'Input_Contract_ID'),currency:v.Input_Currency,baseUsd:money(v.Base_Amount,2),shareRate:money(v.Input_Share_Rate,6,9),foreignAmount:money(v.Input_Amount_Foreign,2),fxRate:money(v.FX_Rate,8),localAmount:money(v.Input_Amount_Local,2),taxRate:money(v.Tax_Rate,6,9),taxAmount:money(v.Tax_Amount,2),whtAmount:money(v.WHT_Amount,2),payableAmount:money(v.Payable_Amount,2),sourceDigest:r.rowHash,sourceSnapshot:{sourceKind:'DGC_CAPTURED_BOOK_V1',snapshotHash:s.snapshotHash??baseSnapshot.snapshotHash,source:s,capturedRowJson:canonical(r),sourceStatus:v.Status,localApprovalCreated:false},status:'DRAFT',createdById:{$operator:true}},s);
 }
 for(const r of rows('15_FX_RATE')){const v=r.values;if(v.From_Currency==='USD'&&v.To_Currency==='VND'&&v.Status==='Active')add('configuration','reporting-fx:'+r.sourceRow,{configKey:'REVENUE_FX:'+capturedMonth(r,'Period'),configValue:canonical({rate:money(v.Rate,8),source:v.Source,sourceKind:'DGC_CAPTURED_BOOK_V1',capturedRowJson:canonical(r)}),valueType:'JSON',isSecret:false,description:'Captured monthly reporting FX; no cash account or conversion posting'});}
 const sourceRows=Object.entries(snapshot.tables).flatMap(([sheet,t])=>t.rows.map(r=>source(sheet,r)));
 const body={format:'dgc-captured-book-transfer-v1',sourceSnapshotHash:baseSnapshot.snapshotHash,sourceCurrentSnapshotHash:snapshot.snapshotHash,sourceAppendix:appendix,sourceRows,sourceSpreadsheetId:snapshot.source.spreadsheetId,policy:{historicalValidityAudit:false,recalculateHistory:false,historicalCashPosting:false,bankCashSetupRequired:false,sourceValuesPreserved:true},operations,documents,referenceLinks,archives:archives.map(h=>({source:source('48_INVOICE_HEADER',h),headerJson:canonical(h),detailsJson:canonical(invoiceDetails(h)),sourceStatus:h.values.Status,invoiceNumber:h.values.Invoice_Number,documentId:archiveDocuments.get(h.sourceRow),pdf:invoiceManifest.files.find(f=>f.sourceRow===h.sourceRow)})),warnings,missingOriginalRecons:reconManifest.unavailable,counts:{sourceRows:sourceRows.length,revenue:entries.size,invoice:active.length,archive:archives.length,receipt:receipts.entries.length,receivable:operations.filter(o=>o.model==='accountReceivable').length,inputRecon:rows('56_INPUT_RECONCILIATION').length,sourceReferenceDocuments:referenceReview.documents.length}};
 return {...body,bundleHash:digest(body)};
}
