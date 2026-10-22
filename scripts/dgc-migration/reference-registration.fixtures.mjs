import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {invoiceRestorePlan} from './invoice-restore.mjs';
import {invoiceReferenceReview} from './invoice-references.mjs';
import {referenceFilePlan} from './reference-files.mjs';
import {digest} from './core.mjs';
import {cell} from './fixtures.mjs';
import {createHash} from 'node:crypto';
export const trialPdf=Buffer.from('%PDF-test');
export function referenceRegistrationInputs(mutate=()=>{}){
 const inputs=invoiceRestoreInputs('Issued',(captures,change)=>{
  function set(name,headers,rows){const e=captures.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];s.properties.gridProperties={rowCount:rows.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+headers.length)}${rows.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...rows.map(r=>({values:r.map(cell)}))];}
  // Two independent monthly Invoice chains: a complete document must register
  // both, and failure after its first link must roll back the entire set.
  const replacements={REV_TOTAL:'REV_TOTAL2',REV_CHILD:'REV_CHILD2',REC_TOTAL:'REC_TOTAL2',REC_CHILD:'REC_CHILD2',UPLOAD:'UPLOAD2',DOC:'DOC2',DETAIL_TOTAL:'DETAIL_TOTAL2',DETAIL_CHILD:'DETAIL_CHILD2',INV:'INV2',LINE:'LINE2',AR:'AR2','TEST-INVOICE':'TEST-INVOICE2','SYNTH_PARTNER|2026-01|ALL':'SYNTH_PARTNER|2026-02|ALL','2026-01':'2026-02','2026-02-01':'2026-03-01','2026-03-18':'2026-04-18',['I'.repeat(25)]:'J'.repeat(25),['A'.repeat(25)]:'B'.repeat(25)};
  for(const name of ['40_MONTHLY_REVENUE','41_RECONCILIATION','42_RECON_PDF_UPLOAD','43_RECON_PDF_HEADER','44_RECON_PDF_DETAIL','48_INVOICE_HEADER','49_INVOICE_DETAIL','50_AR_AP']){
   const e=captures.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0],rows=s.data[0].rowData;
   const copied=rows.slice(1).map(r=>({values:r.values.map(c=>{const v=c.effectiveValue.stringValue??c.effectiveValue.numberValue??c.effectiveValue.boolValue;return cell(typeof v==='string'?(replacements[v]??v.replaceAll('A'.repeat(25),'B'.repeat(25))):v);})}));
   rows.push(...copied);s.properties.gridProperties.rowCount=rows.length;e.requestedRange=e.requestedRange.replace(/\d+$/,String(rows.length));
  }
  change('50_AR_AP','ARAP_Type','AR',2);
  set('53_SOA_HEADER',['SOA_ID','Partner_ID','Status','Pdf_File_ID','Created_By','Created_At'],[['SOA','SYNTH_PARTNER','Draft','S'.repeat(25),'source-user@example.invalid',46245.657010740746]]);
  set('54_SOA_DETAIL',['SOA_Detail_ID','SOA_ID','Invoice_ID','Invoice_Number'],[['SD','SOA','INV','TEST-INVOICE'],['SD2','SOA','INV2','TEST-INVOICE2']]);
  set('55_APPROVAL_PACKAGE',['Approval_ID','Partner_ID','Approval_Status','Related_Invoice_IDs','File_ID','Approved_By'],[['PKG','SYNTH_PARTNER','Approved','INV, INV2','P'.repeat(25),'source-approver@example.invalid']]);
  mutate(captures,change);
 });
 const [snapshot,targetPlan,combined,reviewPin,manifest]=inputs;
 manifest.files=snapshot.tables['48_INVOICE_HEADER'].rows.map(h=>({sourceRow:h.sourceRow,legacyId:h.legacyId,rowHash:h.rowHash,fileId:h.values.Pdf_File_ID,relativePath:h.values.Pdf_File_ID+'.pdf',mimeType:'application/pdf',size:trialPdf.length,sha256:createHash('sha256').update(trialPdf).digest('hex')}));const {manifestHash,...b}=manifest;manifest.manifestHash=digest(b);
 const references=invoiceReferenceReview(snapshot),filePlan=referenceFilePlan(snapshot),m={format:'dgc-source-reference-files-v1',snapshotHash:snapshot.snapshotHash,filePlanHash:filePlan.planHash,complete:true,pdfSemanticsVerified:false,postingAllowed:false,acceptance:false,files:filePlan.files.map(f=>({...f,relativePath:f.fileId+'.pdf',mimeType:'application/pdf',size:trialPdf.length,sha256:createHash('sha256').update(trialPdf).digest('hex')}))},referenceManifest={...m,manifestHash:digest(m)};
 return {invoiceOptions:{snapshot,targetPlan,combined,reviewPin,manifest,manifestPin:manifest.manifestHash,restorePlan:invoiceRestorePlan(snapshot,targetPlan,combined,reviewPin,manifest,manifest.manifestHash)},references,referencePin:references.reviewHash,referenceManifest,referenceManifestPin:referenceManifest.manifestHash};
}
