import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
import {image,drawPlacement,placementSchema,type Placement} from './financial-documents.js';
import type {InvoiceData} from './invoice-template.js';
import type {DgcInvoiceProfile} from './dgc-invoice-profile.js';
export const dgcPlacementsSchema=z.object({stamp:placementSchema,signature:placementSchema}).strict();
export type DgcPlacements=z.infer<typeof dgcPlacementsSchema>;
type Picture={bytes:Buffer;mime:string|null};
export type DgcPictures={logo:Picture;stamp:Picture;signature:Picture};

// Source fields: deployed v61 41_Invoice_PDF DGC_renderInvoiceHtml_.
// Explicit adaptation: paginate long documents instead of the donor's hidden overflow.
export async function renderDgcInvoice(data:InvoiceData,profile:DgcInvoiceProfile,pictures:DgcPictures,placement?:DgcPlacements,includeSigning=true,onLayout?:(value:DgcPlacements)=>void){
 if(data.companyCode!=='DGC'||!['USD','VND'].includes(data.currency??'USD'))throw new CommandError(409,'Mẫu Invoice DGC chỉ dùng cho DGC và USD/VND.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true}),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const orange=rgb(.95,.43,.13),blue=rgb(.09,.23,.40),grey=rgb(.9,.91,.93),black=rgb(.08,.08,.08);
 const width=595.28,height=841.89,left=40,right=555,span=right-left;
 let page=doc.addPage([width,height]),y=790;
 const pick=(s:string,strong=false)=>{try{if(strong){bold.encodeText(s);return bold;}}catch{}return font;};
 const measure=(s:string,size=8,strong=false)=>pick(s,strong).widthOfTextAtSize(s,size);
 const text=(s:string,x:number,yy:number,size=8,strong=false,color=black)=>page.drawText(s,{x,y:yy,size,font:pick(s,strong),color});
 const rule=(yy:number,color=grey)=>page.drawLine({start:{x:left,y:yy},end:{x:right,y:yy},color,thickness:.7});
 const next=()=>{if(doc.getPageCount()>=12)throw new CommandError(422,'Invoice vượt giới hạn 12 trang.');page=doc.addPage([width,height]);y=790;text('INVOICE '+data.invoiceNumber+' - continued',left,y,12,true,blue);y-=28;};
 const ensure=(needed:number)=>{if(y-needed<45)next();};
 const wrap=(s:string,w=span,size=8,strong=false)=>{const lines:string[]=[];let line='';for(const token of s.replace(/\r/g,'').split(/(\s+)/)){if(!token.trim()){if(line&&!line.endsWith(' '))line+=' ';continue;}for(const char of token){if(measure(line+char,size,strong)>w&&line){lines.push(line.trimEnd());line='';}line+=char;}}if(line.trim())lines.push(line.trimEnd());return lines.length?lines:[''];};
 const block=(s:string,size=8,strong=false,color=black)=>{for(const line of wrap(s,span,size,strong)){ensure(size+5);text(line,left,y,size,strong,color);y-=size+3;}};
 const field=(label:string,value:string)=>block(label+': '+value);
 const logo=await image(doc,pictures.logo.bytes,pictures.logo.mime),logoSize=logo.scaleToFit(170,48);
 page.drawImage(logo,{x:left,y:y-logoSize.height,width:logoSize.width,height:logoSize.height});text('INVOICE',right-measure('INVOICE',24,true),y-28,24,true);y-=65;rule(y,orange);y-=22;
 field('Number',data.invoiceNumber);field('Date',data.invoiceDate);field('Billing period',data.period+'-01 to '+new Date(Date.UTC(Number(data.period.slice(0,4)),Number(data.period.slice(5,7)),0)).toISOString().slice(0,10));
 field('Payment term',data.paymentTermDays+' days from billing date');field('Payment due date',data.dueDate);field('Currency',data.currency??'USD');y-=6;
 block('From: '+profile.issuerName,10,true,blue);field('Address',profile.address);field('Tel / Fax',[profile.phone,profile.fax].filter(Boolean).join(' / '));field('Email',profile.email);field('Website',profile.website);if(profile.taxCode)field('Tax registration',profile.taxCode);y-=8;
 block('To: '+data.partner.name,10,true,blue);field('Address',data.partner.address);field('Business Registration No',data.partner.registration);field('Tax Registration',data.partner.tax);field('Attention',data.partner.attn);field('Email',data.partner.email);field('Contract No',data.agreementNumbers.join('; '));y-=10;
 const digits=data.currency==='VND'?0:2,money=(v:string)=>new Prisma.Decimal(v).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const cols=[left,left+25,left+295,left+365,left+435,right];
 const heading=()=>{ensure(28);rule(y,blue);y-=15;['No','Description','Revenue','WHT / deduction','Payable'].forEach((s,i)=>text(s,cols[i]+3,y,7,true));y-=11;rule(y);};
 heading();
 for(const [i,line] of data.lines.entries()){
  const parts=wrap(line.description,cols[2]-cols[1]-10,8),rowHeight=Math.max(23,parts.length*12+9);
  if(rowHeight>650)throw new CommandError(422,'Mô tả dòng Invoice quá dài.');
  if(y-rowHeight<55){next();heading();}
  text(String(i+1),cols[0]+3,y-14);parts.forEach((part,j)=>text(part,cols[1]+3,y-14-j*12));
  [line.revenue,line.wht,line.payable].forEach((v,j)=>{const m=money(v);if(measure(m,7.5)>cols[j+3]-cols[j+2]-8)throw new CommandError(422,'Số tiền Invoice vượt khổ cột.');text(m,cols[j+3]-4-measure(m,7.5),y-14,7.5);});
  y-=rowHeight;rule(y);
 }
 ensure(32);text('Total ('+(data.currency??'USD')+')',left+3,y-16,8,true);
 [data.totals.revenue,data.totals.wht,data.totals.payable].forEach((v,j)=>{const m=money(v);text(m,cols[j+3]-4-measure(m,7.5,true),y-16,7.5,true);});y-=34;
 block('Amount in words: '+data.amountInWords,8,true);y-=10;
 block('Please make payment to:',9,true,blue);
 field('Beneficiary',profile.bank.beneficiary);field('Bank account number',profile.bank.account);field('Bank name',profile.bank.bankName);field('Bank address',profile.bank.bankAddress);field('SWIFT code',profile.bank.swift);field('Payment reference',data.invoiceNumber);
 block('Thank you for your business!');
 const stamp=await image(doc,pictures.stamp.bytes,pictures.stamp.mime),signature=await image(doc,pictures.signature.bytes,pictures.signature.mime);
 const caption=[...wrap(profile.signatureName,span*.42,9,true).map(s=>({s,size:9,strong:true})),...wrap(profile.signatureTitle,span*.42,8).map(s=>({s,size:8,strong:false}))];
 const captionHeight=caption.reduce((n,line)=>n+line.size+4,0)+15;
 const space=Math.max(.16*width*stamp.height/stamp.width,.21*width*signature.height/signature.width)+captionHeight+35;
 if(space>650)throw new CommandError(422,'Ảnh ký quá cao so với trang Invoice.');ensure(space);
 const footerTop=height-y+15;
 const suggested:DgcPlacements={stamp:{page:doc.getPageCount(),x:.62,y:footerTop/height,width:.16},signature:{page:doc.getPageCount(),x:.69,y:footerTop/height,width:.21}};
 onLayout?.(suggested);const positions=placement??suggested;
 let bottom=footerTop;
 for(const [key,img] of [['stamp',stamp],['signature',signature]] as const){
  const p=positions[key],top=p.y*height,b=top+p.width*width*img.height/img.width;
  if(p.page!==doc.getPageCount()||top<footerTop-.01||b>height-captionHeight-15||p.x+p.width>1)throw new CommandError(400,'Dấu và chữ ký phải ở trang cuối, dưới thông tin thanh toán và trong khổ trang.');
  bottom=Math.max(bottom,b);if(includeSigning)drawPlacement(page,img,p);
 }
 let captionY=height-bottom-17;for(const line of caption){text(line.s,left+span*.58,captionY,line.size,line.strong);captionY-=line.size+4;}
 if(doc.getPageCount()>12)throw new CommandError(422,'Invoice vượt giới hạn 12 trang.');
 doc.setTitle('DGC Invoice '+data.invoiceNumber);return Buffer.from(await doc.save({useObjectStreams:false}));
}
