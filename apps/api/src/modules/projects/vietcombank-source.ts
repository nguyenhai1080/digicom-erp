import {createHash} from 'node:crypto';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
export const VCB_XML_URL='https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx';
export const VCB_PAGE_URL='https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/Ty-gia';
export const VCB_COOLDOWN_MS=300000,VCB_MAX_BYTES=131072;
const invalid=():never=>{throw new CommandError(502,'Nguồn Vietcombank chưa trả bảng USD/VND hợp lệ. Không lưu tỷ giá.');};
export const vcbSha=(s:string)=>createHash('sha256').update(s).digest('hex');
function amount(s:string){if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2}$/.test(s))return invalid();const d=new Prisma.Decimal(s.replaceAll(',',''));if(d.lt(1000)||d.gt(1000000))return invalid();return d;}
export function parseVcbUsd(xml:string,now=new Date()){
 if(Buffer.byteLength(xml)>VCB_MAX_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<ExrateList\s*>[\s\S]*<\/ExrateList>/.test(xml))return invalid();
 const times=[...xml.matchAll(/<DateTime>\s*([^<]+?)\s*<\/DateTime>/g)];if(times.length!==1)return invalid();
 const m=/^(\d{1,2})\/(\d{1,2})\/(20\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(times[0][1]);if(!m)return invalid();
 const [,mo,da,yr,hr,mi,se,ampm]=m,month=Number(mo),day=Number(da),hour=Number(hr),minute=Number(mi),second=Number(se);
 if(month<1||month>12||day<1||day>31||hour<1||hour>12||minute>59||second>59)return invalid();
 const localHour=hour%12+(ampm==='PM'?12:0),local=new Date(Date.UTC(Number(yr),month-1,day,localHour,minute,second));
 if(local.getUTCFullYear()!==Number(yr)||local.getUTCMonth()+1!==month||local.getUTCDate()!==day)return invalid();
 const published=new Date(local.getTime()-7*3600000);if(published.getTime()>now.getTime()+10*60000)return invalid();
 const usd:Record<string,string>[]=[];
 for(const tag of xml.matchAll(/<Exrate\b([^<>]*?)\/\s*>/g)){
  const attrs:Record<string,string>={};for(const a of tag[1].matchAll(/([A-Za-z]+)\s*=\s*(["'])(.*?)\2/g)){if(Object.hasOwn(attrs,a[1]))return invalid();attrs[a[1]]=a[3];}
  if(attrs.CurrencyCode==='USD')usd.push(attrs);
 }
 if(usd.length!==1||!usd[0].Transfer||!usd[0].Sell)return invalid();
 const transfer=amount(usd[0].Transfer),sell=amount(usd[0].Sell);if(transfer.gt(sell))return invalid();
 return {currency:'USD',unit:'VND/USD',transfer:transfer.toFixed(),sell:sell.toFixed(),rate:transfer.plus(sell).div(2).toFixed(),publishedAt:published.toISOString(),bankDate:local.toISOString().slice(0,10),formula:'(Transfer + Sell) / 2',sourceUrl:VCB_PAGE_URL,feedUrl:VCB_XML_URL,sourceHash:vcbSha(xml)};
}
export async function fetchVcbXml(){
 try{
  const response=await fetch(VCB_XML_URL,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/xml,text/xml','User-Agent':'Digicom-ERP FX reference/1.0'}});
  if(!response.ok||!/(?:text|application)\/xml/i.test(response.headers.get('content-type')??'')||Number(response.headers.get('content-length')??0)>VCB_MAX_BYTES||!response.body)return invalid();
  const reader=response.body.getReader();let length=0;const chunks:Uint8Array[]=[];try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>VCB_MAX_BYTES){await reader.cancel();return invalid();}chunks.push(value);}}finally{reader.releaseLock();}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
 }catch{throw new CommandError(502,'Không lấy được tỷ giá Vietcombank. Chưa lưu tỷ giá; vui lòng thử lại sau.');}
}
