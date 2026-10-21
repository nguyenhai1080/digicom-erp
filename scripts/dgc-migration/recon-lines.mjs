import {createRequire} from 'node:module';
import {digest,canonical,text} from './core.mjs';
import {verifyRevenueTargetPlan} from './revenue-target.mjs';
import {reconHeaderFileIds} from './recon-files.mjs';
import {extractReconTexts,parseUsdSummary,compareCapturedUsd,capturedMonth} from './recon-semantics.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:240}),D=v=>new Decimal(String(v));
const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
const money='(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\.[0-9]{2}';
const nativeFields=['Total_Service_Revenue_MZN','IVA_Tax_MZN','Cost_Deduction_MZN','Service_Revenue_For_Sharing_MZN','Sharing_Rate','Distribution_Ratio','Remuneration_Provider_MZN','WHT_MZN','Partner_Revenue_MZN'];
const addr=(sheet,t,r)=>({sheet,sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});

// These printed MZN cells are source evidence only, never target money or FX.
// USD child amounts are compared directly to captured detail USD, not computed.
export function parsePrintedLines(pages){
 const identity=parseUsdSummary(pages);if(identity.state!=='EXPLICIT_USD_SUMMARY'||!identity.footerMatches)return {state:'DOCUMENT_SUMMARY_NOT_VERIFIED',identity};
 const raw=pages[0],end=raw.search(/^\s*In\s+MZN\b/im);if(end<0)return {state:'NO_PRINTED_NATIVE_TABLE',identity};
 const lines=raw.slice(0,end).split(/\r?\n/),candidates=lines.filter(l=>new RegExp('^\\s*\\d{1,3}\\s+[A-Za-z][A-Za-z0-9_() /&+.-]*?\\s+'+money).test(l));
 const row=new RegExp('^\\s*(\\d{1,3})\\s+([A-Za-z][A-Za-z0-9_() /&+.-]{0,59}?)\\s+'+Array(4).fill('('+money+')').join('\\s+')+'\\s+(\\d{1,3}\\.\\d{2})%\\s+(\\d{1,3}\\.\\d{2})%\\s+'+Array(3).fill('('+money+')').join('\\s+')+'\\s*$');
 if(!candidates.length)return {state:'NO_EXACT_PRINTED_LINES',identity};
 if(lines.filter(l=>/^\s*\d{1,3}\s+/.test(l)).length!==candidates.length)return {state:'UNSUPPORTED_PRINTED_COLUMNS',identity};
 const rows=[];
 for(const line of candidates){const m=line.match(row);if(!m)return {state:'UNSUPPORTED_PRINTED_COLUMNS',identity};
  const values=Object.fromEntries(nativeFields.map((f,i)=>[f,[4,5].includes(i)?D(m[i+3]).div(100).toFixed():D(m[i+3].replaceAll(',','')).toFixed()]));
  if(D(values.Sharing_Rate).gt(1)||D(values.Distribution_Ratio).gt(1))return {state:'INVALID_PRINTED_RATE',identity};
  rows.push({lineNo:Number(m[1]),serviceName:m[2].trim(),values,line:line.trim()});
 }
 if(rows.some((r,i)=>r.lineNo!==i+1)||new Set(rows.map(r=>norm(r.serviceName))).size!==rows.length)return {state:'AMBIGUOUS_PRINTED_LINES',identity};
 return {state:'EXACT_PRINTED_NATIVE_LINES',identity,rows,textHash:digest(raw)};
}

export function comparePrintedLine(detail,printed){
 return nativeFields.map(field=>{
  const raw=detail[field],valid=['string','number'].includes(typeof raw)&&/^\d+(?:\.\d+)?$/.test(String(raw)),actual=valid?D(raw):null,expected=D(printed.values[field]);
  return {field,actual:actual?.toFixed()??null,printed:expected.toFixed(),difference:actual?.minus(expected).toFixed()??null,state:!actual?'UNAVAILABLE':actual.eq(expected)?'MATCH':'MISMATCH'};
 });
}

