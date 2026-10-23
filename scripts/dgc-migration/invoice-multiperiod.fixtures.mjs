import {invoiceRestoreInputs} from './invoice-restore.fixtures.mjs';
import {cell} from './fixtures.mjs';
import {changeRevenueCapture} from './revenue-fixtures.mjs';
import {digest} from './core.mjs';
import {createHash} from 'node:crypto';
export const multiPeriodPdf=Buffer.from('%PDF-test'),multiPeriodRender=Buffer.from('synthetic visual render only');
export function multiPeriodInputs(mutate=()=>{}){
 const inputs=invoiceRestoreInputs('Issued',(capture,change)=>{
  const sheet=name=>capture.find(e=>e.data.sheets[0].properties.title===name).data.sheets[0];
  const put=(name,rows)=>{const e=capture.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];s.data[0].rowData=rows;s.properties.gridProperties.rowCount=rows.length;let col='',n=s.data[0].rowData[0].values.length;while(n){col=String.fromCharCode(65+(n-1)%26)+col;n=Math.floor((n-1)/26);}s.properties.gridProperties.columnCount=rows[0].values.length;e.requestedRange=`'${name}'!A1:${col}${rows.length}`;};
  for(const name of ['40_MONTHLY_REVENUE','41_RECONCILIATION','42_RECON_PDF_UPLOAD','43_RECON_PDF_HEADER','44_RECON_PDF_DETAIL']){
   const original=structuredClone(sheet(name).data[0].rowData),rows=[original[0]];for(let p=1;p<=3;p++)for(const row of original.slice(1)){
    const copy=structuredClone(row),headers=original[0].values.map(c=>c.effectiveValue.stringValue);copy.values=copy.values.map((c,j)=>{let v=c.effectiveValue?.stringValue??c.effectiveValue?.numberValue??c.effectiveValue?.boolValue??'';const field=headers[j];if(['Revenue_ID','Recon_ID','Upload_ID','Recon_Doc_ID','Recon_Detail_ID','Source_Recon_Doc_ID','Source_Recon_Detail_ID'].includes(field)&&v)v+='_'+p;if(['Revenue_Month','Recon_Month','Period_Month'].includes(field))v='2026-0'+p;if(field==='File_ID')v=String.fromCharCode(64+p).repeat(25);if(field==='Source_File_URL')v='https://drive.google.com/file/d/'+String.fromCharCode(64+p).repeat(25)+'/view';return cell(v);});rows.push(copy);
   }put(name,rows);
  }
  const detail=structuredClone(sheet('49_INVOICE_DETAIL').data[0].rowData);put('49_INVOICE_DETAIL',[detail[0],...Array.from({length:3},()=>structuredClone(detail[1]))]);
  for(let p=1;p<=3;p++)for(const [f,v] of Object.entries({Invoice_Detail_ID:'LINE_'+p,Revenue_ID:'REV_CHILD_'+p,Source_Recon_Doc_ID:'DOC_'+p,Source_Recon_Detail_ID:'DETAIL_CHILD_'+p,Line_No:p}))changeRevenueCapture(capture,'49_INVOICE_DETAIL',p,f,v);
  const h=sheet('48_INVOICE_HEADER').data[0].rowData;h[0].values.push(cell('Billing_Period_Start'),cell('Billing_Period_End'));h[1].values.push(cell('2026-01-01'),cell('2026-03-31'));put('48_INVOICE_HEADER',h);
  for(const [f,v] of Object.entries({Revenue_Month:'2026-03',Invoice_Date:'2026-04-01',Payment_Due_Date:'2026-05-16',Total_Revenue_USD:300,Total_WHT_USD:30,Total_Payable_USD:270,Outstanding_Amount_USD:270}))change('48_INVOICE_HEADER',f,v);
  for(const [f,v] of Object.entries({Original_Amount:270,Outstanding_Amount:270}))change('50_AR_AP',f,v);
  mutate(capture,change);
 });
 const [snapshot,targetPlan,combined,reviewPin,manifest]=inputs,h=snapshot.tables['48_INVOICE_HEADER'].rows[0];
 manifest.files=snapshot.tables['48_INVOICE_HEADER'].rows.map(row=>({...manifest.files[0],sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash,fileId:row.values.Pdf_File_ID,relativePath:row.values.Pdf_File_ID+'.pdf',sha256:createHash('sha256').update(multiPeriodPdf).digest('hex')})); const {manifestHash,...manifestBody}=manifest; manifest.manifestHash=digest(manifestBody);
 const source={sheet:'48_INVOICE_HEADER',sheetId:snapshot.tables['48_INVOICE_HEADER'].sheetId,sourceRow:h.sourceRow,legacyId:h.legacyId,rowHash:h.rowHash};
 const invoice={source,pdfSha256:manifest.files[0].sha256,fileId:h.values.Pdf_File_ID,visualRender:{relativePath:'invoice.png',size:multiPeriodRender.length,sha256:createHash('sha256').update(multiPeriodRender).digest('hex')},method:'CODEX_VISUAL_REVIEW',invoiceNumber:h.values.Invoice_Number,invoiceDate:'2026-04-01',billingStart:'2026-01-01',billingEnd:'2026-03-31',serviceText:'Synthetic child',components:{revenue:'300',wht:'30',payable:'270'},sourceValuesChanged:false,acceptance:false};
 const body={format:'dgc-scan-and-multiperiod-visual-observations-v1',snapshotHash:snapshot.snapshotHash,multiPeriodInvoice:invoice,operationalAcceptance:false},observations={...body,observationHash:digest(body)};
 return {invoiceOptions:{snapshot,targetPlan,combined,reviewPin,manifest,manifestPin:manifest.manifestHash},observations,observationPin:observations.observationHash};
}
