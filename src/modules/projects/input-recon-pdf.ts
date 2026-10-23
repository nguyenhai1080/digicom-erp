import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';

export type InputStatement={period:string;reconDate:string;fromDate:string;toDate:string;issuer:string;partner:string;partnerKey:string;contractNumber:string;outputPartners:string[];currency:string;fxRate:string;lines:{service:string;baseUsd:string;shareRate:string;cooperation:string;companyAmount:string;partnerAmount:string}[];totals:{baseUsd:string;cooperation:string;companyAmount:string;partnerAmount:string};amountInWords:string};
export async function renderInputStatement(data:InputStatement){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true});
 const width=841.89,height=595.28,left=28,right=814,span=right-left,black=rgb(.08,.08,.08),grey=rgb(.55,.55,.55);
 let page=doc.addPage([width,height]),y=height-30;
 const text=(s:string,x:number,yy:number,size=8)=>page.drawText(s,{x,y:yy,size,font,color:black});
 const measure=(s:string,size:number)=>font.widthOfTextAtSize(s,size);
 const wrap=(s:string,w:number,size=8)=>{const result:string[]=[];let line='';for(const word of s.replace(/[\r\n]+/g,' ').split(/\s+/)){if(!word)continue;const candidate=line?line+' '+word:word;if(measure(candidate,size)<=w){line=candidate;continue;}if(line){result.push(line);line='';}for(const c of word){if(measure(line+c,size)>w&&line){result.push(line);line='';}line+=c;}}if(line)result.push(line);return result.length?result:[''];};
 const next=()=>{if(doc.getPageCount()>=12)throw new CommandError(422,'Biên bản vượt 12 trang.');page=doc.addPage([width,height]);y=height-30;text('ĐỐI SOÁT ĐẦU VÀO · '+data.period+' · '+data.partnerKey+' · tiếp theo',left,y,10);y-=24;};
 const ensure=(h:number)=>{if(y-h<30)next();};
 const block=(s:string,size=8,center=false)=>{for(const line of wrap(s,span,size)){ensure(size+5);text(line,center?left+(span-measure(line,size))/2:left,y,size);y-=size+4;}};
 block('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',10,true);block('Độc lập - Tự do - Hạnh phúc',9,true);y-=6;
 block('BẢNG XÁC NHẬN SẢN LƯỢNG - DOANH THU',13,true);block('TRÊN MẠNG '+data.outputPartners.join(' / '),9,true);y-=4;
 block('Giữa Bên A: '+data.issuer+' và Bên B: '+data.partner);block('Theo hợp đồng hợp tác số: '+data.contractNumber);block('I - Thời gian: Từ ngày '+data.fromDate+' đến ngày '+data.toDate);block('II - Số liệu thống kê');y-=4;
 const cols=[left,53,205,270,335,453,516,579,697,right];
 const headings=['STT','Dịch vụ','Cơ sở (USD)','Tỷ giá','DT hợp tác ('+data.currency+')','Bên A %','Bên B %','Bên A ('+data.currency+')','Bên B ('+data.currency+')'];
 const grid=(top:number,bottom:number)=>{for(const x of cols)page.drawLine({start:{x,y:top},end:{x,y:bottom},thickness:.4,color:grey});for(const yy of [top,bottom])page.drawLine({start:{x:left,y:yy},end:{x:right,y:yy},thickness:.4,color:grey});};
 const heading=()=>{ensure(32);grid(y,y-30);for(const [i,h] of headings.entries())wrap(h,cols[i+1]-cols[i]-8,7).forEach((l,j)=>text(l,cols[i]+4,y-11-j*10,7));y-=30;};
 const money=(s:string,currency=data.currency)=>new Prisma.Decimal(s).toDecimalPlaces(currency==='VND'?0:2,Prisma.Decimal.ROUND_HALF_UP).toFixed(currency==='VND'?0:2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 heading();
 for(const [i,line] of data.lines.entries()){
  const names=wrap(line.service,cols[2]-cols[1]-8,8),rowHeight=Math.max(25,names.length*11+10);
  if(rowHeight>height-100)throw new CommandError(422,'Tên dịch vụ quá dài để in.');
  if(y-rowHeight<32){next();heading();}
  grid(y,y-rowHeight);names.forEach((s,j)=>text(s,cols[1]+4,y-12-j*11,8));
  const values=[String(i+1),'',money(line.baseUsd,'USD'),money(data.fxRate,'USD'),money(line.cooperation),new Prisma.Decimal(1).minus(line.shareRate).mul(100).toFixed(0)+'%',new Prisma.Decimal(line.shareRate).mul(100).toFixed(0)+'%',money(line.companyAmount),money(line.partnerAmount)];
  values.forEach((v,j)=>{if(j===1)return;if(measure(v,7)>cols[j+1]-cols[j]-8)throw new CommandError(422,'Số tiền quá dài để in; cần chia nhỏ biên bản.');text(v,j===0?cols[j]+4:cols[j+1]-measure(v,7)-4,y-14,7);});y-=rowHeight;
 }
 ensure(28);grid(y,y-25);text('Tổng cộng',cols[1]+4,y-15,8);[data.totals.baseUsd,data.totals.cooperation,data.totals.companyAmount,data.totals.partnerAmount].forEach((v,i)=>{const col=[2,4,7,8][i],s=money(v,i===0?'USD':data.currency);if(measure(s,7)>cols[col+1]-cols[col]-8)throw new CommandError(422,'Tổng tiền quá dài để in.');text(s,cols[col+1]-measure(s,7)-4,y-15,7);});y-=42;
 block('Tỷ giá ngày đối soát '+data.reconDate+': USD 1 = '+data.currency+' '+data.fxRate);
 block('Tổng số tiền Bên A phải trả cho '+data.partnerKey+': '+money(data.totals.partnerAmount)+' '+data.currency,10);
 block('Bằng chữ: '+data.amountInWords+'.');
 if(data.currency==='VND')block('Số hiển thị VND được làm tròn; công nợ giữ số tính theo đối soát đến hai chữ số thập phân.',7);
 block('Biên bản được lập thành 02 (hai) bản có giá trị như nhau, mỗi bên giữ 01 (một) bản.');ensure(65);y-=15;
 for(const [i,name] of [data.issuer,data.partner].entries())for(const [j,line] of wrap('ĐẠI DIỆN '+name,span/2-30,8).entries())text(line,left+i*span/2+10,y-j*12,8);
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