export function matchChildSources(snapshot,files){
 const byFile=new Map(files.map(f=>[f.fileId,f])),ht=snapshot.tables['43_RECON_PDF_HEADER'],dt=snapshot.tables['44_RECON_PDF_DETAIL'],rt=snapshot.tables['40_MONTHLY_REVENUE'],entries=[];
 for(const r of rt.rows.filter(r=>norm(r.values.Revenue_Row_Type)==='CHILD')){
  const v=r.values,hs=ht.rows.filter(h=>text(h.legacyId)===text(v.Source_Recon_Doc_ID)),ds=dt.rows.filter(d=>text(d.legacyId)===text(v.Source_Recon_Detail_ID)),source=addr('40_MONTHLY_REVENUE',rt,r);
  let state='UNRESOLVED_UNIQUE_SOURCE',fileId=null,nativeChecks=[],usdChecks=[],printedLine=null;
  if(hs.length===1&&ds.length===1){const h=hs[0],d=ds[0],ids=reconHeaderFileIds(h);fileId=ids.length===1?ids[0]:null;const p=byFile.get(fileId)?.parsed;
   state=!fileId?'AMBIGUOUS_SOURCE_FILE':!p?'FILE_NOT_CAPTURED':p.state;
   if(p?.state==='EXACT_PRINTED_NATIVE_LINES'){
    const matches=p.rows.filter(x=>norm(x.serviceName)===norm(d.values.Service_Name));
    if(text(d.values.Recon_Doc_ID)!==text(h.legacyId)||text(d.values.Upload_ID)!==text(h.values.Upload_ID)||norm(h.values.Service_Header)!==norm(p.identity.service)||capturedMonth(h,'Period_Month')!==p.identity.period||capturedMonth(r,'Revenue_Month')!==p.identity.period||v.Currency!=='USD')state='SOURCE_IDENTITY_DIFFERS';
    else if(matches.length!==1)state='PRINTED_CHILD_NOT_UNIQUE';
    else{printedLine=matches[0];nativeChecks=comparePrintedLine(d.values,printedLine);
     usdChecks=compareCapturedUsd(v,{values:d.values},[['Invoice_Revenue_USD','Remuneration_Provider_USD'],['Invoice_WHT_USD','WHT_USD'],['Invoice_Payable_USD','Partner_Revenue_USD']]);
     state=Number(d.values.Line_No)!==printedLine.lineNo?'CAPTURED_LINE_NUMBER_DIFFERS':nativeChecks.some(c=>c.state!=='MATCH')?'CAPTURED_NATIVE_DETAIL_DIFFERS':usdChecks.some(c=>c.state!=='MATCH')?'CAPTURED_USD_LINK_DIFFERS':'PRINTED_CHILD_AND_CAPTURED_USD_LINK_MATCH';
    }
   }
  }
  // Donor child-first resolution intentionally ignores stale parent mappings.
  // Preserve that captured discrepancy; this reader never remaps master IDs.
  const serviceMapping=ds.length===1?{detailMappingServiceId:ds[0].values.Mapping_Service_ID??null,revenueServiceId:v.Service_ID??null,capturedIdsEqual:text(ds[0].values.Mapping_Service_ID)===text(v.Service_ID)}:null;
  entries.push({source,sourceDetail:ds.length===1?addr('44_RECON_PDF_DETAIL',dt,ds[0]):null,fileId,pdfSha256:byFile.get(fileId)?.pdfSha256??null,state,printedLine,nativeChecks,usdChecks,serviceMapping,detailNote:ds.length===1?ds[0].values.Note??null:null,usdPrintedOnChild:false,derivedUsd:false,readyToImport:false});
 }
 return entries;
}

export async function reviewReconLines(snapshot,manifest,root,pin,python,targetPlan,decisions){
 verifyRevenueTargetPlan(targetPlan,snapshot,decisions);const {custody,extracted}=await extractReconTexts(snapshot,manifest,root,pin,python);
 const files=extracted.files.map(f=>({fileId:f.fileId,pdfSha256:f.sha256,parsed:f.error?{state:f.error}:parsePrintedLines(f.pages)})),entries=matchChildSources(snapshot,files);
 const groups=targetPlan.groups.filter(g=>g.entries.some(e=>entries.some(r=>canonical(r.source)===canonical(e.source)))).map(g=>({groupKey:g.groupKey,businessState:g.state,businessReasons:g.reasons,childSources:g.entries.map(e=>entries.find(r=>canonical(r.source)===canonical(e.source))).filter(Boolean).map(r=>({source:r.source,state:r.state})),readyToImport:false}));
 const count=xs=>xs.reduce((a,x)=>(a[x.state]=(a[x.state]??0)+1,a),{}),body={format:'dgc-recon-printed-child-review-v1',snapshotHash:snapshot.snapshotHash,targetPlanHash:targetPlan.planHash,manifestHash:pin,custody,extractor:{tool:extracted.tool,version:extracted.version,mode:extracted.mode},files,entries,groups,fileStates:count(files.map(f=>f.parsed)),childStates:count(entries),postingAllowed:false,acceptance:false,pdfSemanticsVerified:false,recomputeAmounts:false,operationalMzn:false,scope:'PRINTED_NATIVE_EVIDENCE_AND_CAPTURED_USD_LINK_NO_FX_NO_LIFECYCLE_ACCEPTANCE'};
 return {...body,reviewHash:digest(body)};
}
