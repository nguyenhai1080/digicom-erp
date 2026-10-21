import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
export const archiveDigest=v=>createHash('sha256').update(JSON.stringify(sort(v))).digest('hex');
export async function invoiceHistoryFixture(root){
 await mkdir(root);await mkdir(join(root,'records'));await mkdir(join(root,'pdf'));
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage().drawText('Synthetic historical invoice - original fixture',{x:40,y:700,font,size:16});const pdf=Buffer.from(await doc.save()),pdfHash=createHash('sha256').update(pdf).digest('hex');
 await writeFile(join(root,'pdf',pdfHash+'.pdf'),pdf);
 const entries=[],payloads=[];
 for(let n=0;n<12;n++){
  const source={sheet:'48_INVOICE_HEADER',sheetId:48,sourceRow:n+2,legacyId:'HIST'+n,rowHash:archiveDigest({synthetic:n})},archiveId=archiveDigest({snapshotHash:'1'.repeat(64),source}),number=n<2?'SYN-DUPLICATE':'SYN-HISTORY-'+String(n+1).padStart(2,'0');
  const payload={source,sourceStatus:n===11?'Cancelled':'Superseded',disposition:'PRESERVE_HISTORY_ONLY',restoreRoute:'IMMUTABLE_SOURCE_HISTORY',postingAllowed:false,recomputeAmounts:false,postHistoricalCash:false,integrity:'REVIEW_REQUIRED',capturedHeader:{values:{Invoice_Number:number,Invoice_Date:46032,Currency:'USD',Partner_ID:'SYN_SOURCE',Total_Payable_USD:n===0?'-90.0000':'90.0000',Paid_Amount_USD:'0',Outstanding_Amount_USD:n===0?'-90':'90'},cells:{Invoice_Date:{formattedValue:'2026-01-10'}}},capturedDetails:Array.from({length:n===0?12:1},(_,j)=>({sourceRow:j+2,legacyId:'LINE'+j,values:{Service_ID:'SYN_SERVICE',Description:'Synthetic historical service',Revenue_USD:n===0?'-100':'100',WHT_USD:n===0?'-10':'10',Payable_USD:n===0?'-90':'90'}})),capturedPayments:[{values:{bankAccount:'DO_NOT_EXPOSE_BANK',note:'DO_NOT_EXPOSE_NOTE'}}],issues:[{code:'UNRESOLVED_REVISION_LINK',field:'Superseded_By_Invoice_ID'}],revisionLinks:[{field:'Superseded_By_Invoice_ID',legacyId:'MISSING',target:null}]};
  const payloadPath='records/'+archiveId+'.json';await writeFile(join(root,payloadPath),JSON.stringify(payload));payloads.push(payload);
  entries.push({archiveId,source,invoiceNumber:number,sourceStatus:payload.sourceStatus,payloadPath,payloadHash:archiveDigest(payload),pdf:{fileId:'SYN_PDF',path:'pdf/'+pdfHash+'.pdf',size:pdf.length,sha256:pdfHash}});
 }
 const body={format:'dgc-invoice-source-archive-v1',snapshotHash:'1'.repeat(64),historyPlanHash:'2'.repeat(64),sourceManifestHash:'3'.repeat(64),postingAllowed:false,operationalImportAllowed:false,recomputeAmounts:false,postHistoricalCash:false,acceptance:false,entries},index={...body,archiveHash:archiveDigest(body)};
 await writeFile(join(root,'archive.json'),JSON.stringify(index));await writeFile(join(root,'COMPLETE.json'),JSON.stringify({archiveHash:index.archiveHash,entries:12}));return {root,index,payloads,pdf};
}
