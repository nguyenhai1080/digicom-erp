import {createHash} from 'node:crypto';
import {referenceRegistrationInputs,trialPdf} from './reference-registration.fixtures.mjs';
import {invoiceRoundingInputs} from './invoice-rounding.fixtures.mjs';
import {invoiceRoundingPlan} from './invoice-rounding.mjs';
import {invoiceRestorePlan} from './invoice-restore.mjs';
import {roundingExceptionPlan} from './rounding-exception.mjs';
import {donorRoundingReview} from './donor-rounding.mjs';
import {reconFilePlan} from './recon-files.mjs';
import {digest} from './core.mjs';
export function referenceRoundingInputs(mutate=()=>{},mixed=true){
 const o=referenceRegistrationInputs((c,ch)=>{
  if(mixed){
   for(const n of [3,4]){
    for(const [f,v] of Object.entries({Gross_Revenue:90,Net_Revenue:90,Company_Share:90,Invoice_Revenue_USD:100,Invoice_WHT_USD:10,Invoice_Payable_USD:90}))ch('40_MONTHLY_REVENUE',f,v,n);
    for(const f of ['Gross_Revenue','Net_Revenue','Company_Share'])ch('41_RECONCILIATION',f,90,n);
    for(const [f,v] of Object.entries({Remuneration_Provider_MZN:300,WHT_MZN:30,Partner_Revenue_MZN:270,Remuneration_Provider_USD:100,WHT_USD:10,Partner_Revenue_USD:90}))ch('44_RECON_PDF_DETAIL',f,v,n);
   }
   for(const [f,v] of Object.entries({Total_Revenue_USD:100,Total_WHT_USD:10,Total_Payable_USD:90,Outstanding_Amount_USD:90}))ch('48_INVOICE_HEADER',f,v,2);
   for(const [f,v] of Object.entries({Revenue_USD:100,WHT_USD:10,Payable_USD:90}))ch('49_INVOICE_DETAIL',f,v,2);
   for(const f of ['Original_Amount','Outstanding_Amount'])ch('50_AR_AP',f,90,2);
  }
  mutate(c,ch);
 },(_status,change)=>{const {invoiceOptions:i}=invoiceRoundingInputs(change);return [i.snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin];});
 const i=o.invoiceOptions,snapshot=i.snapshot,fp=reconFilePlan(snapshot),m={format:'dgc-source-recon-files-v1',snapshotHash:snapshot.snapshotHash,filePlanHash:fp.planHash,complete:true,postingAllowed:false,acceptance:false,files:fp.files.map(f=>({...f,sourceHeaders:f.sourceHeaders,relativePath:f.fileId+'.pdf',mimeType:'application/pdf',size:trialPdf.length,sha256:createHash('sha256').update(trialPdf).digest('hex')}))},reconManifest={...m,manifestHash:digest(m)};
 const {reviewHash,...b}=i.combined;b.manifestHash=reconManifest.manifestHash;for(const g of b.groups)if(g.businessState==='REHEARSABLE'){g.state='EVIDENCE_CLEAR_FOR_NEXT_REVIEW';g.reasons=[];}
 i.combined={...b,reviewHash:digest(b)};i.reviewPin=i.combined.reviewHash;i.restorePlan=invoiceRestorePlan(snapshot,i.targetPlan,i.combined,i.reviewPin,i.manifest,i.manifestPin);
 const rounding=donorRoundingReview(snapshot),result={...o,rounding,roundingPin:rounding.reviewHash,exceptionPlan:roundingExceptionPlan(snapshot,i.targetPlan,i.combined,i.reviewPin,rounding,rounding.reviewHash),reconManifest,reconManifestPin:reconManifest.manifestHash};result.invoiceExceptionPlan=invoiceRoundingPlan(result);return result;
}
