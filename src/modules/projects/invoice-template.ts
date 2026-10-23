import AdmZip from 'adm-zip';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import {PDFDocument,rgb,StandardFonts} from 'pdf-lib';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
import {drawPlacement,image,type Placement} from './financial-documents.js';

const xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const decode=(v:string)=>v.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function readGstTemplate(bytes:Buffer){
 try{
  const zip=new AdmZip(bytes),book=zip.readAsText('xl/workbook.xml'),sheet=zip.readAsText('xl/worksheets/sheet1.xml'),strings=zip.readAsText('xl/sharedStrings.xml');
  if(/<!DOCTYPE|<!ENTITY/.test(book+sheet+strings)||!book.includes('Invoice Feb 2019')||sheet.length>2*1024*1024||strings.length>2*1024*1024)throw new Error();
  const shared=[...strings.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>decode(t[1])).join(''));
  function cell(ref:string){const c=sheet.match(new RegExp('<c\\b[^>]*r="'+ref+'"[^>]*>[\\s\\S]*?<\\/c>'))?.[0]??'',v=c.match(/<v>([\s\S]*?)<\/v>/)?.[1]??'';return (c.includes('t="s"')?shared[Number(v)]??'':decode(v)).replace(/^'/,'').trim();}
  if(!/GST/i.test(cell('B1'))||!cell('C22')||!cell('C23')||!cell('C25')||!cell('C26'))throw new Error();
  const logo=zip.getEntries().filter(e=>/^xl\/media\/.*\.(?:jpe?g|png)$/i.test(e.entryName));
  if(logo.length!==1||logo[0].header.size>5*1024*1024)throw new Error();
  return {issuerName:cell('B1'),address:cell('C2'),taxCode:cell('C3'),phone:cell('C4'),bank:{beneficiary:cell('C22'),bankName:cell('C23'),bankAddress:cell('C24'),account:cell('C25'),swift:cell('C26')},logo:logo[0].getData(),logoMime:/\.png$/i.test(logo[0].entryName)?'image/png':'image/jpeg',layout:'GST_MOVIGAME_V1' as const};
 }catch{throw new CommandError(409,'Template chưa khớp mẫu GST đã cung cấp (Invoice Feb 2019). Kiểm tra hoặc thay lại template GST gốc.');}
}
export type InvoiceLine={revenueId:string;serviceId:string;serviceName:string;groupServiceId:string;contractId:string;description:string;revenue:string;wht:string;payable:string;uploadId:string;lineNo:number};
export type InvoiceData={currency?:'USD'|'VND';invoiceNumber:string;invoiceDate:string;dueDate:string;period:string;paymentTermDays:number;companyName:string;companyCode:string;partner:{name:string;address:string;registration:string;tax:string;attn:string;email:string;phone?:string};lines:InvoiceLine[];totals:{revenue:string;wht:string;payable:string};amountInWords:string;agreementNumbers:string[]};
const D=(s:string)=>new Prisma.Decimal(s);
export function usdWords(amount:string){
 const small=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
 const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
 const part=(n:number):string=>n<20?small[n]:n<100?tens[Math.floor(n/10)]+(n%10?' '+small[n%10]:''):small[Math.floor(n/100)]+' Hundred'+(n%100?' '+part(n%100):'');
 const cents=D(amount).mul(100).toDecimalPlaces(0).toFixed(0),b=BigInt(cents),whole=b/100n;
 if(whole>999999999999999n)throw new CommandError(422,'Số tiền vượt giới hạn đọc bằng chữ.');
 let n=Number(whole),chunks:string[]=[];for(const scale of [[1e12,'Trillion'],[1e9,'Billion'],[1e6,'Million'],[1e3,'Thousand']] as const){const q=Math.floor(n/scale[0]);if(q){chunks.push(part(q)+' '+scale[1]);n%=scale[0];}}if(n||!chunks.length)chunks.push(part(n));return chunks.join(' ')+' US Dollars and '+part(Number(b%100n))+' Cents Only';
}
export function fillGstWorkbook(template:Buffer,data:InvoiceData){
 if(data.currency==='VND')return vndWorkbook(data);
 readGstTemplate(template);const zip=new AdmZip(template);let sheet=zip.readAsText('xl/worksheets/sheet1.xml');
 const values:Record<string,string|number>={B1:data.companyName,C6:data.invoiceNumber,C7:data.invoiceDate,C8:data.dueDate,C9:data.partner.name,C10:data.partner.address,C11:data.partner.registration,C12:data.partner.tax,C13:data.partner.attn,B14:'Under the Agreement No.: '+data.agreementNumbers.join('; '),C17:data.lines.map(l=>l.description).join('\n'),D17:D(data.totals.revenue).toFixed(2),D18:D(data.totals.wht).toFixed(2),D19:D(data.totals.payable).toFixed(2),C20:data.amountInWords,C27:data.invoiceNumber,D27:''};
 for(const [ref,value] of Object.entries(values)){
  const re=new RegExp('<c\\b[^>]*r="'+ref+'"[^>]*>[\\s\\S]*?<\\/c>'),old=sheet.match(re)?.[0];if(!old)throw new CommandError(409,'Template thiếu ô '+ref+'.');
  const style=old.match(/\bs="(\d+)"/)?.[1],c='<c r="'+ref+'"'+(style?' s="'+style+'"':'')+(['D17','D18','D19'].includes(ref)?'><v>'+String(value)+'</v>':' t="inlineStr"><is><t xml:space="preserve">'+xml(String(value))+'</t></is>')+'</c>';sheet=sheet.replace(re,c);
 }
 // Cached macro/formula values are replaced only for mapped live invoice cells.
 // All VBA, drawings, source sheets and unmodified package entries are retained.
 zip.updateFile('xl/worksheets/sheet1.xml',Buffer.from(sheet));return zip.toBuffer();
}
function vndWorkbook(data:InvoiceData){
 const zip=new AdmZip(),rows:(string|number)[][]=[[data.companyName],['INVOICE',data.invoiceNumber],['Currency','VND'],['Date',data.invoiceDate],['Due date',data.dueDate],['Partner',data.partner.name],['Address',data.partner.address],['Contract',data.agreementNumbers.join('; ')],[],['No.','Service / Period','Revenue VND','Deduction VND','Payable VND'],...data.lines.map((l,i)=>[i+1,l.description,Number(l.revenue),Number(l.wht),Number(l.payable)]),['Total','',Number(data.totals.revenue),Number(data.totals.wht),Number(data.totals.payable)],[data.amountInWords]];
 zip.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
 zip.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'));
 zip.addFile('xl/workbook.xml',Buffer.from('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoice VND" sheetId="1" r:id="rId1"/></sheets></workbook>'));
 zip.addFile('xl/_rels/workbook.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'));
 const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="65" customWidth="1"/><col min="3" max="5" width="25" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'"'+(typeof v==='number'?'><v>'+v+'</v>':' t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is>')+'</c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
 zip.addFile('xl/worksheets/sheet1.xml',Buffer.from(sheet));return zip.toBuffer();
}
export async function renderGstInvoice(data:InvoiceData,template:ReturnType<typeof readGstTemplate>,signing:{bytes:Buffer;mime:string|null},placement:Placement,includeSigning=true,onLayout?:(placement:Placement)=>void){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const unicode=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true});
 const regular=await doc.embedFont(StandardFonts.TimesRoman),bold=await doc.embedFont(StandardFonts.TimesRomanBold),italic=await doc.embedFont(StandardFonts.TimesRomanItalic);
 const pick=(s:string,f=regular)=>{try{f.encodeText(s);return f;}catch{return unicode;}};
 let page=doc.addPage([595.28,841.89]);const left=31,right=563,width=right-left,ink=rgb(.16,.18,.21),accent=rgb(.12,.29,.46),tint=rgb(.965,.972,.98),border=rgb(.72,.76,.80);
 const text=(s:string,x:number,y:number,size=7.5,f=regular,color=ink)=>page.drawText(s,{x,y,size,font:pick(s,f),color});
 const measure=(s:string,size=7.5,f=regular)=>pick(s,f).widthOfTextAtSize(s,size);
 const wrap=(s:string,w:number,size=7.5,f=regular)=>{const out:string[]=[];let line='';for(const word of s.replace(/\s+/g,' ').trim().split(' ')){if(measure((line?line+' ':'')+word,size,f)>w&&line){out.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)out.push(line);return out;};
 const block=(s:string,x:number,y:number,w:number,size=7.5,f=regular,color=ink)=>{const lines=wrap(s,w,size,f);if(!lines.length)lines.push('');for(const line of lines){text(line,x,y,size,f,color);y-=size+3;}return y;};
 const rule=(y:number,weight=.4,color=border)=>page.drawLine({start:{x:left,y},end:{x:right,y},thickness:weight,color});
 const money=(s:string)=>D(s).toFixed(data.currency==='VND'?0:2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const date=(s:string)=>s.split('-').reverse().join('/');
 const logo=await image(doc,template.logo,template.logoMime),ld=logo.scaleToFit(130,52);page.drawImage(logo,{x:right-ld.width,y:800-ld.height,width:ld.width,height:ld.height});
 let y=block(template.bank.beneficiary,left+2,792,430,12,regular,accent);
 const field=(label:string,value:string)=>{text(label,left+2,y,7.5,bold);const valueX=left+Math.max(77,measure(label,7.5,bold)+6);y=block(value,valueX,y,right-valueX,7.5)-2;};
 field('Address:',template.address);field('Tax Registration:',template.taxCode.replace(/^'/,''));field('Tel:',template.phone.replace(/'/g,''));
 text('INVOICE',(595.28-measure('INVOICE',22))/2,720,22,regular,ink);
 // Use font metrics to center each baseline within its row, including descenders.
 const rowBaseline=(top:number,height:number,size:number,font=regular)=>{const ascent=font.heightAtSize(size,{descender:false}),descent=font.heightAtSize(size)-ascent;return top-height/2-(ascent-descent)/2;};
 const metadataRow=(label:string,value:string,height:number,size=8,valueFont=regular,color=ink)=>{
  text(label,left+8,rowBaseline(y,height,8,bold),8,bold);
  text(value,left+100,rowBaseline(y,height,size,valueFont),size,valueFont,color);
  y-=height;rule(y,.5);
 };
 y=702;page.drawRectangle({x:left,y:y-24,width,height:24,color:tint});rule(y,.8,accent);
 metadataRow('No.:',data.invoiceNumber,24,11,bold,accent);
 metadataRow('DATE',date(data.invoiceDate),16);
 metadataRow('PAYMENT DUE BY:',date(data.dueDate),16);
 y-=13;field('TO:',data.partner.name.toUpperCase());field('Address:',data.partner.address);field('Business Registration:',data.partner.registration);field('Tax Registration:',data.partner.tax);field('Attention:',data.partner.attn);field('Tel:',data.partner.phone??'');field('Contract No:',data.agreementNumbers.join('; '));y-=12;
 const cols=data.currency==='VND'?[left,left+26,left+304,left+390,left+442,right]:[left,left+32,left+362,left+416,left+474,right];
 const center=(s:string,a:number,b:number,yy:number,size=7.5,f=bold,color=ink)=>text(s,(a+b-measure(s,size,f))/2,yy,size,f,color);
 const heading=()=>{rule(y,.8,accent);y-=13;for(const [i,t] of ['No.','DESCRIPTION',data.currency==='VND'?'AMOUNT (VND)':'AMOUNT',data.currency==='VND'?'DEDUCTION':'TAX',data.currency==='VND'?'TOTAL (VND)':'TOTAL'].entries()){if(i===1)text(t,cols[i]+7,y,7.5,bold);else center(t,cols[i],cols[i+1],y);}y-=7;rule(y);page.drawRectangle({x:left,y:y-19,width,height:19,color:tint});center('A',cols[2],cols[3],y-13,7.5,regular);center(data.currency==='VND'?'Deduction':'B=A*10%',cols[3],cols[4],y-13,7.5,regular);center('C=A-B',cols[4],cols[5],y-13,7.5,regular);y-=19;};
 heading();
 const monthName=new Date(data.period+'-01T00:00:00Z').toLocaleString('en-US',{month:'long',timeZone:'UTC'})+' '+data.period.slice(0,4);
 for(const [index,line] of data.lines.entries()){
  const desc=wrap('Sharing revenue for '+line.serviceName+' in '+monthName,cols[2]-cols[1]-12,7.5,regular),height=Math.max(19,desc.length*10.5+8);
  if(y-height<300){page=doc.addPage([595.28,841.89]);text('INVOICE '+data.invoiceNumber+' - continued',left,794,12);y=772;heading();}
  if(index%2===1)page.drawRectangle({x:left,y:y-height,width,height,color:tint});
  center(String(index+1),cols[0],cols[1],y-12,7.5,regular);desc.forEach((d,i)=>text(d,cols[1]+7,y-12-i*10.5,7.5,regular));
  [line.revenue,line.wht,line.payable].forEach((v,i)=>center(money(v),cols[i+2],cols[i+3],y-12,7.5,regular));y-=height;
 }
 const banks=data.currency==='VND'?[['Payment Reference:',data.invoiceNumber]]:[['Name of Beneficiary:',template.bank.beneficiary],['Name of Bank:',template.bank.bankName],['Address of Bank:',template.bank.bankAddress],['Account Number:',template.bank.account.replace(/^'/,'')],['SWIFT Code',template.bank.swift],['Payment Reference:',data.invoiceNumber]];
 const words='In word: '+data.amountInWords;
 const footerHeight=45+wrap(words,width-8,7.5,italic).length*10.5+banks.reduce((n,[,value])=>n+Math.max(1,wrap(value,width-77,7.5).length)*10.5+3,0)+22;
 if(y-footerHeight<140){page=doc.addPage([595.28,841.89]);text('INVOICE '+data.invoiceNumber+' - totals and payment details',left,794,12);y=771;}
 rule(y,.8,accent);page.drawRectangle({x:cols[2],y:y-19,width:right-cols[2],height:19,color:tint});
 text('The remaining amount ('+(data.currency??'USD')+')',cols[2]-measure('The remaining amount ('+(data.currency??'USD')+')',7.5,bold)-3,y-12,7.5,bold,accent);
 [data.totals.revenue,data.totals.wht,data.totals.payable].forEach((v,i)=>center(money(v),cols[i+2],cols[i+3],y-12,7.5,bold));y-=28;
 for(const line of wrap(words,width-8,7.5,italic)){center(line,left,right,y,7.5,italic,ink);y-=10.5;}
 rule(y+5,.6);text('PAYMENT DETAILS',left+2,y-4,8.5,bold,accent);y-=18;
 for(const [label,value] of banks){text(label,left+2,y,7.5,bold);y=block(value,left+77,y,width-77,7.5)-3;}
 rule(y+4);
 // Start the signature block directly below the payment footer. Derive this
 // from actual wrapped text and the final page, rather than a fixed 77%.
 const last=doc.getPage(doc.getPageCount()-1);
 onLayout?.({page:doc.getPageCount(),x:.56,y:(last.getHeight()-y+34)/last.getHeight(),width:.28});
 if(doc.getPageCount()>12)throw new CommandError(422,'Invoice vượt giới hạn 12 trang. Tách theo dịch vụ.');
 if(placement.page>doc.getPageCount())throw new CommandError(400,'Trang ký Invoice không tồn tại.');
 const signaturePage=doc.getPage(doc.getPageCount()-1),signatureLabel='For and on behalf of GST',signatureLabelSize=8.5;
 signaturePage.drawText(signatureLabel,{x:(placement.x+placement.width/2)*signaturePage.getWidth()-measure(signatureLabel,signatureLabelSize)/2,y:signaturePage.getHeight()*(1-placement.y)+4,size:signatureLabelSize,font:regular,color:accent});
 if(includeSigning){const sign=await image(doc,signing.bytes,signing.mime),target=doc.getPage(placement.page-1),top=placement.y*target.getHeight(),bottom=top+placement.width*target.getWidth()*sign.height/sign.width;
  // The last page owns the payment block; do not sign over any invoice content.
  if(placement.page===doc.getPageCount()&&top<target.getHeight()-y+33)throw new CommandError(400,'Ảnh ký đè lên nội dung Invoice. Di chuyển ảnh xuống dưới phần thanh toán.');
  if(placement.page<doc.getPageCount())throw new CommandError(400,'Chọn trang cuối có phần thanh toán để ký Invoice.');
  if(bottom>target.getHeight()-15)throw new CommandError(400,'Ảnh ký nằm ngoài vùng cuối trang. Giảm kích thước ảnh.');
  drawPlacement(target,sign,placement);
 }
 doc.setTitle('Invoice '+data.invoiceNumber);return Buffer.from(await doc.save({useObjectStreams:false}));
}
