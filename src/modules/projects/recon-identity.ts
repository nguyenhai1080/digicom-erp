import {Prisma} from '@erp/db';
export function normalizeService(value:string){return value.trim().replace(/\s*[-–—]\s*/g,'-').replace(/\s+/g,'_').replace(/_*-_*/g,'-').replace(/__+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();}
const nameKey=(v:string)=>v.toUpperCase().replace(/[^A-Z0-9]/g,'');
export function extractPeriod(text:string){
 const range=text.match(/Thời gian:\s*Từ ngày\s+(\d{2})\/(\d{2})\/(20\d{2})\s+đến ngày\s+(\d{2})\/(\d{2})\/(20\d{2})/i);
 if(range){const [,day,month,year,endDay,endMonth,endYear]=range,last=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();return day==='01'&&month===endMonth&&year===endYear&&Number(month)>=1&&Number(month)<=12&&Number(endDay)===last?year+'-'+month:'';}
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const convert=(m:string,y:string)=>{const year=Number(y)+(y.length===2?2000:0),n=/^\d+$/.test(m)?Number(m):months.indexOf(m.slice(0,3).toLowerCase())+1;return year>=2000&&year<=2100&&n>=1&&n<=12?`${year}-${String(n).padStart(2,'0')}`:'';};
 for(const re of [/(?:Period|Month)\s*:?\s*([A-Za-z]{3,9})\s*[-\/]\s*(\d{2}|\d{4})\b/i,/(?:Period|Month)\s*:?\s*(\d{1,2})\s*[-\/]\s*(\d{2}|\d{4})\b/i,/\bin\s+(?:the\s+)?month\s+(\d{1,2})\s*[-\/]\s*(\d{2}|\d{4})\b/i]){const m=text.match(re);if(m){const result=convert(m[1],m[2]);if(result)return result;}}return '';
}
export function extractService(text:string){
 const vietnamese=text.match(/DỊCH VỤ\s+([A-Z0-9_-]+)\s+TRÊN MẠNG DI ĐỘNG/i);if(vietnamese)return vietnamese[1];
 const historical=text.match(/STATEMENT\s+(?:CONFIRMATION\s+ON\s+SHARING\s+)?REVENUE\s+OF\s+([A-Z0-9_-]+)\s+(?:\([^\n)]{1,30}\)\s*)?SERVICE\b/i);if(historical)return historical[1];
 const title=text.match(/STATEMENT CONFIRMATION ON SHARING REVENUE OF\s+(.+?)\s*BETWEEN/i)?.[1]?.trim()??'',label=text.match(/Service:\s*([^\n]+)/i)?.[1]?.trim()??'';
 if(title&&label&&nameKey(label).length>nameKey(title).length&&nameKey(label).startsWith(nameKey(title))&&!/REPUBLIC\s+OF\s+MOZAMBIQUE/i.test(label))return label;
 return title||label||text.match(/(?:^|\n)Service\s*:?\s*\n\s*([A-Z0-9][A-Z0-9 _-]*)\s*(?:\n|$)/i)?.[1]?.trim()||'';
}
function decimal(value:string|undefined){if(!value)return null;const clean=value.replace(/,/g,'');if(!/^\d{1,16}(?:\.\d{1,6})?$/.test(clean))return null;return new Prisma.Decimal(clean).toFixed();}
export function parseReconIdentity(raw:string){
 const text=raw.replace(/\r/g,'\n').replace(/\u00a0/g,' ').split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
 const agreement=text.match(/Under the Agreement No\.?:\s*(.*?)\s+signed on:\s*([0-9\/\-]+)/i)??text.match(/Agreement\s+No\.?\s*:\s*([^\n]+)\s*\n(?:Signed\s+date\s*\n)?\s*([0-9]{1,2}[.\/\-][A-Za-z0-9]{1,9}[.\/\-][0-9]{2,4})/i);
 const vnAgreement=text.match(/Theo Hợp đồng hợp tác số\s+([^\n]+?)\.?\s*(?:\n|$)/i)?.[1]?.trim();
 const inferred=!extractService(text)&&!!agreement;
 const service=normalizeService(extractService(text)||(agreement?.[1]?.trim().split(/[\/\-]/).at(-1)??'')),period=extractPeriod(text);
 const pageIdentities=raw.split('\f').map(p=>({service:normalizeService(extractService(p)),period:extractPeriod(p)}));
 const conflict=new Set(pageIdentities.map(v=>v.service).filter(Boolean)).size>1||new Set(pageIdentities.map(v=>v.period).filter(Boolean)).size>1;
 return {service,period,agreementNo:agreement?.[1]?.trim()??vnAgreement??'',agreementSignedDate:agreement?.[2]??'',inferredFromAgreement:inferred,conflictingPages:conflict,
  exchangeRate:decimal(text.match(/Exchange rate:\s*([0-9.,]+)/i)?.[1]),totalRevenueUsd:decimal(text.match(/The\s+Total\s+revenue\s+in\s+[^\n:]{1,160}:\s*([0-9,]+\.\d{2})\s*USD/i)?.[1]),
  totalRevenueText:text.match(/\(In word:\s*([^)]+)\)/i)?.[1]??''};
}
export function matchReconIdentity(parsed:ReturnType<typeof parseReconIdentity>,selected:{serviceId:string;period:string},services:{id:string;serviceKey:string;serviceCode:string;serviceName:string;keyword?:string|null}[]){
 if(parsed.conflictingPages)return {state:'AMBIGUOUS_PAGES',message:'PDF có nhiều dịch vụ hoặc kỳ khác nhau. Cần tách và kiểm tra bản gốc.'};
 if(!parsed.service||parsed.service==='UNKNOWN_SERVICE'||!parsed.period)return {state:'MISSING_IDENTITY',message:'Chưa đọc đủ dịch vụ và kỳ từ PDF. Không thể xác minh lựa chọn.'};
 const matches=services.filter(s=>[s.serviceKey,s.serviceCode,s.serviceName,s.keyword].some(v=>!!v&&(normalizeService(v)===parsed.service||nameKey(v)===nameKey(parsed.service))));
 if(matches.length>1)return {state:'AMBIGUOUS_SERVICE',message:'Tên hoặc mã dịch vụ khớp nhiều hồ sơ. Cần kiểm tra danh mục.'};
 if(matches.length!==1||matches[0].id!==selected.serviceId)return {state:'SERVICE_MISMATCH',message:'Dịch vụ đọc từ PDF không khớp dịch vụ đã chọn.'};
 if(parsed.period!==selected.period)return {state:'PERIOD_MISMATCH',message:'Kỳ đọc từ PDF không khớp kỳ đã chọn.'};
 return {state:'MATCHED',message:'Dịch vụ và kỳ đọc từ PDF khớp lựa chọn. Cần kiểm tra số liệu trước khi chốt.'};
}
