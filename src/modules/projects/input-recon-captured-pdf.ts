import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
export type CapturedInputStatement={captured:true;period:string;reconDate:string;issuer:string;partner:string;partnerKey:string;contractNumber:string;currency:string;lines:{code:string;service:string;baseUsd:string;shareRate:string;foreignAmount:string;fxRate:string;localAmount:string;taxRate:string;taxAmount:string;whtAmount:string;payableAmount:string}[];totals:{baseUsd:string;foreignAmount:string;localAmount:string;taxAmount:string;whtAmount:string;payableAmount:string}};
// This prints captured values directly. It never regenerates historical money
// from the current revenue, contract, FX or generator's rounding rules.
export async function renderCapturedInputStatement(data:CapturedInputStatement){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true});
 const left=28,right=814,width=841.89,height=595.28,black=rgb(.08,.08,.08),grey=rgb(.6,.6,.6);let page=doc.addPage([width,height]),y=height-30;
 const measure=(s:string,size=7)=>font.widthOfTextAtSize(s,size),text=(s:string,x:number,yy:number,size=7)=>page.drawText(s,{x,y:yy,size,font,color:black});
 const wrap=(s:string,w:number,size=7)=>{const result:string[]=[];let line='';for(const word of s.replace(/[\r\n]+/g,' ').split(/\s+/)){if(!word)continue;const next=line?line+' '+word:word;if(measure(next,size)<=w){line=next;continue;}if(line){result.push(line);line='';}for(const c of word){if(measure(line+c,size)>w&&line){result.push(line);line='';}line+=c;}}if(line)result.push(line);return result.length?result:[''];};
 const next=()=>{if(doc.getPageCount()>=12)throw new CommandError(422,'Bản in vượt 12 trang.');page=doc.addPage([width,height]);y=height-30;text('SỐ LIỆU ĐỐI SOÁT ĐẦU VÀO ĐÃ CHUYỂN · '+data.partnerKey+' · '+data.period,left,y,10);y-=23;};
 const block=(s:string,size=8)=>{for(const line of wrap(s,right-left,size)){if(y<55)next();text(line,left,y,size);y-=size+5;}};
 block('SỐ LIỆU ĐỐI SOÁT ĐẦU VÀO ĐÃ CHUYỂN',13);block('Kỳ '+data.period+' · Ngày in '+data.reconDate);
 block('Bên A: '+data.issuer+' · Bên B: '+data.partner);
 block('Hợp đồng: '+data.contractNumber+' · Tiền tệ: '+data.currency);
 block('Bản in tra cứu từ sổ đã chuyển, không phải PDF nguồn. Các số tiền được giữ nguyên.',8);y-=6;
 const cols=[left,180,248,292,362,430,530,620,704,right],headings=['Mã / dịch vụ','Cơ sở USD','Chia sẻ','Số chia USD','Tỷ giá','Số nội tệ '+data.currency,'Thuế '+data.currency,'WHT '+data.currency,'Phải trả '+data.currency];
 const grid=(top:number,bottom:number)=>{for(const x of cols)page.drawLine({start:{x,y:top},end:{x,y:bottom},color:grey,thickness:.4});for(const yy of [top,bottom])page.drawLine({start:{x:left,y:yy},end:{x:right,y:yy},color:grey,thickness:.4});};
 const heading=()=>{if(y<85)next();grid(y,y-30);headings.forEach((h,i)=>wrap(h,cols[i+1]-cols[i]-8).forEach((s,j)=>text(s,cols[i]+4,y-11-j*10)));y-=30;};
 const money=(v:string)=>{const [whole,frac]=new Prisma.Decimal(v).toFixed(2).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+frac;};
 heading();
 for(const l of data.lines){
  const names=wrap(l.code+' · '+l.service,cols[1]-cols[0]-8),h=Math.max(32,names.length*10+10);if(h>450)throw new CommandError(422,'Tên dịch vụ quá dài để in.');if(y-h<55){next();heading();}
  grid(y,y-h);names.forEach((s,j)=>text(s,left+4,y-12-j*10));
  const values=[money(l.baseUsd),new Prisma.Decimal(l.shareRate).mul(100).toFixed()+'%',money(l.foreignAmount),l.fxRate,money(l.localAmount),money(l.taxAmount),money(l.whtAmount),money(l.payableAmount)];
  values.forEach((s,i)=>{const col=i+1;if(measure(s)>cols[col+1]-cols[col]-8)throw new CommandError(422,'Số tiền quá dài để in.');text(s,cols[col+1]-measure(s)-4,y-14);});
  text('Thuế suất '+new Prisma.Decimal(l.taxRate).mul(100).toFixed()+'%',cols[6]+4,y-25,6);y-=h;
 }
 if(y<115)next();y-=18;block('Tổng số liệu đã chuyển ('+data.currency+'): nội tệ '+money(data.totals.localAmount)+' · thuế '+money(data.totals.taxAmount)+' · WHT '+money(data.totals.whtAmount));
 block('Tổng phải trả theo hồ sơ: '+money(data.totals.payableAmount)+' '+data.currency,11);
 block('Bản in không duyệt đối soát hoặc tạo công nợ phải trả.',8);
 for(const [n,p] of doc.getPages().entries())p.drawText(String(n+1)+'/'+doc.getPageCount(),{x:right-25,y:20,size:7,font,color:black});
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
