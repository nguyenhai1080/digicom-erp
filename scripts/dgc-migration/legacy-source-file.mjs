import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {canonical,digest,verifySnapshot} from './core.mjs';
import {capturedMonth} from './recon-semantics.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const D=v=>new Prisma.Decimal(String(v)),same=(a,b)=>canonical(a)===canonical(b),sha=b=>createHash('sha256').update(b).digest('hex');
const discoveryPin='f5c06e0f86dbfd084f63af49ee9debf5430df208ead9f8c0e2aa6d02ac8d3af2';
const addr=(snapshot,sheet,r)=>({sheet,sheetId:snapshot.tables[sheet].sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
const ids=v=>[...new Set([...String(v??'').matchAll(/\/d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/g)].map(m=>m[1]))];
async function pinnedFile(root,name,pin){if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Invalid legacy evidence filename');const p=resolve(root,name),s=await lstat(p),actual=await realpath(p),rel=relative(root,actual);if(s.isSymbolicLink()||!s.isFile()||!rel||rel.startsWith('..')||isAbsolute(rel)||s.size!==pin.size||s.size>64*1024*1024)throw Error('Legacy evidence path/size differs');const bytes=await readFile(p);if(bytes.length!==pin.size||sha(bytes)!==pin.sha256)throw Error('Legacy evidence bytes differ');return bytes;}

// Source-file evidence is an explicit alternative to the missing 43/44 graph,
// never a fabricated header/detail or admission through the old strict gate.
export async function reviewLegacySourceFile({snapshot,discovery,root,python=process.env.DGC_PDF_PYTHON??'python'}){
 const {reviewHash,...body}=discovery??{};if(reviewHash!==discoveryPin||digest(body)!==discoveryPin)throw Error('Unrecognized legacy source discovery');verifySnapshot(snapshot);if(snapshot.snapshotHash!==discovery.snapshotHash)throw Error('Legacy source snapshot differs');
 function bound(sheet,observed){const t=snapshot.tables[sheet],r=t.rows.find(r=>r.sourceRow===observed.sourceRow);if(!r||!same({sheet,sheetId:t.sheetId,...r},observed))throw Error('Legacy physical source differs');return r;}
 const revenue=bound('40_MONTHLY_REVENUE',discovery.sourceRevenue),legacy=bound('41_RECONCILIATION',discovery.sourceLegacyRecon),invoice=bound('48_INVOICE_HEADER',discovery.sourceInvoice),v=revenue.values,l=legacy.values;
 if(revenue.sourceRow!==24||revenue.legacyId!=='REV0050'||invoice.sourceRow!==4||invoice.legacyId!=='INV0009'||v.Status!=='Approved'||l.Status!=='Approved'||v.Revenue_Row_Type!=='Total'||v.Include_In_Monthly_Total!=='Y'||v.Currency!=='USD'||v.Revenue_ID!==l.Revenue_ID||['Partner_ID','Contract_ID','Service_ID','Contract_Type'].some(k=>v[k]!==l[k])||l.Recon_Type!=='Receivable'||capturedMonth(revenue,'Revenue_Month')!=='2023-03'||capturedMonth(legacy,'Recon_Month')!=='2023-03')throw Error('Legacy revenue scope/lifecycle differs');
 const missingHeaderId=v.Source_Recon_Doc_ID,missingDetailId=v.Source_Recon_Detail_ID;
 if(missingHeaderId!=='RPD0039'||missingDetailId!=='RDL0089'||snapshot.tables['43_RECON_PDF_HEADER'].rows.some(r=>r.values.Recon_Doc_ID===missingHeaderId)||snapshot.tables['44_RECON_PDF_DETAIL'].rows.some(r=>r.values.Recon_Detail_ID===missingDetailId))throw Error('Legacy missing graph changed');
 const direct=ids(v.Source_File),signed=ids(l.Attachment_URL);if(direct.length!==1||signed.length!==1||!same(discovery.files.map(f=>f.fileId),[direct[0],signed[0]]))throw Error('Legacy direct source file links differ');
 const uploads=snapshot.tables['42_RECON_PDF_UPLOAD'].rows.filter(r=>r.values.Upload_ID==='REC0040');if(!same(uploads,discovery.sourceUploads)||uploads.length!==2||uploads.filter(r=>r.values.File_ID===direct[0]).length!==1)throw Error('Legacy duplicated upload set differs');
 const base=await realpath(root);for(const file of discovery.files){const bytes=await pinnedFile(base,file.fileId+'.pdf',file);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Legacy source is not PDF');}for(const render of discovery.renderPins)await pinnedFile(base,render.name,render);
 const {stdout}=await promisify(execFile)(python,[fileURLToPath(new URL('./extract-recon-text.py',import.meta.url)),base,direct[0]],{timeout:60000,maxBuffer:8*1024*1024,windowsHide:true}),extracted=JSON.parse(stdout),file=extracted.files?.[0];
 if(extracted.tool!=='pypdf'||extracted.mode!=='layout'||extracted.files.length!==1||file.fileId!==direct[0]||file.sha256!==discovery.files[0].sha256||file.error||file.pages.length!==1)throw Error('Legacy fresh PDF extraction differs');
 const text=file.pages[0].replace(/\s+/g,' '),usd=text.match(/In USD\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/),native=text.match(/In MZN\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/),number=s=>D(s.replaceAll(',',''));
 if(!usd||!native||!text.includes('Period: Mar-2023')||!text.includes('Service: MEUBEAT (CRBT)')||!text.includes('Exchange rate: 64.51'))throw Error('Legacy printed service/period/amounts differ');
 const components={revenue:number(usd[4]).toFixed(),wht:number(usd[5]).toFixed(),payable:number(usd[6]).toFixed()};
 if(['Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'].some((k,i)=>!D(v[k]).eq(Object.values(components)[i]))||!D(components.revenue).minus(components.wht).eq(components.payable)||!D(l.Company_Share).eq(components.payable)||!D(l.Recon_Amount).eq(components.payable)||!D(l.Difference_Amount).isZero()||!D(l.Gross_Revenue).eq(number(native[1]))||!D(l.Net_Revenue).eq(number(native[3]))||!D(l.Partner_Share).eq(number(native[6])))throw Error('Legacy captured/printed components differ');
 const result={format:'dgc-legacy-source-file-review-v1',state:'LEGACY_SOURCE_FILE_EVIDENCE_BOUND',snapshotHash:snapshot.snapshotHash,discoveryHash:discoveryPin,source:addr(snapshot,'40_MONTHLY_REVENUE',revenue),legacySource:addr(snapshot,'41_RECONCILIATION',legacy),invoiceSource:addr(snapshot,'48_INVOICE_HEADER',invoice),uploadSources:uploads.map(r=>addr(snapshot,'42_RECON_PDF_UPLOAD',r)),missingGraph:{headerId:missingHeaderId,detailId:missingDetailId,headerPresent:false,detailPresent:false},file:discovery.files[0],signedPackage:discovery.files[1],components,printedNative:{gross:number(native[1]).toFixed(),forSharing:number(native[3]).toFixed(),provider:number(native[4]).toFixed(),wht:number(native[5]).toFixed(),partner:number(native[6]).toFixed()},basis:'PRINTED_NATIVE_LEGACY_FIELDS_AND_CAPTURED_USD_RECEIVABLE',warnings:discovery.warnings,extraction:{tool:extracted.tool,version:extracted.version,mode:extracted.mode,textSha256:sha(Buffer.from(file.pages[0]))},originalGraphReconstructed:false,nativeIdentityAccepted:false,operationalFxDerived:false,sourceValuesChanged:false,otherHoldsUnchanged:true,fullInvoiceAdmission:false,readyToImport:false,commitAllowed:false,acceptance:false,historicalCashPosting:false};return {...result,reviewHash:digest(result)};
}
