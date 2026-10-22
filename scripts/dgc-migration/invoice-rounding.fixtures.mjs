import {createHash} from 'node:crypto';
import {roundingExceptionInputs,roundingPdf} from './rounding-exception.fixtures.mjs';
import {roundingExceptionPlan} from './rounding-exception.mjs';
import {invoiceRestorePlan} from './invoice-restore.mjs';
import {digest} from './core.mjs';
export function invoiceRoundingInputs(mutate=()=>{},paid=false){
 const o=roundingExceptionInputs((c,change)=>{
  for(const [f,v] of Object.entries({Total_Revenue_USD:33.33,Total_WHT_USD:3.67,Total_Payable_USD:29.67,Paid_Amount_USD:paid?29.67:0,Outstanding_Amount_USD:paid?0:29.67,Status:paid?'Paid':'Issued'}))change('48_INVOICE_HEADER',f,v);
  for(const [f,v] of Object.entries({Revenue_USD:33.33,WHT_USD:3.67,Payable_USD:29.67}))change('49_INVOICE_DETAIL',f,v);
  for(const [f,v] of Object.entries({Original_Amount:29.67,Paid_Amount:paid?29.67:0,Outstanding_Amount:paid?0:29.67,Status:paid?'Paid':'Open'}))change('50_AR_AP',f,v);
  // Paid amounts remain evidence-only. Inject a source receipt without posting cash.
  if(paid){const s=c.find(e=>e.data.sheets[0].properties.title==='52_INVOICE_PAYMENT').data.sheets[0];const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v},effectiveValue:typeof v==='number'?{numberValue:v}:{stringValue:v},formattedValue:String(v)});s.data[0].rowData.push({values:['PAY','INV','SYNTH_PARTNER',29.67,741750,25000,'2026-02-10'].map(cell)});s.properties.gridProperties.rowCount=2;const e=c.find(e=>e.data.sheets[0].properties.title==='52_INVOICE_PAYMENT');e.requestedRange="'52_INVOICE_PAYMENT'!A1:G2";}
  mutate(c,change);
 });
 const m={format:'dgc-source-invoice-files-v1',snapshotHash:o.snapshot.snapshotHash,acceptance:false,files:o.snapshot.tables['48_INVOICE_HEADER'].rows.map(h=>({sourceRow:h.sourceRow,legacyId:h.legacyId,rowHash:h.rowHash,fileId:h.values.Pdf_File_ID,relativePath:h.values.Pdf_File_ID+'.pdf',mimeType:'application/pdf',size:roundingPdf.length,sha256:createHash('sha256').update(roundingPdf).digest('hex')}))},manifest={...m,manifestHash:digest(m)};
 const invoiceOptions={snapshot:o.snapshot,targetPlan:o.targetPlan,combined:o.combined,reviewPin:o.combinedPin,manifest,manifestPin:manifest.manifestHash};
 invoiceOptions.restorePlan=invoiceRestorePlan(o.snapshot,o.targetPlan,o.combined,o.combinedPin,manifest,manifest.manifestHash);
 return {invoiceOptions,rounding:o.rounding,roundingPin:o.roundingPin,exceptionPlan:roundingExceptionPlan(o.snapshot,o.targetPlan,o.combined,o.combinedPin,o.rounding,o.roundingPin),reconManifest:o.manifest,reconManifestPin:o.manifestPin};
}
