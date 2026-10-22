import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {cell} from './fixtures.mjs';
import {digest} from './core.mjs';
import {donorRoundingReview} from './donor-rounding.mjs';
import {reconLifecycleReview} from './recon-lifecycle.mjs';
import {reconFilePlan} from './recon-files.mjs';
import {createHash} from 'node:crypto';
export const roundingPdf=Buffer.from('%PDF-test');
export function roundingExceptionInputs(mutate=()=>{}){
 const [snapshot,targetPlan]=invoiceRestoreInputs('Issued',(c,change)=>{
  function append(sheet,values){const e=c.find(e=>e.data.sheets[0].properties.title===sheet),s=e.data.sheets[0],rows=s.data[0].rowData,hs=Object.keys(values);rows[0].values.push(...hs.map(cell));for(const row of rows.slice(1))row.values.push(...hs.map(h=>cell(values[h])));s.properties.gridProperties.columnCount+=hs.length;let x=s.properties.gridProperties.columnCount,col='';while(x){col=String.fromCharCode(65+(x-1)%26)+col;x=Math.floor((x-1)/26);}e.requestedRange=`'${sheet}'!A1:${col}${rows.length}`;}
  append('43_RECON_PDF_HEADER',{Exchange_Rate:3});append('44_RECON_PDF_DETAIL',{Remuneration_Provider_MZN:100,WHT_MZN:11,Partner_Revenue_MZN:89});
  append('40_MONTHLY_REVENUE',{Approved_By:'source-approver@example.invalid',Approved_At:46245.657010740746});
  for(const row of [1,2]){
   for(const [f,v] of Object.entries({Gross_Revenue:29.67,Net_Revenue:29.67,Company_Share:29.67,Invoice_Revenue_USD:33.33,Invoice_WHT_USD:3.67,Invoice_Payable_USD:29.67}))change('40_MONTHLY_REVENUE',f,v,row);
   for(const [f,v] of Object.entries({Gross_Revenue:29.67,Net_Revenue:29.67,Company_Share:29.67}))change('41_RECONCILIATION',f,v,row);
   for(const [f,v] of Object.entries({Remuneration_Provider_USD:33.33,WHT_USD:3.67,Partner_Revenue_USD:29.67}))change('44_RECON_PDF_DETAIL',f,v,row);
  }
  mutate(c,change);
 });
 const b={format:'dgc-recon-combined-evidence-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,postingAllowed:false,readyToImport:false,acceptance:false,groups:targetPlan.groups.map(g=>({groupKey:g.groupKey,businessState:g.state,documentSource:g.documentSource,state:'EVIDENCE_REVIEW_HELD',reasons:['BUSINESS_HELD'],rows:g.entries.map(e=>({source:e.source})),readyToImport:false})),lifecycle:reconLifecycleReview(snapshot)};
 const filePlan=reconFilePlan(snapshot),m={format:'dgc-source-recon-files-v1',snapshotHash:snapshot.snapshotHash,filePlanHash:filePlan.planHash,complete:true,postingAllowed:false,acceptance:false,files:filePlan.files.map(f=>({...f,sourceHeaders:f.sourceHeaders,relativePath:f.fileId+'.pdf',mimeType:'application/pdf',size:roundingPdf.length,sha256:createHash('sha256').update(roundingPdf).digest('hex')}))};
 const manifest={...m,manifestHash:digest(m)},cb={...b,manifestHash:manifest.manifestHash},combined={...cb,reviewHash:digest(cb)},rounding=donorRoundingReview(snapshot);
 return {snapshot,targetPlan,combined,combinedPin:combined.reviewHash,rounding,roundingPin:rounding.reviewHash,manifest,manifestPin:manifest.manifestHash};
}
