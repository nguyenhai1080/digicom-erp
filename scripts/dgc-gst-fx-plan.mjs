// Plan a one-way copy of explicitly configured monthly reporting rates. No DB,
// HTTP, credentials, approval identities or automatic writes to either tenant.
import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const period=/^20\d{2}-(0[1-9]|1[0-2])$/,rate=/^[1-9]\d{0,7}(\.\d{1,8})?$/;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function rows(capture,company,url){
 if(capture?.companyCode!==company||capture.url!==url||!Number.isFinite(Date.parse(capture.capturedAt))||!Array.isArray(capture.response?.items)||capture.response.items.length>1200)throw Error('Wrong company, endpoint or capture');
 const seen=new Set();return capture.response.items.map(r=>{if(!period.test(r.period)||typeof r.rate!=='string'||!rate.test(r.rate)||typeof r.source!=='string'||!r.source.trim()||r.source.length>500||seen.has(r.period))throw Error('Invalid/duplicate monthly reporting rate');seen.add(r.period);return {period:r.period,rate:r.rate,source:r.source};}).map(r=>({...r,rate:normalizeRate(r.rate)})).sort((a,b)=>a.period.localeCompare(b.period));
}
function normalizeRate(value){const [whole,fraction='']=value.split('.');const trimmed=fraction.replace(/0+$/,'');return whole+(trimmed?'.'+trimmed:'');}
export function planGstFx(sourceCapture,targetCapture){
 const source=rows(sourceCapture,'GST','https://erp.gsttech.vn/api/v1/revenue-fx'),target=rows(targetCapture,'DGC','https://erp.digicomjsc.com/api/v1/revenue-fx'),existing=new Map(target.map(r=>[r.period,r]));
 const additions=[],same=[],conflicts=[];
 for(const r of source){const old=existing.get(r.period);if(old){if(old.rate===r.rate)same.push(r.period);else conflicts.push({period:r.period,gstRate:r.rate,dgcRate:old.rate,action:'KEEP_DGC'});continue;}
  const source=`ERP GST (https://erp.gsttech.vn), kỳ ${r.period}; nguồn gốc: ${r.source}`;
  if(source.length>500)throw Error('Provenance exceeds target source field; do not truncate it silently');
  additions.push({period:r.period,rate:r.rate,source});
 }
 return {format:'dgc-gst-reporting-fx-plan-v1',direction:'VND_PER_USD',source:{company:'GST',url:sourceCapture.url,capturedAt:sourceCapture.capturedAt,captureSha256:hash(sourceCapture),ratesSha256:hash(source),count:source.length,from:source[0]?.period??null,through:source.at(-1)?.period??null},target:{company:'DGC',url:targetCapture.url,capturedAt:targetCapture.capturedAt,captureSha256:hash(targetCapture),ratesSha256:hash(target),existingCount:target.length},policy:{createOnly:true,conflict:'KEEP_DGC',missingSource:'NO_FALLBACK',copySourceActor:false,changeHistoricalMoney:false,postCash:false},additions,same,conflicts,october2026Available:source.some(r=>r.period==='2026-10'),requestBytes:Buffer.byteLength(JSON.stringify({items:additions,confirmed:true}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [source,target,prefix]=process.argv.slice(2),root=await realpath('artifacts');
 for(const f of [source,target,prefix]){if(!f)throw Error('Source, target captures and private output prefix required');const rel=relative(root,resolve(f));if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/')))throw Error('Private artifacts paths required');}
 const plan=planGstFx(JSON.parse(await readFile(source,'utf8')),JSON.parse(await readFile(target,'utf8')));
 if(plan.requestBytes>32768)throw Error('Payload exceeds current server body limit; prepare bounded batches');
 const quote=v=>'"'+v.replaceAll('"','""')+'"';
 await writeFile(prefix+'.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 await writeFile(prefix+'.csv','\ufeffperiod,rate,source\r\n'+plan.additions.map(r=>[r.period,r.rate,r.source].map(quote).join(',')).join('\r\n')+'\r\n',{flag:'wx'});
 console.log(JSON.stringify({sourceCount:plan.source.count,sourceFrom:plan.source.from,sourceThrough:plan.source.through,additions:plan.additions.length,existingSame:plan.same.length,conflicts:plan.conflicts,october2026Available:plan.october2026Available,requestBytes:plan.requestBytes,liveWrites:0}));
}

