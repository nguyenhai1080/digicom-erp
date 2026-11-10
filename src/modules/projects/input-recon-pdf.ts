import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';

export type InputStatement={period:string;reconDate:string;fromDate:string;toDate:string;issuer:string;partner:string;partnerKey:string;contractNumber:string;outputPartners:string[];outputNetworks?:string[];currency:string;fxRate:string;lines:{service:string;baseUsd:string;shareRate:string;cooperation:string;companyAmount:string;partnerAmount:string}[];totals:{baseUsd:string;cooperation:string;companyAmount:string;partnerAmount:string};amountInWords:string;deductions?:string};

// Owner's supplied form: US Letter landscape, eight columns, merged group headings.
// Liberation Serif is a redistributable Times-compatible font (license bundled).
export async function renderInputStatement(data:InputStatement){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const fonts=await Promise.all(['Regular','Bold','BoldItalic'].map(async style=>doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/LiberationSerif-'+style+'.ttf',import.meta.url))),{subset:true})));
 const [regular,bold,boldItalic]=fonts,width=792,height=612,left=65.34,right=710.56,span=right-left,center=(left+right)/2,black=rgb(0,0,0),size=11.04,lineHeight=14.64;
 const cols=[left,174.32,266.99,340.43,433.09,493.93,554.77,632.68,right];
 let page=doc.addPage([width,height]),y=0;
 const date=(v:string)=>v.split('-').reverse().join('/');
 const measure=(s:string,font=regular,sz=size)=>font.widthOfTextAtSize(s,sz);
 const text=(s:string,x:number,baseline:number,font=regular,sz=size)=>page.drawText(s,{x,y:height-baseline,size:sz,font,color:black});
 const wrap=(value:string,w:number,font=regular,sz=size)=>{
  const result:string[]=[];let line='';
  for(const word of value.replace(/[\r\n]+/g,' ').split(/\s+/)){
   if(!word)continue;const candidate=line?line+' '+word:word;
   if(measure(candidate,font,sz)<=w){line=candidate;continue;}
   if(line){result.push(line);line='';}
   for(const c of word){if(measure(line+c,font,sz)>w&&line){result.push(line);line='';}line+=c;}
  }
  if(line)result.push(line);return result.length?result:[''];
 };
 const rule=(x1:number,top1:number,x2:number,top2:number)=>page.drawLine({start:{x:x1,y:height-top1},end:{x:x2,y:height-top2},thickness:.6,color:black});
 const next=()=>{
  if(doc.getPageCount()>=12)throw new CommandError(422,'Biên bản vượt 12 trang.');
  page=doc.addPage([width,height]);text('BẢNG XÁC NHẬN SẢN LƯỢNG - DOANH THU',center-measure('BẢNG XÁC NHẬN SẢN LƯỢNG - DOANH THU',bold)/2,35,bold);
  const subtitle=data.period+' - '+data.partnerKey+' - tiếp theo';text(subtitle,center-measure(subtitle)/2,50);y=62;
 };
 const block=(value:string,font=regular,sz=size,centered=false)=>{
  for(const line of wrap(value,span,font,sz)){if(y>565)next();text(line,centered?center-measure(line,font,sz)/2:left+1.86,y,font,sz);y+=lineHeight;}
 };
 const party=(name:string,key:string)=>{const trimmed=name.trim(),suffix='('+key.toUpperCase()+')';return trimmed.toUpperCase().endsWith(suffix)?trimmed.slice(0,-suffix.length).trim():trimmed;};
 const issuer=party(data.issuer,'DIGICOM'),partner=party(data.partner,data.partnerKey);
 y=66.8;block('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',bold,size,true);
 y=80.84;block('Độc lập - Tự do - Hạnh phúc',bold,size,true);
 y=94.88;block('-----***-----',regular,size,true);
 y=123.5;block('BẢNG XÁC NHẬN SẢN LƯỢNG - DOANH THU',bold,12.96,true);
 y=140.2;
 const serviceNames=data.lines.map(l=>l.service.toUpperCase()),titleNames=serviceNames.length===3&&['MCA','VOICEMAIL','ISIGN'].every(n=>serviceNames.includes(n))?['MCA','VOICEMAIL','ISIGN']:serviceNames;
 const services=titleNames.length<=5?titleNames.join(' AND '):titleNames.length+' DỊCH VỤ';
 block('DỊCH VỤ '+services+' TRÊN MẠNG DI ĐỘNG '+(data.outputNetworks??data.outputPartners).join(' / ').toUpperCase(),bold,12.96,true);
 y=Math.max(164.64,y+9.8);
 block('Giữa Bên A là '+issuer+' (DIGICOM) và Bên B là '+partner+' ('+data.partnerKey+')');
 block('Theo Hợp đồng hợp tác số '+data.contractNumber+'.');
 block('I - Thời gian: Từ ngày '+date(data.fromDate)+' đến ngày '+date(data.toDate));
 block('II - Số liệu thống kê');y-=11.2;
 const cell=(value:string,start:number,end:number,top:number,bottom:number,font=regular,align:'center'|'right'='center',sz=size,padding=8)=>{
  const lines=value.split('\n').flatMap(line=>wrap(line,end-start-padding,font,sz)),step=13.92;
  const baseline=(top+bottom)/2-(lines.length-1)*step/2+sz*.34;
  lines.forEach((line,n)=>text(line,align==='right'?end-5-measure(line,font,sz):(start+end-measure(line,font,sz))/2,baseline+n*step,font,sz));
 };
 const header=()=>{
  const first=['Dịch vụ','Doanh thu bên A\nnhận được từ\n'+data.outputPartners.join(' / ')+' (USD)','Tỷ giá','Doanh thu hợp tác\n('+(data.currency==='VND'?'VNĐ':data.currency)+')'];
  const subHeaders=['DIGICOM',data.partnerKey,'DIGICOM',data.partnerKey];
  const headHeight=Math.max(48.12,...first.map((v,n)=>v.split('\n').flatMap(line=>wrap(line,cols[n+1]-cols[n]-2,bold)).length*13.92+6),...subHeaders.map((v,n)=>19.32+wrap(v,cols[n+5]-cols[n+4]-8,bold).length*13.92+6));
  if(headHeight>420)throw new CommandError(422,'Tiêu đề bảng quá dài để in.');
  if(y+headHeight+37>565)next();
  const top=y,bottom=y+headHeight,split=top+19.32;
  rule(left,top,right,top);rule(left,bottom,right,bottom);
  for(const n of [0,1,2,3,4,6,8])rule(cols[n],top,cols[n],bottom);
  for(const n of [5,7])rule(cols[n],split,cols[n],bottom);
  rule(cols[4],split,right,split);
  first.forEach((v,n)=>cell(v,cols[n],cols[n+1],top,bottom,bold,'center',size,2));
  cell('Tỷ lệ chia sẻ',cols[4],cols[6],top,split,bold);
  cell('Số tiền được hưởng ('+(data.currency==='VND'?'VNĐ':data.currency)+')',cols[6],cols[8],top,split,bold);
  for(const [n,v] of subHeaders.entries())cell(v,cols[n+4],cols[n+5],split,bottom,bold);
  y=bottom;
  // Printed column indices/formulas are retained verbatim from the owner's form.
  // They are template labels only; all amounts are provided by the existing planner.
  const index=['1','3','4','5=3-4','6','7','8=5*6','9=5*7'];
  index.forEach((v,n)=>cell(v,cols[n],cols[n+1],y,y+14.04));
  for(const x of cols)rule(x,y,x,y+14.04);rule(left,y+14.04,right,y+14.04);y+=14.04;
 };
 const number=(value:string,decimals:number)=>new Prisma.Decimal(value).toDecimalPlaces(decimals,Prisma.Decimal.ROUND_HALF_UP).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const money=(v:string,currency=data.currency)=>number(v,currency==='VND'?0:2);
 const [fxInteger,fxFraction]=new Prisma.Decimal(data.fxRate).toFixed().split('.'),fx=fxInteger.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fxFraction?'.'+fxFraction:'');
 const row=(values:string[],rowHeight:number,font=regular)=>{
  values.forEach((v,n)=>{
   if(n!==0&&measure(v,font)>cols[n+1]-cols[n]-10)throw new CommandError(422,'Số tiền hoặc tỷ lệ quá dài để in; cần chia nhỏ biên bản.');
   cell(v,cols[n],cols[n+1],y,y+rowHeight,font,n===0||n===4||n===5?'center':'right');
  });
  for(const x of cols)rule(x,y,x,y+rowHeight);rule(left,y+rowHeight,right,y+rowHeight);y+=rowHeight;
 };
 header();
 for(const line of data.lines){
  const rowHeight=Math.max(22.68,wrap(line.service,cols[1]-cols[0]-8).length*13.92+6);
  if(rowHeight>420)throw new CommandError(422,'Tên dịch vụ quá dài để in.');
  if(y+rowHeight>565){next();header();}
  if(y+rowHeight>565)throw new CommandError(422,'Tên dịch vụ quá dài để in.');
  row([line.service,number(line.baseUsd,2),fx,money(line.cooperation),new Prisma.Decimal(1).minus(line.shareRate).mul(100).toFixed()+'%',new Prisma.Decimal(line.shareRate).mul(100).toFixed()+'%',money(line.companyAmount),money(line.partnerAmount)],rowHeight);
 }
 if(y+16.68>565){next();header();}
 row(['Tổng cộng',number(data.totals.baseUsd,2),'',money(data.totals.cooperation),'','',money(data.totals.companyAmount),money(data.totals.partnerAmount)],16.68,bold);
 const words='Bằng chữ: '+data.amountInWords.replace(/\.$/,'')+'.';
 const signatures=[issuer,partner].map((name,n)=>wrap('ĐẠI DIỆN '+name.toUpperCase(),n===0?280:260,bold));
 const reserve=105+wrap(words,span,boldItalic).length*lineHeight+Math.max(...signatures.map(v=>v.length))*lineHeight;
 if(reserve>height-90)throw new CommandError(422,'Nội dung cuối biên bản quá dài để in.');
 if(y+reserve>height-25)next();
 y+=12.2;
 block('Tỷ giá ngày đối soát '+date(data.reconDate)+': USD1 =      '+data.currency+' '+fx);
 const label='Tổng số tiền Digicom phải trả cho '+data.partnerKey+' bằng '+data.currency+' là: ';
 const amount=money(data.totals.partnerAmount)+(data.currency==='VND'?'đ':' '+data.currency);
 if(measure(label)+measure(amount,bold)<=span-4){text(label,left+1.86,y);text(amount,left+1.86+measure(label)+10,y,bold);y+=lineHeight;}
 else{block(label);block(amount,bold);}
 block(words,boldItalic);
 if(data.deductions&&new Prisma.Decimal(data.deductions).gt(0))block('Số phải trả đã trừ thuế/khấu trừ '+money(data.deductions)+' '+data.currency+'. Phần DIGICOM gồm khoản khấu trừ.',regular,9);
 block('Biên bản được lập thành 02 (hai) bản có giá trị như nhau, mỗi bên giữ 01 (một) bản');
 y+=14.64;
 signatures.forEach((lines,n)=>lines.forEach((line,i)=>{const cx=n===0?203.1:573.2;text(line,cx-measure(line,bold)/2,y+i*13.92,bold);}));
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
