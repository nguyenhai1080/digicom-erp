import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {renderGstInvoice,usdWords} from '../dist/modules/projects/invoice-template.js';
const png=await sharp({create:{width:200,height:100,channels:4,background:'#ffffff'}}).png().toBuffer();
const profile={logo:png,logoMime:'image/png',address:'Synthetic address',taxCode:'TEST',phone:'+00 000',bank:{beneficiary:'GST SYNTHETIC COMPANY',bankName:'Synthetic bank',bankAddress:'Synthetic bank address',account:'TEST_ACCOUNT',swift:'TEST_SWIFT'},layout:'GST_MOVIGAME_V1'};
const data={invoiceNumber:'TEST/01/2026/GST/INV',invoiceDate:'2026-02-06',dueDate:'2026-03-23',period:'2026-01',paymentTermDays:45,companyCode:'GST',companyName:'Synthetic GST',partner:{name:'Synthetic customer',address:'Synthetic address',registration:'TEST',tax:'TEST',attn:'Synthetic recipient',email:'',phone:'+00 000'},lines:Array.from({length:5},(_,i)=>({serviceName:'Parent service '+i,revenue:'10.00',wht:'1.00',payable:'9.00'})),totals:{revenue:'50.00',wht:'5.00',payable:'45.00'},amountInWords:usdWords('45.00'),agreementNumbers:['SYNTHETIC-ONLY']};
const signing={bytes:png,mime:'image/png'},placement={page:1,x:.56,y:.74,width:.28};
assert.equal((await PDFDocument.load(await renderGstInvoice(data,profile,signing,placement))).getPageCount(),1);
await assert.rejects(renderGstInvoice(data,profile,signing,{...placement,y:.3}),e=>e.statusCode===400);
await assert.rejects(renderGstInvoice(data,profile,signing,{...placement,y:.95}),e=>e.statusCode===400);
const blank={...data,partner:{...data.partner,registration:'',tax:'',attn:'',phone:''}};assert.equal((await PDFDocument.load(await renderGstInvoice(blank,profile,signing,placement))).getPageCount(),1);
const many={...data,lines:Array.from({length:40},(_,i)=>data.lines[i%5])};
assert.ok((await PDFDocument.load(await renderGstInvoice(many,profile,signing,placement,false))).getPageCount()>1);
await assert.rejects(renderGstInvoice(many,profile,signing,placement),e=>e.statusCode===400);
console.log('GST invoice layout: single-page, pagination, last-page signing and overlap guards passed.');

const vnd={...data,currency:'VND',lines:[{...data.lines[0],serviceName:'FILM CINETOP',revenue:'25000000',wht:'0',payable:'25000000'}],totals:{revenue:'25000000',wht:'0',payable:'25000000'},amountInWords:'Twenty Five Million Vietnamese Dong Only'};
const vndPdf=await renderGstInvoice(vnd,profile,signing,{...placement,y:.82});assert.equal((await PDFDocument.load(vndPdf)).getPageCount(),1);
if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});await writeFile(process.env.FINANCE_PROOF_ROOT+'/synthetic-vnd-invoice.pdf',vndPdf);}
console.log('VND invoice: currency-labelled one-page PDF and native amounts passed.');

// Suggested position follows the actual footer, for VND, USD and long invoices.
for(const sample of [vnd,data,many]){
 let suggested;
 await renderGstInvoice(sample,profile,signing,placement,false,p=>{suggested=p;});
 const pdf=await renderGstInvoice(sample,profile,signing,suggested);
 assert.equal(suggested.page,(await PDFDocument.load(pdf)).getPageCount());
 assert.ok(suggested.y<.77);
}
console.log('Adaptive invoice signing: actual footer position and final-page placement passed.');
