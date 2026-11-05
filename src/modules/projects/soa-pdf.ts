import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {Prisma} from '@erp/db';
import {z} from 'zod';
import {CommandError} from './commands.js';
import {image,drawPlacement,placementSchema} from './financial-documents.js';
import type {DgcInvoiceProfile} from './dgc-invoice-profile.js';

const position=placementSchema.omit({page:true});
export const soaPlacements=z.object({stamp:position,signature:position,title:position}).strict();
export const defaultSoaPlacements={stamp:{x:.690,y:.735,width:.155},signature:{x:.775,y:.700,width:.180},title:{x:.760,y:.835,width:.200}};
export type SoaData={number:string;asOf:string;currency:string;partner:{name:string;address:string;registration:string;tax:string;attn:string};lines:{id:string;invoiceNumber:string;invoiceDate:string;description:string;amount:string;paidAtCutoff:string;outstandingAtCutoff:string}[];totals:{amount:string;paidAtCutoff:string;outstandingAtCutoff:string}};
export type SoaPictures=Record<'logo'|'stamp'|'signature'|'title',{bytes:Buffer;mime:string|null}>;
// Fields and layout follow donor v61 52_StateOfAccount, with the owner's cutoff.
// Paginate rather than hiding overflow; keep signing on the final page only.
export async function renderSoa(data:SoaData,profile:DgcInvoiceProfile,pictures:SoaPictures,placements:z.infer<typeof soaPlacements>){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url))),{subset:true});
 const width=595.28,height=841.89,left=37,right=558,span=right-left,black=rgb(.07,.07,.07),grey=rgb(.65,.65,.65);
 let page=doc.addPage([width,height]),y=790;
 const text=(s:string,x:number,yy:number,size=8)=>page.drawText(s,{x,y:yy,size,font,color:black});
 const measure=(s:string,size=8)=>font.widthOfTextAtSize(s,size);
 const wrap=(s:string,w:number,size=8)=>{const out:string[]=[];let line='';for(const word of s.replace(/[\r\n]+/g,' ').split(/\s+/)){if(!word)continue;if(measure(line?line+' '+word:word,size)<=w){line=line?line+' '+word:word;continue;}if(line){out.push(line);line='';}for(const c of word){if(measure(line+c,size)>w&&line){out.push(line);line='';}line+=c;}}if(line)out.push(line);return out.length?out:[''];};
 const next=()=>{if(doc.getPageCount()>=100)throw new CommandError(422,'SOA vượt 100 trang; thu hẹp lựa chọn.');page=doc.addPage([width,height]);y=790;text('Statement of Account · '+data.number+' · '+data.currency,left,y,11);y-=25;};
 const ensure=(h:number)=>{if(y-h<65)next();};
 const block=(s:string,size=8)=>{for(const l of wrap(s,span,size)){ensure(size+5);text(l,left,y,size);y-=size+5;}};
 text('Statement of Account',left,y,19);
 const logo=await image(doc,pictures.logo.bytes,pictures.logo.mime),lw=Math.min(180,65*logo.width/logo.height),lh=lw*logo.height/logo.width;page.drawImage(logo,{x:right-lw,y:y+15-lh,width:lw,height:lh});y-=Math.max(45,lh+12);
 const column=(lines:string[],x:number,w:number)=>{let yy=y;for(const s of lines)for(const l of wrap(s,w,8)){if(yy<460)throw new CommandError(422,'Thông tin pháp nhân hoặc đối tác quá dài để in phần đầu SOA.');text(l,x,yy,8);yy-=12;}return yy;};
 y=Math.min(column(['To:',data.partner.name,data.partner.address,'Business Registration No: '+data.partner.registration,'Tax Registration: '+data.partner.tax,'Att: '+data.partner.attn],left,260),column([profile.issuerName,'Tel: '+profile.phone+' - Fax: '+profile.fax,'Email: '+profile.email,'Web: '+profile.website],325,233))-18;
 block('Date: '+data.asOf+'     Reference: '+data.number+'     Currency: '+data.currency,9);
 block('Our records show that the balance of your account with us is as follows:');y-=5;
 const cols=[left,92,192,342,414,486,right],headings=['Date','Ref.','Description','Amount','Payment','Remaining'];
 const grid=(top:number,bottom:number)=>{for(const x of cols)page.drawLine({start:{x,y:top},end:{x,y:bottom},color:grey,thickness:.4});for(const yy of [top,bottom])page.drawLine({start:{x:left,y:yy},end:{x:right,y:yy},color:grey,thickness:.4});};
 const heading=()=>{ensure(25);page.drawRectangle({x:left,y:y-25,width:span,height:25,color:rgb(.61,.70,.84)});grid(y,y-25);headings.forEach((s,i)=>text(s,cols[i]+4,y-16,8));y-=25;};
 // Format source USD style 1.234,56 without using floating-point conversion.
 const amount=(v:string)=>{const [whole,frac]=new Prisma.Decimal(v).toFixed(2).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+frac;};
 heading();
 for(const line of data.lines){
  const cells=[line.invoiceDate,line.invoiceNumber,line.description,amount(line.amount),amount(line.paidAtCutoff),amount(line.outstandingAtCutoff)],wrapped=cells.map((s,i)=>i<3?wrap(s,cols[i+1]-cols[i]-8,7):[s]);
  const h=Math.max(25,...wrapped.map(ls=>ls.length*10+8));if(h>650)throw new CommandError(422,'Nội dung Invoice quá dài để in SOA.');
  if(y-h<65){next();heading();}
  grid(y,y-h);wrapped.forEach((ls,i)=>ls.forEach((s,n)=>{if(i>=3&&measure(s,7)>cols[i+1]-cols[i]-8)throw new CommandError(422,'Số tiền quá dài để in SOA.');text(s,i>=3?cols[i+1]-measure(s,7)-4:cols[i]+4,y-12-n*10,7);}));y-=h;
 }
 // Reserve bank instructions and the final-page signing area below the table.
 if(y<500)next();
 y-=24;block('Total amount: '+amount(data.totals.amount)+' '+data.currency,10);block('Total payment: '+amount(data.totals.paidAtCutoff)+' '+data.currency,10);block('Total due: '+amount(data.totals.outstandingAtCutoff)+' '+data.currency,11);y-=10;
 block('Please make payment into:',9);
 for(const [label,value] of Object.entries({Beneficiary:profile.bank.beneficiary,'Account No':profile.bank.account,'Bank name':profile.bank.bankName,'Bank address':profile.bank.bankAddress,'SWIFT code':profile.bank.swift}))block(label+': '+value,8);
 block('Thank you for your business!',9);
 if(y<265)throw new CommandError(422,'Thông tin thanh toán quá dài, chạm vùng ký SOA.');
 for(const key of ['stamp','signature','title'] as const){const p=placements[key],pic=await image(doc,pictures[key].bytes,pictures[key].mime);if(p.y<.70||p.x<.05||p.x+p.width>.96||p.y*height+p.width*width*pic.height/pic.width>height-55)throw new CommandError(400,'Đặt dấu/chữ ký trong vùng ký ở cuối trang, phía trên chân trang.');drawPlacement(page,pic,{...p,page:doc.getPageCount()});}
 for(const [index,p] of doc.getPages().entries()){
  p.drawLine({start:{x:left,y:45},end:{x:right,y:45},color:grey,thickness:.5});
  const footer='Head Office: '+profile.address+' · Tel: '+profile.phone+' · '+profile.email+' · '+profile.website;
  const size=Math.min(6.5,(span-45)/Math.max(1,measure(footer,1)));p.drawText(footer,{x:left,y:32,size,font,color:black});p.drawText(String(index+1)+'/'+doc.getPageCount(),{x:right-25,y:20,size:7,font,color:black});
 }
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
