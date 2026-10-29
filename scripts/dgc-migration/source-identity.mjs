import {verifySnapshot,canonical,digest} from './core.mjs';
import {capturedMonth} from './recon-semantics.mjs';

const address=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const text=v=>typeof v==='string'?v.trim():'';
export function sameLegacyRevenueScope(revenue,legacy){
 const month=capturedMonth(revenue,'Revenue_Month'),other=capturedMonth(legacy,'Recon_Month');
 return !!month&&month===other&&['Revenue_ID','Partner_ID','Contract_ID','Service_ID'].every(f=>text(revenue.values[f])!==''&&text(revenue.values[f])===text(legacy.values[f]));
}
const groups=(rows,field)=>{const map=new Map();for(const r of rows){const k=text(r.values[field]);if(k)map.set(k,[...(map.get(k)??[]),r]);}return [...map].filter(([,rows])=>rows.length>1);};
// Physical identity proposal only. Duplicate labels do not authorize merging
// records, manufacturing a missing legacy relation, or clearing financial holds.
export function sourcePhysicalIdentityPlan(snapshot){
 verifySnapshot(snapshot);const revenue=snapshot.tables['40_MONTHLY_REVENUE'],legacy=snapshot.tables['41_RECONCILIATION'],invoice=snapshot.tables['48_INVOICE_HEADER'],usedCodes=new Set(revenue.rows.map(r=>r.legacyId));
 const revenueCollisions=groups(revenue.rows,'Revenue_ID').map(([legacyId,rows])=>({legacyId,entries:rows.map(row=>{
  const source=address('40_MONTHLY_REVENUE',revenue,row),candidates=legacy.rows.filter(r=>r.values.Revenue_ID===row.values.Revenue_ID),matches=candidates.filter(r=>sameLegacyRevenueScope(row,r)),code='DGC-SRC-'+revenue.sheetId+'-'+row.sourceRow+'-'+digest(source).slice(0,12),codeConflict=usedCodes.has(code);usedCodes.add(code);
  return {source,displayLegacyId:row.legacyId,proposedLocalCode:code,localCodeConflict:codeConflict,matchingLegacyRows:matches.map(r=>address('41_RECONCILIATION',legacy,r)),otherSameIdLegacyRows:candidates.filter(r=>!matches.includes(r)).map(r=>address('41_RECONCILIATION',legacy,r)),legacyRelationState:matches.length===1?'EXACT_BUSINESS_SCOPE_MATCH':matches.length===0?'NO_MATCHING_LEGACY_ROW_PRESERVED':'AMBIGUOUS_MATCHING_LEGACY_ROWS_HELD',sourceIdChanged:false,legacyRelationInvented:false,financialAdmissionAllowed:false};
 })}));
 const invoiceNumberCollisions=groups(invoice.rows,'Invoice_Number').map(([invoiceNumber,rows])=>{
  const current=rows.filter(r=>r.values.Is_Current===true||String(r.values.Is_Current).toUpperCase()==='TRUE'),archive=rows.filter(r=>!current.includes(r)&&['CANCELLED','SUPERSEDED'].includes(String(r.values.Status).toUpperCase()));
  return {invoiceNumber,sourceRows:rows.map(r=>address('48_INVOICE_HEADER',invoice,r)),currentRows:current.map(r=>address('48_INVOICE_HEADER',invoice,r)),archiveRows:archive.map(r=>address('48_INVOICE_HEADER',invoice,r)),state:current.length===1&&archive.length===rows.length-1?'ONE_CURRENT_WITH_SEPARATE_ARCHIVE_EVIDENCE':'UNRESOLVED_CURRENT_NUMBER_COLLISION',archiveDisposition:'PRESERVE_ORIGINAL_ARCHIVE_RECORD_AND_DOCUMENT',successorRelationshipInferred:false,legalInvoiceNumberChanged:false,financialAdmissionAllowed:false};
 });
 const body={format:'dgc-source-physical-identity-plan-v1',snapshotHash:snapshot.snapshotHash,revenueCollisions,invoiceNumberCollisions,counts:{collidingRevenueIds:revenueCollisions.length,revenueRows:revenueCollisions.reduce((n,g)=>n+g.entries.length,0),collidingInvoiceNumbers:invoiceNumberCollisions.length},sourceValuesChanged:false,moneyChanged:false,otherHoldsUnchanged:true,readyToImport:false,commitAllowed:false,acceptance:false};return {...body,planHash:digest(body)};
}
