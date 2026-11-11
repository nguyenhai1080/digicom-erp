import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
import {image,drawPlacement,type Placement} from './financial-documents.js';
import type {InvoiceData} from './invoice-template.js';
import type {DgcInvoiceProfile} from './dgc-invoice-profile.js';
type Picture={bytes:Buffer;mime:string|null};
export type DgcPictures={logo:Picture;signing:Picture};
export type DgcSigningArea={page:number;top:number;bottom:number;pageWidth:number;pageHeight:number;imageWidth:number;imageHeight:number};

// Owner reference: Movtv INV 08 2026.pdf (11 Nov 2026). Presentation only.
// Retain pagination for long invoices; never clip source lines to fit one page.
export async function renderDgcInvoice(data:InvoiceData,profile:DgcInvoiceProfile,pictures:DgcPictures,placement?:Placement,includeSigning=true,onLayout?:(value:Placement,area?:DgcSigningArea)=>void,layoutOnly=false){
 if(data.companyCode!=='DGC'||!['USD','VND'].includes(data.currency??'USD'))throw new CommandError(409,'Mẫu Invoice DGC chỉ dùng cho DGC và USD/VND.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const unicode=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true}),regular=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/LiberationSans-Regular.ttf',import.meta.url))),{subset:true}),bold=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/LiberationSans-Bold.ttf',import.meta.url))),{subset:true});
 const black=rgb(.067,.067,.067),blue=rgb(.09,.23,.40),grey=rgb(.83,.83,.83),width=595.28,height=841.89,left=39.7,right=555.6,span=right-left;
 let page=doc.addPage([width,height]),y=0;
 const pick=(s:string,strong=false)=>{const f=strong?bold:regular;try{f.encodeText(s);return f;}catch{return unicode;}};
 const measure=(s:string,size=8.25,strong=false)=>pick(s,strong).widthOfTextAtSize(s,size);
 // Coordinates below use distance from the top, matching the owner's PDF.
 const text=(s:string,x:number,top:number,size=8.25,strong=false,color=black)=>page.drawText(s,{x,y:height-top-size*.8,size,font:pick(s,strong),color});
 const rule=(top:number,color=grey,x1=left,x2=right)=>page.drawLine({start:{x:x1,y:height-top},end:{x:x2,y:height-top},color,thickness:.5});
 const wrap=(s:string,w=span,size=8.25,strong=false)=>{const lines:string[]=[];for(const paragraph of s.replace(/\r/g,'').split('\n')){let line='';for(const token of paragraph.split(/(\s+)/)){if(!token.trim()){if(line&&!line.endsWith(' '))line+=' ';continue;}if(line&&measure(line+token,size,strong)>w){lines.push(line.trimEnd());line='';}for(const char of token){if(measure(line+char,size,strong)>w&&line){lines.push(line.trimEnd());line='';}line+=char;}}lines.push(line.trimEnd());}return lines;};
 const next=()=>{if(doc.getPageCount()>=12)throw new CommandError(422,'Invoice vượt giới hạn 12 trang.');page=doc.addPage([width,height]);text('INVOICE '+data.invoiceNumber+' - continued',left,40,12,true,blue);y=70;};
 const ensure=(needed:number)=>{if(y+needed>790)next();};
 const block=(s:string,size=8.25,strong=false,lineHeight=12)=>{for(const line of wrap(s,span,size,strong)){ensure(lineHeight);text(line,left,y,size,strong);y+=lineHeight;}};
 const date=(s:string)=>{const [yr,m,d]=s.split('-').map(Number);return d+'/'+m+'/'+yr;};
 const currency=data.currency??'USD',digits=currency==='VND'?0:2,money=(v:string)=>new Prisma.Decimal(v).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const logo=await image(doc,pictures.logo.bytes,pictures.logo.mime),ls=logo.scaleToFit(165,54);
 page.drawImage(logo,{x:left,y:height-51-ls.height,width:ls.width,height:ls.height});text('INVOICE',right-measure('INVOICE',19.5,true),51.3,19.5,true);
 const metadata=(entries:[string,string][],x:number,valueX:number,step:number)=>{let top=107.3;for(const [label,value] of entries){text(label,x,top,8.25,true);const lines=wrap(value,(x<300?290:right)-valueX,8.25,label==='Total payable:');for(const line of lines){text(line,valueX,top,8.25,label==='Total payable:');top+=step;} }return top;};
 const end=new Date(Date.UTC(Number(data.period.slice(0,4)),Number(data.period.slice(5,7)),0)).toISOString().slice(0,10);
 const metaLeft=metadata([['Number:',data.invoiceNumber],['Date:',date(data.invoiceDate)],['Billing period:',date(data.period+'-01')+' to '+date(end)],['Payment term:',data.paymentTermDays+' days from billing date'],['Payment due date:',date(data.dueDate)]],42.7,138.7,13.5);
 const metaRight=metadata([['Currency:',currency],['Partner:',data.partner.name],['Revenue month:',data.period],['Total payable:',money(data.totals.payable)+' '+currency]],307.4,403.4,17);
 const partyTop=Math.max(182,metaLeft+7,metaRight+7),boxWidth=250.5,gap=14.2;
 const parties=[{title:'From: '+profile.issuerName,rows:['Add: '+profile.address,'Tel: '+profile.phone+' Fax: '+profile.fax,'Email: '+profile.email,'Web: '+profile.website,...(profile.taxCode?['Tax Registration: '+profile.taxCode]:[])]},{title:'To: '+data.partner.name,rows:['Add: '+data.partner.address,'Business Registration No: '+data.partner.registration,'Tax Registration: '+data.partner.tax,'Att: '+data.partner.attn,'Email: '+data.partner.email]}];
 const prepared=parties.map(p=>({title:wrap(p.title,boxWidth-15,9.75,true),rows:p.rows.flatMap(s=>wrap(s,boxWidth-15))}));
 const boxHeight=Math.max(98.5,...prepared.map(p=>p.title.length*12+12+p.rows.length*9+10));
 if(partyTop+boxHeight>700)throw new CommandError(422,'Thông tin pháp nhân Invoice quá dài.');
 prepared.forEach((p,n)=>{const x=left+n*(boxWidth+gap);page.drawRectangle({x,y:height-partyTop-boxHeight,width:boxWidth,height:boxHeight,borderColor:grey,borderWidth:.6});let top=partyTop+8;p.title.forEach(s=>{text(s,x+7.5,top,9.75,true,blue);top+=12;});top+=3;p.rows.forEach(s=>{text(s,x+7.5,top);top+=9;});});
 y=partyTop+boxHeight+12;
 const cols=[left,left+37.5,left+263.3,left+322.5,left+417.8,right];
 const center=(s:string,a:number,b:number,top:number,size=8.25,strong=false)=>text(s,(a+b-measure(s,size,strong))/2,top,size,strong);
 const grid=(top:number,bottom:number,start=0)=>{rule(top,black);rule(bottom,black);for(const x of cols.filter((_,i)=>i!==1||start===0))page.drawLine({start:{x,y:height-top},end:{x,y:height-bottom},color:black,thickness:.5});};
 const heading=()=>{ensure(30);const top=y;grid(top,top+30);[['No'],['Description'],['Revenue','('+currency+')'],['Withholding tax',...(currency==='USD'?['(10%)']:['/ deduction'])],['Payable amount','('+currency+')']].forEach((lines,n)=>lines.forEach((s,i)=>center(s,cols[n],cols[n+1],top+(lines.length===1?11:6)+i*9,8.25,true)));y+=30;};
 heading();
 for(const [i,line] of data.lines.entries()){
  const parts=wrap(line.description,cols[2]-cols[1]-10),rowHeight=Math.max(20.25,parts.length*10+9);
  if(rowHeight>650)throw new CommandError(422,'Mô tả dòng Invoice quá dài.');
  if(y+rowHeight>735){next();heading();}
  const top=y;grid(top,top+rowHeight);center(String(i+1),cols[0],cols[1],top+7);parts.forEach((s,n)=>text(s,cols[1]+5,top+7+n*10));
  [line.revenue,line.wht,line.payable].forEach((v,n)=>{const m=money(v);if(measure(m)>cols[n+3]-cols[n+2]-10)throw new CommandError(422,'Số tiền Invoice vượt khổ cột.');text(m,cols[n+3]-5-measure(m),top+7);});y+=rowHeight;
 }
 const words='Amount in words: '+data.amountInWords.replace(/\.\/\.$/,'')+'./.';
 const bank=['Please make payment to:','Beneficiary: '+profile.bank.beneficiary,'Bank account number: '+profile.bank.account,'Bank name: '+profile.bank.bankName,'Bank address: '+profile.bank.bankAddress,'SWIFT code: '+profile.bank.swift];
 const signing=await image(doc,pictures.signing.bytes,pictures.signing.mime);
 const signingWidth=.26,markHeight=signingWidth*width*signing.height/signing.width;
 const footerHeight=20.25+11+wrap(words,span,8.25,true).length*12+11+bank.reduce((n,s)=>n+wrap(s).length*12,0)+51+markHeight;
 if(footerHeight>700)throw new CommandError(422,'Thông tin thanh toán hoặc ảnh ký quá dài.');
 ensure(footerHeight);
 grid(y,y+20.25,1);center('Total ('+currency+')',cols[0],cols[2],y+7,8.25,true);
 [data.totals.revenue,data.totals.wht,data.totals.payable].forEach((v,n)=>{const m=money(v);if(measure(m,8.25,true)>cols[n+3]-cols[n+2]-10)throw new CommandError(422,'Tổng tiền Invoice vượt khổ cột.');text(m,cols[n+3]-5-measure(m,8.25,true),y+7,8.25,true);});y+=31.25;
 block(words,8.25,true);y+=11;bank.forEach((s,i)=>block(s,8.25,i===0));const paymentBottom=y;y+=24;
 text('Thank you for your business!',right-measure('Thank you for your business!'),y);const footerTop=y+15;
 const suggested:Placement={page:doc.getPageCount(),x:.92-signingWidth,y:footerTop/height,width:signingWidth};
 // The allowed area starts after the actual bank text, not after the
 // decorative thank-you line and the extra default-placement spacing.
 const signingArea:DgcSigningArea={page:doc.getPageCount(),top:paymentBottom/height,bottom:790/height,pageWidth:width,pageHeight:height,imageWidth:signing.width,imageHeight:signing.height};
 onLayout?.(suggested,signingArea);const position=placement??suggested,top=position.y*height,bottom=top+position.width*width*signing.height/signing.width;
 if(position.page!==doc.getPageCount())throw new CommandError(400,'Ảnh ghép cần nằm ở trang cuối của Invoice. Mở lại Preview để chọn đúng trang ký.');
 if(top<paymentBottom-.01)throw new CommandError(400,'Ảnh ghép đang lấn lên thông tin thanh toán. Di chuyển ảnh xuống vùng ký.');
 if(bottom>790+.01)throw new CommandError(400,'Ảnh ghép vượt quá vùng ký cuối trang. Di chuyển ảnh lên hoặc giảm kích thước.');
 if(position.x<0||(position.x+position.width)*width>width+.001)throw new CommandError(400,'Ảnh ghép vượt ra ngoài lề trang Invoice.');
 if(includeSigning)drawPlacement(page,signing,position);
 // Physical source PDFs remain immutable. This footer uses configured issuer fields.
 for(const p of doc.getPages()){page=p;rule(807);const footer=['Head Office: '+profile.address.replace(/\s+/g,' ')+'. Tel: '+profile.phone+'; Fax: '+profile.fax,'Email: '+profile.email+' Website: '+profile.website].flatMap(s=>wrap(s,span,6.75));if(footer.length>3)throw new CommandError(422,'Địa chỉ chân trang Invoice quá dài.');footer.forEach((s,i)=>text(s,left,813+i*7.5,6.75));}
 doc.setTitle('Digicom Invoice '+data.invoiceNumber);return layoutOnly?Buffer.alloc(0):Buffer.from(await doc.save({useObjectStreams:false}));
}
