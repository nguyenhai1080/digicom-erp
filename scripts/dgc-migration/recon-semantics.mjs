import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {digest,text,sourceDate} from './core.mjs';
import {verifyReconFiles,reconHeaderFileIds} from './recon-files.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:240}),D=v=>new Decimal(String(v));
const fields=['Total_Service_Revenue_USD','IVA_Tax_USD','Service_Revenue_For_Sharing_USD','Remuneration_Provider_USD','WHT_USD','Partner_Revenue_USD'];
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const money='(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\.[0-9]{2}';
const norm=s=>text(s).toUpperCase().replace(/\s+/g,' ');
const address=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});

// Deliberately bounded: one page, one explicitly labelled six-column USD row.
// No OCR guesses, FX conversion, service aliasing, child allocation or tolerance.
export function parseUsdSummary(pages){
 if(!Array.isArray(pages)||pages.length!==1||typeof pages[0]!=='string')return {state:'UNSUPPORTED_PAGE_COUNT'};
 const raw=pages[0],lines=raw.split(/\r?\n/),usd=lines.filter(l=>/\bIn\s+USD\b/i.test(l));
 if(usd.length!==1)return {state:usd.length?'AMBIGUOUS_USD_SUMMARY':'NO_EXPLICIT_USD_SUMMARY'};
 // Match the entire line rather than cherry-picking six numbers from prose.
 const match=usd[0].match(new RegExp('^\\s*In\\s+USD\\s+'+Array(6).fill('('+money+')').join('\\s+')+'\\s*$','i'));
 if(!match)return {state:'UNSUPPORTED_USD_COLUMNS'};
 const services=lines.map(l=>l.match(/^\s*Service:\s*(.*?)\s*$/i)).filter(Boolean),periods=lines.map(l=>l.match(/^\s*Period:\s*([A-Za-z]{3})-(\d{4})\s*$/i)).filter(Boolean);
 const footers=lines.map(l=>l.match(new RegExp('^\\s*The Total revenue in ([A-Za-z]{3})-(\\d{4}) of DIGICOM is:\\s*('+money+')\\s+USD\\.\\s*$','i'))).filter(Boolean);
 if(services.length!==1||periods.length!==1||footers.length!==1)return {state:'UNRESOLVED_PDF_IDENTITY_OR_FOOTER'};
 const period=m=>{const i=months.findIndex(x=>x.toLowerCase()===m[1].toLowerCase());return i<0?null:m[2]+'-'+String(i+1).padStart(2,'0');};
 const p=period(periods[0]);if(!p||p!==period(footers[0]))return {state:'CONFLICTING_PDF_PERIOD'};
 const values=Object.fromEntries(fields.map((f,i)=>[f,D(match[i+1].replaceAll(',','')).toFixed()]));
 const footer=D(footers[0][3].replaceAll(',','')).toFixed();
 return {state:'EXPLICIT_USD_SUMMARY',service:services[0][1],period:p,values,footer,footerMatches:values.Partner_Revenue_USD===footer,summaryLine:usd[0].trim(),textHash:digest(raw)};
}

export function compareCapturedUsd(values,summary,mapping){
 return mapping.map(([sourceField,pdfField])=>{
  const raw=values[sourceField],valid=['string','number'].includes(typeof raw)&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw));
  const actual=valid?D(raw):null,expected=D(summary.values[pdfField]);
  return {sourceField,pdfField,actual:actual?.toFixed()??null,expected:expected.toFixed(),difference:actual?.minus(expected).toFixed()??null,state:!actual?'UNAVAILABLE':actual.eq(expected)?'MATCH':'MISMATCH'};
 });
}

export function reconSemanticGroups(targetPlan,entries){
 return targetPlan.groups.map(g=>{
  const rs=g.entries.map(e=>entries.find(r=>r.source.sheet===e.source.sheet&&r.source.sourceRow===e.source.sourceRow&&r.source.rowHash===e.source.rowHash));
  const different=rs.some(r=>r?.state==='CAPTURED_USD_DIFFERS'),unknown=rs.some(r=>!r||!['EXACT_USD_SUMMARY_MATCH','CHILD_NOT_COMPARED_TO_DOCUMENT_TOTAL'].includes(r.state)),child=rs.some(r=>r?.state==='CHILD_NOT_COMPARED_TO_DOCUMENT_TOTAL'),hasTotal=rs.some(r=>r?.state==='EXACT_USD_SUMMARY_MATCH');
  const summaryState=different?'SOURCE_USD_DIFFERENCE':unknown||!hasTotal?'SUMMARY_REVIEW_INCOMPLETE':child?'DOCUMENT_TOTAL_MATCH_CHILD_REVIEW_PENDING':'DOCUMENT_TOTAL_MATCH_REMAINING_GATES_PENDING';
  return {groupKey:g.groupKey,businessState:g.state,businessReasons:g.reasons,summaryState,revenueRows:rs.length,readyToImport:false,postingAllowed:false};
 });
}

