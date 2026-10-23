import {Prisma} from '@erp/db';
import {parseReconIdentity,normalizeService} from './recon-identity.js';
import {CommandError} from './commands.js';
import {parseDigicomStatement} from './recon-digicom.js';

// Characterized from deployed DGC v61: 21_Recon_OCR and 22_Recon_PDF_Approval.
// Values remain decimal strings across JSON; never round already-rounded USD intermediates.
export const fields=['totalServiceRevenue','ivaTax','serviceRevenueForSharing','remunerationProvider','wht','partnerRevenue'] as const;
export type Amounts=Record<typeof fields[number],string>;
export type Detail=Amounts & {lineNo:number;serviceName:string;costDeduction:string;sharingRate:string;distributionRatio:string;ratesMissing?:boolean;usd:Amounts;rowType:'TOTAL'|'CHILD'};
export type Financial={version:1;source:string;nativeCurrency?:'VND';sourcePartnerKey?:'DIGICOM';native?:Amounts|null;exchangeRate:string|null;details:Detail[];mzn:Amounts|null;usd:Amounts|null;warnings:string[];errors:string[];ready:boolean;manual?:{reason:string;changes:{lineNo:number;before:string;after:string}[]}};
const D=(v:string|number)=>new Prisma.Decimal(v);
const r=(v:Prisma.Decimal)=>v.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const n=(v:string)=>D(v.replace(/,/g,''));
const zero=():Amounts=>Object.fromEntries(fields.map(f=>[f,'0.00'])) as Amounts;
export function convert(a:Amounts,fx:string):Amounts{return Object.fromEntries(fields.map(f=>[f,r(D(a[f]).div(fx))])) as Amounts;}
export function sum(rows:Amounts[]):Amounts{return Object.fromEntries(fields.map(f=>[f,r(rows.reduce((s,d)=>s.plus(d[f]),D(0)))])) as Amounts;}
const close=(a:string,b:string,t='0.02')=>D(a).minus(b).abs().lte(t);
const moneyPattern='(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\.[0-9]{2}';
const tokens=(s:string)=>[...s.matchAll(new RegExp(moneyPattern,'g'))].map(m=>r(n(m[0])));
const key=(s:string)=>normalizeService(s).replace(/[^A-Z0-9]/g,'');
function summary(values:string[]):Amounts{return Object.fromEntries(fields.map((f,i)=>[f,values[i]])) as Amounts;}
// Poppler -layout retains physical columns. A multiline service cell may put
// its name above/below a numbered row whose money cells are on the middle line.
// Join service text and wrapped money only at their original physical columns.
// Raw extracted text and the original PDF are never modified in storage.
function unwrapServiceCells(raw:string){
 const lines=raw.replace(/\r/g,'').split('\n');let changed=false;
 for(let i=1;i<lines.length-1;i++){
  const row=lines[i],m=row.match(new RegExp('^(\\s*)(\\d{1,3})(\\s+)([A-Za-z][A-Za-z0-9_() /&+.-]{0,59}?\\s+)?(?='+moneyPattern+')'));
  if(!m||!/\bIn\s+MZN\b/i.test(lines.slice(i+1).join('\n')))continue;
  const start=m[1].length+m[2].length+1,end=m[0].length;
  const cell=(line:string)=>{
   const name=line.slice(start,end).trim(),tail=line.slice(end);
   if(!name||line.slice(0,start).trim()||!/^[A-Za-z][A-Za-z0-9_() /&+.-]{0,59}$/.test(name)||!new RegExp('^(?:\\s*'+moneyPattern+')*\\s*$').test(tail))return null;
   const money=[...tail.matchAll(new RegExp(moneyPattern,'g'))].map(v=>({index:end+v.index!,text:v[0]}));
   return {name,money};
  };
  const before=cell(lines[i-1]),after=cell(lines[i+1]),inline=m[4]?.trim()??'';
  if(!before&&!after)continue;
  const name=[before?.name,inline,after?.name].filter(Boolean).join(' ');if(name.length>60)continue;
  // Print-to-PDF can wrap the final Payable cell onto the name continuation
  // line. Restore only numeric cells whose original column is vacant; never
  // overwrite money already present or infer a missing amount from totals.
  let merged=row,invalid=false;
  for(const part of [before,after])for(const value of part?.money??[]){
   if(merged.slice(value.index,value.index+value.text.length).trim()){invalid=true;break;}
   merged=merged.padEnd(value.index+value.text.length,' ');
   merged=merged.slice(0,value.index)+value.text+merged.slice(value.index+value.text.length);
  }
  if(invalid)continue;
  lines[i]=m[1]+m[2]+' '+name+' '+merged.slice(end);
  if(before)lines[i-1]='';if(after)lines[i+1]='';changed=true;
 }
 return {text:lines.join('\n'),changed};
}
function summaries(text:string,errors:string[]){
 const result:Partial<Record<'MZN'|'USD',Amounts>>={};
 for(const currency of ['MZN','USD'] as const){
  const found=[...text.matchAll(new RegExp('\\bIn\\s+'+currency+'\\b([\\s\\S]*?)(?=\\bIn\\s+(?:MZN|USD)\\b|The\\s+Total|$)','gi'))];
  for(const m of found){const values=tokens(m[1]);if(values.length<6)continue;const a=summary(values.slice(0,6));
   if(result[currency]&&fields.some(f=>result[currency]![f]!==a[f]))errors.push('Có nhiều bảng tổng '+currency+' khác nhau.');else result[currency]=a;
  }
 }
 return result;
}
export function englishMoneyWords(value:string):string|null{
 const words=value.toLowerCase().replace(/\b(hundred|thousand|million|billion)s\b/g,'$1').replace(/-/g,' ').replace(/[(),]/g,' ').replace(/\s+/g,' ').trim();
 const small:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 function part(s:string){let total=D(0),current=D(0);for(const w of s.trim().split(/\s+/)){if(!w||['and','only','us','usd','u.s.'].includes(w))continue;
  if(w in small)current=current.plus(small[w]);else if(w==='hundred')current=current.mul(100);else if(['thousand','million','billion'].includes(w)){total=total.plus(current.mul(w==='thousand'?1000:w==='million'?1000000:1000000000));current=D(0);}else if(/^\d+$/.test(w))current=current.plus(w);else return null;}return total.plus(current);}
 const match=words.match(/^(.*?)\s+dollars?\b(?:\s*(.*?)\s+cents?\b)?\s*(?:only)?$/),cents=words.match(/^(.*?)\s+cents?\s*(?:only)?$/);
 if(!match&&!cents)return null;const a=part(match?.[1]??''),b=part(match?.[2]??cents?.[1]??'');return a&&b&&b.lt(100)?r(a.plus(b.div(100))):null;
}
function detail(a:Amounts,name:string,lineNo:number,fx:string,cost='0.00',share='0',dist='0'):Detail{return {...a,lineNo,serviceName:normalizeService(name),costDeduction:cost,sharingRate:share,distributionRatio:dist,usd:convert(a,fx),rowType:'CHILD'};}
function segment(text:string,start:RegExp,ends:RegExp[]){const m=start.exec(text);if(!m)return '';const rest=text.slice(m.index+m[0].length);return rest.slice(0,Math.min(rest.length,...ends.map(p=>p.exec(rest)?.index??rest.length)));}
function historical(text:string,errors:string[],warnings:string[]):{a:Amounts;fx:string}|null{
 if(!/STAT+EMENT\s+REVENUE\s+OF\s+MOVTV\s*(?:\(\s*CONTENT\s*\)\s*)?SERVICE\b/i.test(text))return null;
 const table=text.slice(Math.max(0,text.search(/SHARING\s+REV(?:ENUE|UENUE)/i))).split(/Total\s+Revenue\s+in\s+USD/i)[0].replace(/\b\d+(?:\.\d+)?\s*%/g,' '),vals=[...new Set(tokens(table))].filter(v=>D(v).gt(0));
 if(vals.length>80){errors.push('Bảng MOVTV lịch sử có quá nhiều số để xác minh.');return null;}
 const triples:string[][]=[];
 for(const a of vals)for(const b of vals){if(!D(a).gt(b)||D(b).div(a).minus('.10').abs().gt('.002'))continue;for(const c of vals){if(D(a).minus(b).minus(c).abs().lte(Prisma.Decimal.max('.08',D(c).mul('.00002'))))triples.push([a,b,c]);}}
 if(triples.length!==1){errors.push('Không xác định duy nhất bộ Revenue/WHT/Payable của MOVTV lịch sử.');return null;}
 const [revenue,wht,payable]=triples[0],before=vals.slice(0,vals.indexOf(revenue));
 const sharing=[...before].reverse().find(v=>D(v).gt(revenue)&&D(revenue).div(v).minus('.47').abs().lte('.03'));
 const received=sharing&&[...before].reverse().find(v=>D(v).gt(sharing)&&D(v).div(sharing).minus('1.17').abs().lte('.03'));
 const gross=received&&before.find(v=>D(v).gt(received)&&D(received).div(v).minus('.40').abs().lte('.03'));
 const dollars=[...text.matchAll(new RegExp('('+moneyPattern+')\\s*USD\\b','gi'))].map(m=>r(n(m[1])));
 if(!sharing||!received||!gross||!dollars.length||D(dollars.at(-1)!).lte(0)){errors.push('MOVTV lịch sử thiếu số gốc để xác minh; không suy ngược bằng tỷ lệ giả định.');return null;}
 warnings.push('MOVTV lịch sử: tỷ giá được suy từ Payable MZN/USD cuối PDF; kiểm tra bản gốc.');
 return {a:{totalServiceRevenue:gross,ivaTax:r(D(received).minus(sharing)),serviceRevenueForSharing:sharing,remunerationProvider:revenue,wht,partnerRevenue:payable},fx:D(payable).div(dollars.at(-1)!).toFixed(12)};
}
export function parseReconFinancial(raw:string):Financial{
 const digicom=parseDigicomStatement(raw);if(digicom)return digicom;
 const wrapped=unwrapServiceCells(raw),p=parseReconIdentity(raw),text=wrapped.text.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(),errors:string[]=[],warnings:string[]=[];
 if(wrapped.changed)warnings.push('Tên dịch vụ và ô tiền xuống dòng đã ghép theo cột trong PDF; kiểm tra lại trên bản gốc.');
 let fx=p.exchangeRate,source='EXACT_TABLE',details:Detail[]=[],s=summaries(text,errors);
 if(fx&&D(fx).lte(0))fx=null;
 const legacy=historical(text,errors,warnings);
 if(legacy){fx=legacy.fx;source='HISTORICAL_MOVTV';s={MZN:legacy.a,USD:convert(legacy.a,fx)};details=[detail(legacy.a,'MOVTV',1,fx,'0.00','.40','.47')];}
 if(!legacy&&fx){
  // DGC v61 grouped/row-number parsers accept seven money columns and optional
  // rates, including OCR that drops percent signs. Never consume summary/footer rows.
  const table=text.split(/\bIn\s+(?:MZN|USD)\b|The\s+Total/i)[0];
  const row=new RegExp('(?:^|\\s)(\\d{1,3})\\s+([A-Z][A-Z0-9_() /-]{1,60}?)\\s+('+moneyPattern+')\\s+('+moneyPattern+')\\s+('+moneyPattern+')\\s+('+moneyPattern+')(?:\\s+(\\d+(?:\\.\\d+)?)%?\\s+(\\d+(?:\\.\\d+)?)%?)?\\s+('+moneyPattern+')\\s+('+moneyPattern+')\\s+('+moneyPattern+')(?=\\s+(?:\\d{1,3}\\s+[A-Z]|$)|$)','gi');
  for(const m of table.matchAll(row)){
   const a=summary([m[3],m[4],m[6],m[9],m[10],m[11]].map(v=>r(n(v))));
   const missing=!m[7]||!m[8];
   if(!missing&&(n(m[7]).gt(100)||n(m[8]).gt(100)))errors.push('Tỷ lệ chia sẻ/phân phối vượt 100% ở '+m[2]+'.');
   const d=detail(a,m[2],Number(m[1]),fx,r(n(m[5])),missing?'0':n(m[7]).div(100).toFixed(),missing?'0':n(m[8]).div(100).toFixed());
   if(missing){d.ratesMissing=true;source='DGC_OPTIONAL_RATE_ROWS';warnings.push('Không đọc được hai tỷ lệ ở '+d.serviceName+'; giữ các khoản tiền gốc, không suy đoán tỷ lệ.');}
   else if(!m[0].includes('%'))source='DGC_OPTIONAL_RATE_ROWS';
   details.push(d);
  }
  const numberedRows=[...table.matchAll(new RegExp('(?:^|\\s)\\d{1,3}\\s+([A-Z][A-Z0-9_() /-]{1,60}?)\\s+(?='+moneyPattern+')','gi'))];
  if(numberedRows.length!==details.length)errors.push('Có dòng dịch vụ chưa đọc đủ cột tiền; không thay bằng bảng tổng.');
  const bundle=/VOICEMAIL/i.test(text)&&/\bISIGN\b/i.test(text)&&/\bMCA\b/i.test(text)&&/MCAVM|ISIGN/i.test(p.service);
  if(!details.length&&!bundle){
   const sharing=tokens(segment(text,/Service\s+sharing/i,[/deduction/i,/Cost\s+or\s+Excluding/i,/IVA\s+Tax/i]))[0];
   const iva=tokens(segment(text,/IVA\s+Tax\s*\(16%\)/i,[/Total\s+service\s+revenue/i]))[0];
   const total=tokens(segment(text,/Total\s+service\s+revenue\s*\(?3\)?/i,[/The\s+Total\s+revenue/i,/Service\s*:/i]))[0];
   const sh=text.match(/Sharing\s+Rate.*?(\d+(?:\.\d+)?)%/i)?.[1],di=text.match(/Revenue\s+ratio.*?(\d+(?:\.\d+)?)%/i)?.[1];
   if(sharing&&iva&&total&&sh&&di&&D(total).minus(iva).minus(sharing).gte('-.02')){
    source='SINGLE_LABELLED_COLUMNS';const rev=r(D(sharing).mul(sh).mul(di).div(10000)),wht=r(D(rev).mul('.10'));
    const a={totalServiceRevenue:total,ivaTax:iva,serviceRevenueForSharing:sharing,remunerationProvider:rev,wht,partnerRevenue:r(D(rev).minus(wht))};
    s={MZN:a,USD:convert(a,fx)};details=[detail(a,p.service,1,fx,r(Prisma.Decimal.max(0,D(total).minus(iva).minus(sharing))),D(sh).div(100).toFixed(),D(di).div(100).toFixed())];
   }else if(s.MZN){source='SINGLE_EXACT_SUMMARY';details=[detail(s.MZN,p.service,1,fx)];}
  }
  if(bundle){
   const children=details.filter(d=>key(d.serviceName)!==key(p.service));
   if(children.length!==3||!['VOICEMAIL','ISIGN','MCA'].every(v=>children.some(d=>key(d.serviceName)===v)))errors.push('Bảng gộp MCAVM-ISIGN chưa đọc đủ ba dòng con VOICEMAIL/ISIGN/MCA.');
   else details=children;
  }
  if(key(p.service)==='MEUBEAT'&&(details.some(d=>key(d.serviceName)!==key(p.service))||(/\bMEUBEAT[ _-]+APP\b/i.test(text)&&/\bMEUBEAT[ _-]+IVR\b/i.test(text)))){
   const children=details.filter(d=>key(d.serviceName)!==key(p.service));
   if(children.length!==2||!['MEUBEATAPP','MEUBEATIVR'].every(v=>children.some(d=>key(d.serviceName)===v)))errors.push('MEUBEAT chưa đọc đủ hai dòng con MEUBEAT APP và MEUBEAT IVR.');
   else details=children;
  }
 }
 if(!fx)errors.push('Chưa đọc được tỷ giá MZN/USD hợp lệ.');
 if(!p.service||!p.period||p.conflictingPages)errors.push('Dịch vụ/kỳ PDF thiếu hoặc mâu thuẫn.');
 if(!details.length)errors.push('Chưa đọc được bảng tài chính đủ tin cậy. Đọc lại OCR hoặc kiểm tra scan; chưa thể chốt.');
 if(details.length>100)errors.push('Bảng vượt giới hạn 100 dòng.');
 if(new Set(details.map(d=>key(d.serviceName))).size!==details.length)errors.push('Dịch vụ bị lặp trong bảng tài chính.');
 if(details.length&&fx){
  if(!s.MZN)s.MZN=sum(details);if(!s.USD){s.USD=convert(s.MZN,fx);warnings.push('Bảng tổng USD được quy đổi riêng từ MZN theo tỷ giá PDF.');}
  for(const d of details)if(!close(r(D(d.remunerationProvider).minus(d.wht)),d.partnerRevenue))errors.push('Revenue−WHT khác Payable MZN ở '+d.serviceName+'.');
  for(const f of fields)if(!close(sum(details)[f],s.MZN[f],f==='ivaTax'?'0.05':'0.02'))errors.push('Tổng dòng '+f+' không khớp bảng MZN.');
  for(const f of fields)if(!close(convert(s.MZN,fx)[f],s.USD[f]))errors.push('Bảng USD '+f+' không khớp tỷ giá/bảng MZN.');
  if(details.length===1&&key(details[0].serviceName)===key(p.service)){details[0].rowType='TOTAL';details[0].usd=s.USD;}
  else if(s.MZN){details=details.map((d,i)=>({...d,lineNo:i+1,rowType:'CHILD' as const}));const total=detail(s.MZN,p.service,details.length+1,fx);total.rowType='TOTAL';total.usd=s.USD;details.push(total);}
 }
 const footer=p.totalRevenueUsd,words=p.totalRevenueText?englishMoneyWords(p.totalRevenueText):null;
 if(p.totalRevenueText&&!words)errors.push('Chưa xác minh được số tiền bằng chữ cuối PDF.');
 if(s.USD&&footer&&!close(s.USD.partnerRevenue,footer))errors.push('Payable USD không khớp tổng cuối PDF.');
 if(s.USD&&words&&!close(s.USD.partnerRevenue,words))errors.push('Payable USD không khớp số tiền bằng chữ.');
 return {version:1,source,exchangeRate:fx,details,mzn:s.MZN??null,usd:s.USD??null,warnings,errors:[...new Set(errors)],ready:errors.length===0};
}
export function correctFinancial(source:Financial,changes:{lineNo:number;revenueMzn:string}[],reason:string):Financial{
 if(source.nativeCurrency)throw new CommandError(409,'Số liệu DIGICOM lấy từ PDF gốc; nhận lại PDF đúng để sửa, không tính WHT theo mẫu MOVITEL.');
 if(!source.ready||!source.exchangeRate)throw new CommandError(409,'Bảng gốc chưa đủ điều kiện sửa Revenue.');
 const result:Financial=structuredClone(source),editable=result.details.filter(d=>d.rowType==='CHILD'||result.details.length===1);
 if(new Set(changes.map(v=>v.lineNo)).size!==changes.length||changes.some(c=>!editable.some(d=>d.lineNo===c.lineNo)))throw new CommandError(400,'Chỉ sửa Revenue trên dòng dịch vụ; tổng gộp tự đồng bộ.');
 const edited:{lineNo:number;before:string;after:string}[]=[];
 for(const c of changes){const d=editable.find(d=>d.lineNo===c.lineNo)!;const amount=r(D(c.revenueMzn));if(amount===d.remunerationProvider)continue;
  edited.push({lineNo:d.lineNo,before:d.remunerationProvider,after:amount});d.remunerationProvider=amount;d.wht=r(D(amount).mul('.10'));d.partnerRevenue=r(D(amount).minus(d.wht));d.usd=convert(d,source.exchangeRate);
 }
 if(!edited.length)return result;
 if(!reason.trim())throw new CommandError(400,'Cần lý do sửa Revenue.');
 const totals=sum(editable);for(const d of result.details.filter(d=>d.rowType==='TOTAL'&&result.details.length>1)){Object.assign(d,totals);d.usd=convert(totals,source.exchangeRate);}
 result.mzn=totals;result.usd=convert(totals,source.exchangeRate);result.manual={reason,changes:edited};result.warnings.push('Revenue MZN đã sửa thủ công: WHT 10%, Payable MZN = Revenue−WHT; từng khoản USD quy đổi riêng.');return result;
}
