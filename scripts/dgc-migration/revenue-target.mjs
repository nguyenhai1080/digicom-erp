import {canonical,digest,text} from './core.mjs';
import {revenueReview} from './revenue-review.mjs';
import {referenceGraph} from './graph.mjs';
import {createRequire} from 'node:module';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:240}),D=v=>new Decimal(v),key=r=>r.sheet+'|'+r.sourceRow;
const address=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
export function revenueTargetPlan(snapshot,decisions){
 const review=revenueReview(snapshot,decisions),graph=referenceGraph(snapshot,decisions),groups=new Map(),rows=new Map();
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const r of t.rows)rows.set(key({sheet,...r}),{...r,source:address(sheet,t,r)});
 const backLinks=graph.links.filter(l=>l.source.sheet==='41_RECONCILIATION'&&l.field==='Revenue_ID');
 const sources=snapshot.tables['41_RECONCILIATION'];
 for(const e of review.entries){
  const b=e.bindings,scope=[b.Source_Recon_Doc_ID,b.Partner_ID,b.Contract_ID].map(x=>x?key(x):null),groupKey=digest({scope,period:e.period,currency:e.currency,...(scope.includes(null)||!e.period?{unresolvedRoot:e.source}:{})});
  const g=groups.get(groupKey)??{groupKey,period:e.period,currency:e.currency,documentSource:b.Source_Recon_Doc_ID,partnerSource:b.Partner_ID,contractSource:b.Contract_ID,entries:[],reasons:[]};
  const legacyRows=sources.rows.filter(r=>text(r.values.Revenue_ID)===e.source.legacyId).map(r=>({...r,source:address('41_RECONCILIATION',sources,r)}));
  const resolved=backLinks.filter(l=>l.target&&key(l.target)===key(e.source));
  const reasons=[];let legacyReconBases=[];
  if(e.reviewState!=='STRUCTURALLY_PREPARED')reasons.push('REVENUE_REQUIRES_REVIEW');
  if(e.sourceKind!=='CAPTURED_PDF_REVENUE')reasons.push('PDF_SOURCE_REQUIRED');
  if(e.currency!=='USD')reasons.push('REHEARSAL_USD_ONLY_NO_FX_CONVERSION');
  if(!['Approved','Draft','Submitted'].includes(e.sourceStatus))reasons.push('UNMAPPED_SOURCE_LIFECYCLE');
  if(legacyRows.length!==1||resolved.length!==1||key(resolved[0]?.source??{})!==key(legacyRows[0]?.source??{}))reasons.push('LEGACY_RECON_CARDINALITY_OR_REFERENCE');
  else {
   const v=legacyRows[0].values;
   if(v.Status!==e.sourceStatus)reasons.push('LEGACY_RECON_STATUS_DIFFERS');
   const equal=(a,b)=>{const s=text(a),t=text(b);return [s,t].every(x=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x)&&x.replace(/\D/g,'').length<=80)&&D(s).eq(t);};
   const detail=e.bindings.Source_Recon_Detail_ID?rows.get(key(e.bindings.Source_Recon_Detail_ID)):null;
   // Donor 20_Recon_Core imports three MZN reference columns alongside a USD
   // Company_Share. These are evidence, never operational MZN or an FX formula.
   if(detail&&[['Gross_Revenue','Total_Service_Revenue_MZN'],['Net_Revenue','Service_Revenue_For_Sharing_MZN'],['Partner_Share','Partner_Revenue_MZN'],['Company_Share','Partner_Revenue_USD']].every(([a,b])=>equal(v[a],detail.values[b])))legacyReconBases.push('PDF_MZN_REFERENCE_AND_USD_RECEIVABLE');
   if(['Gross_Revenue','Net_Revenue','Partner_Share','Company_Share'].every(f=>equal(v[f],e.capturedManagement[f])))legacyReconBases.push('REVENUE_MANAGEMENT_COPY');
   if(!legacyReconBases.length)reasons.push('LEGACY_RECON_BASIS_REQUIRES_REVIEW');
   if(!equal(v.Company_Share,e.capturedManagement.Company_Share))reasons.push('LEGACY_RECON_USD_RECEIVABLE_DIFFERS');
  }
  g.entries.push({...e,legacyReconciliations:legacyRows,legacyReconBases,rehearsalReasons:reasons});groups.set(groupKey,g);
 }
 const result=[];
 for(const g of groups.values()){
  const statuses=[...new Set(g.entries.map(e=>e.sourceStatus))];
  if(statuses.length!==1)g.reasons.push('MIXED_REVENUE_STATUSES_IN_GROUP');
  const totals=g.entries.filter(e=>e.aggregationMapping.rowType==='TOTAL'&&e.aggregationMapping.includeInMonthlyTotal===true);
  if(!totals.length)g.reasons.push('GROUP_WITHOUT_TOTAL_Y');
  for(const e of g.entries.filter(e=>e.aggregationMapping.rowType==='CHILD')){
   if(totals.filter(t=>t.bindings.Service_ID&&e.bindings.Parent_Service_ID&&key(t.bindings.Service_ID)===key(e.bindings.Parent_Service_ID)).length!==1)g.reasons.push('CHILD_PARENT_TOTAL_NOT_UNIQUE_IN_GROUP');
  }
  if(new Set(totals.map(e=>key(e.bindings.Service_ID??{}))).size!==totals.length)g.reasons.push('DUPLICATE_TOTAL_SERVICE_IN_GROUP');
  const doc=g.documentSource?rows.get(key(g.documentSource)):null;
  const fileUrl=text(doc?.values.Source_File_URL||doc?.cells.Source_File_URL?.hyperlink),fileId=fileUrl.match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/)?.[1]??(/^[A-Za-z0-9_-]{20,}$/.test(fileUrl)?fileUrl:null);
  if(!fileId)g.reasons.push('MISSING_ORIGINAL_RECON_FILE_REFERENCE');
  if(doc&&statuses[0]==='Approved'&&!['Approved','Revenue_Imported','Revenue_Recon_Imported'].includes(doc.values.Status))g.reasons.push('SOURCE_DOCUMENT_STATUS_REQUIRES_REVIEW');
  const sum=f=>totals.some(e=>e.capturedManagement[f]===null)?null:totals.reduce((n,e)=>n.plus(e.capturedManagement[f]),D(0)).toFixed();
  const managementHeader={totalGrossRevenue:sum('Gross_Revenue'),totalPartnerShare:sum('Partner_Share'),totalCompanyShare:sum('Company_Share'),totalNetRevenue:sum('Company_Share')};
  if(Object.values(managementHeader).some(v=>v!==null&&(D(v).abs().gte('10000000000000000')||D(v).decimalPlaces()>4)))g.reasons.push('HEADER_TOTAL_EXCEEDS_DECIMAL_20_4');
  const reasons=[...new Set([...g.reasons,...g.entries.flatMap(e=>e.rehearsalReasons)])];
  result.push({...g,reasons,sourceStatuses:statuses,documentEvidence:doc,sourceFileId:fileId,state:reasons.length?'HELD':'REHEARSABLE',readyToImport:false,
   targetMode:'BLOCKED_ROLLBACK_ONLY',filesVerified:false,managementHeader,
   targetMapping:{revenue:{grossAmount:'Gross_Revenue',partnerShareAmount:'Partner_Share',companyShareAmount:'Company_Share',taxAmount:'Tax_Amount',netAmount:'Company_Share'},invoiceBasis:'CAPTURED_USD_IN_CALCULATION_JSON',status:'BLOCKED',approver:'NONE_NO_LOCAL_USER_OR_APPROVAL_CREATED'},
   remainingGates:['ORIGINAL_RECON_BYTES_AND_CUSTODY','TARGET_LIFECYCLE_AND_REVISION_MAPPING','INVOICE_PAYMENT_AR_CHAIN','HISTORICAL_ACTOR_AND_DATE_MAPPING','FINAL_ACCEPTANCE']});
 }
 const body={format:'dgc-revenue-target-rehearsal-v1',snapshotHash:snapshot.snapshotHash,revenueReviewHash:review.planHash,referencePlanHash:graph.planHash,mode:'ROLLBACK_ONLY',postingAllowed:false,acceptance:false,filesVerified:false,groups:result,
  counts:result.reduce((a,g)=>(a[g.state]=(a[g.state]??0)+1,a),{}),rowCounts:result.reduce((a,g)=>(a[g.state]=(a[g.state]??0)+g.entries.length,a),{}),reasonCounts:result.flatMap(g=>g.reasons).reduce((a,c)=>(a[c]=(a[c]??0)+1,a),{})};
 return {...body,planHash:digest(body)};
}
export function verifyRevenueTargetPlan(plan,snapshot,decisions){const {planHash,...body}=plan??{};if(plan?.format!=='dgc-revenue-target-rehearsal-v1'||planHash!==digest(body))throw Error('Revenue target plan checksum mismatch');if(canonical(plan)!==canonical(revenueTargetPlan(snapshot,decisions)))throw Error('Revenue target plan differs from verified snapshot and decisions');return plan;}
