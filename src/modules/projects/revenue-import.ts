import AdmZip from 'adm-zip';
import {CommandError} from './commands.js';

function fail():never{throw new CommandError(422,'Bảng tính không hợp lệ. Dùng mẫu CSV/XLSX, tối đa 100 dòng; ô công thức phải có kết quả đã lưu.');};
const decode=(s:string)=>s.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const importColumns=['period','serviceCode','contractCode','currency','amount','deduction','fxRate','note'];
export function csvRows(text:string){
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const s=text.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c==='"'){if(cell||closed)fail();quoted=true;}else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&s[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}}else{if(closed&&!/\s/.test(c))fail();cell+=c;}if(rows.length>101||cell.length>4000)fail();}
 if(quoted)fail();row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function spreadsheetRows(bytes:Buffer,filename:string){
 let rows:string[][]=[];
 if(/\.csv$/i.test(filename)){const s=bytes.toString('utf8');if(s.includes('\uFFFD')||s.includes('\0'))fail();rows=csvRows(s);}
 else if(/\.xlsx$/i.test(filename)){
  try{const zip=new AdmZip(bytes),entries=zip.getEntries();if(entries.length>500||entries.reduce((n,e)=>n+e.header.size,0)>20*1024*1024||entries.some(e=>/vbaProject|externalLinks/i.test(e.entryName)))fail();
   const book=zip.readAsText('xl/workbook.xml'),rel=zip.readAsText('xl/_rels/workbook.xml.rels');const rid=book.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];if(!rid)fail();
   const target=[...rel.matchAll(/<Relationship\b[^>]*\/>/g)].map(m=>m[0]).find(s=>s.includes('Id="'+rid+'"'))?.match(/Target="([^"]+)"/)?.[1];if(!target||target.includes('..')||!/^\/?(?:xl\/)?worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(target))fail();
   const sheet=zip.readAsText(target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target),shared=zip.readAsText('xl/sharedStrings.xml');if(/<!DOCTYPE|<!ENTITY/.test(book+rel+sheet+shared)||!sheet||sheet.length>2*1024*1024||shared.length>2*1024*1024||[...sheet.matchAll(/<row\b/g)].length>101)fail();
   const texts=(s:string)=>[...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>decode(m[1])).join('');const strings=[...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>texts(m[1]));
   rows=[...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(r=>{const a:string[]=[];for(const c of r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const ref=c[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!ref)fail();let n=0;for(const ch of ref)n=n*26+ch.charCodeAt(0)-64;if(n>8)fail();const v=c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1],type=c[1].match(/\bt="([^"]+)"/)?.[1];if(type==='e'||c[2].includes('<f')&&v===undefined)fail();a[n-1]=type==='s'?strings[Number(v)]??fail():type==='inlineStr'?texts(c[2]):decode(v??'');}return Array.from({length:8},(_,i)=>a[i]??'');}).filter(r=>r.some(v=>v.trim()));
  }catch(e){if(e instanceof CommandError)throw e;fail();}
 }else fail();
 if(rows.length<2||rows.length>101||JSON.stringify(rows[0].slice(0,8).map(v=>v.trim()))!==JSON.stringify(importColumns)||rows[0].length!==8)fail();
 if(rows.slice(1).some(r=>r.length>8))fail();
 return rows.slice(1).map(r=>Object.fromEntries(importColumns.map((c,i)=>[c,(r[i]??'').trim()])));
}