export async function reviewReconSemantics(snapshot,manifest,root,pin,python,targetPlan,decisions){
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);
 const custody=await verifyReconFiles(snapshot,manifest,root,pin);
 const {stdout}=await promisify(execFile)(python,[fileURLToPath(new URL('./extract-recon-text.py',import.meta.url)),root,...manifest.files.map(f=>f.fileId)],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000,windowsHide:true});
 const extracted=JSON.parse(stdout),byId=new Map(extracted.files.map(f=>[f.fileId,f]));
 if(extracted.tool!=='pypdf'||extracted.mode!=='layout'||byId.size!==manifest.files.length||extracted.files.length!==byId.size||manifest.files.some(f=>byId.get(f.fileId)?.sha256!==f.sha256))throw Error('PDF extraction coverage or byte hash differs');
 // Recheck bytes after extraction; changed sources cannot inherit the first check.
 await verifyReconFiles(snapshot,manifest,root,pin);
 const files=manifest.files.map(f=>{const x=byId.get(f.fileId);return {fileId:f.fileId,sha256:f.sha256,sourceHeaders:f.sourceHeaders,pageCount:x.pages.length,parsed:x.error?{state:x.error}:parseUsdSummary(x.pages)};});
 const parsed=new Map(files.map(f=>[f.fileId,f])),headers=snapshot.tables['43_RECON_PDF_HEADER'],entries=[];
 const details=snapshot.tables['44_RECON_PDF_DETAIL'],revenues=snapshot.tables['40_MONTHLY_REVENUE'];
 for(const [sheet,t] of [['40_MONTHLY_REVENUE',revenues],['44_RECON_PDF_DETAIL',details]])for(const r of t.rows){
  const v=r.values,docId=text(v.Source_Recon_Doc_ID??v.Recon_Doc_ID),hs=headers.rows.filter(h=>text(h.legacyId)===docId),source=address(sheet,t,r);
  let state='UNRESOLVED_SOURCE_HEADER',checks=[],fileId=null,pdf=null;
  if(hs.length===1){const ids=reconHeaderFileIds(hs[0]);fileId=ids.length===1?ids[0]:null;pdf=parsed.get(fileId)?.parsed;
   state=!fileId?'AMBIGUOUS_SOURCE_FILE':!pdf?'FILE_NOT_CAPTURED':pdf.state;
   if(pdf?.state==='EXPLICIT_USD_SUMMARY'){
    const h=hs[0],hp=sourceDate(h,'Period_Month')?.slice(0,7),sameIdentity=norm(h.values.Service_Header)===norm(pdf.service)&&hp===pdf.period;
    if(!sameIdentity)state='HEADER_PDF_IDENTITY_DIFFERS';
    else if(!pdf.footerMatches)state='PDF_FOOTER_DIFFERS';
    else if(sheet==='40_MONTHLY_REVENUE'&&norm(v.Revenue_Row_Type)!=='TOTAL')state='CHILD_NOT_COMPARED_TO_DOCUMENT_TOTAL';
    else if(sheet==='40_MONTHLY_REVENUE'&&(sourceDate(r,'Revenue_Month')?.slice(0,7)!==pdf.period||norm(v.Currency)!=='USD'))state='REVENUE_PERIOD_OR_CURRENCY_DIFFERS';
    // A detail must identify the document service literally; no substring/alias.
    else if(sheet==='44_RECON_PDF_DETAIL'&&norm(v.Service_Name)!==norm(pdf.service))state='DETAIL_NOT_DOCUMENT_TOTAL';
    else{checks=compareCapturedUsd(v,pdf,sheet==='40_MONTHLY_REVENUE'?[['Invoice_Revenue_USD',fields[3]],['Invoice_WHT_USD',fields[4]],['Invoice_Payable_USD',fields[5]]]:fields.map(f=>[f,f]));state=checks.every(c=>c.state==='MATCH')?'EXACT_USD_SUMMARY_MATCH':'CAPTURED_USD_DIFFERS';}
   }
  }
  entries.push({source,sourceDocument:hs.length===1?address('43_RECON_PDF_HEADER',headers,hs[0]):null,fileId,pdfSha256:parsed.get(fileId)?.sha256??null,state,checks,capturedNote:v.Note??null,readyToImport:false});
 }
 const count=xs=>xs.reduce((a,x)=>(a[x.state]=(a[x.state]??0)+1,a),{});
 const groups=reconSemanticGroups(targetPlan,entries);
 const body={format:'dgc-recon-usd-summary-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,manifestHash:pin,custody,extractor:{tool:extracted.tool,version:extracted.version,mode:extracted.mode,scriptHash:digest(await readFile(new URL('./extract-recon-text.py',import.meta.url),'utf8'))},files,entries,groups,groupStates:count(groups.map(g=>({state:g.summaryState}))),fileStates:count(files.map(f=>f.parsed)),revenueStates:count(entries.filter(e=>e.source.sheet==='40_MONTHLY_REVENUE')),detailStates:count(entries.filter(e=>e.source.sheet==='44_RECON_PDF_DETAIL')),postingAllowed:false,acceptance:false,pdfSemanticsVerified:false,scope:'EXPLICIT_DOCUMENT_USD_SUMMARY_ONLY_NOT_CHILD_LINES_LIFECYCLE_OR_SIGNATURE_ACCEPTANCE',recomputeAmounts:false};
 return {...body,reviewHash:digest(body)};
}
