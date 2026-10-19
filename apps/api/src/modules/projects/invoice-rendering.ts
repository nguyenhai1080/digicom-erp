import AdmZip from 'adm-zip';
import type {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
import {asset,type Placement} from './financial-documents.js';
import {readGstTemplate,renderGstInvoice,fillGstWorkbook,type InvoiceData} from './invoice-template.js';
import {readDgcInvoiceProfile} from './dgc-invoice-profile.js';
import {renderDgcInvoice,type DgcPlacements} from './dgc-invoice-pdf.js';
const meta=(a:Awaited<ReturnType<typeof asset>>)=>({id:a.document.id,version:a.document.versionNo,checksum:a.document.attachment.checksumSha256});
export async function invoiceResources(tx:Prisma.TransactionClient,company:{id:string;companyCode:string}){
 if(company.companyCode==='DGC'){
  const config=await readDgcInvoiceProfile(tx,company.id),logo=await asset(tx,company.id,'COMPANY_LOGO'),stamp=await asset(tx,company.id,'COMPANY_STAMP'),signature=await asset(tx,company.id,'SIGNATURE');
  return {kind:'DGC' as const,config,logo,stamp,signature,metadata:{template:config.metadata,logo:meta(logo),stamp:meta(stamp),signature:meta(signature)},bank:config.profile.bank,layout:'DGC_V61_V1',workbookExtension:'xlsx' as const};
 }
 if(company.companyCode!=='GST')throw new CommandError(409,'Chưa có mẫu Invoice cho công ty này.');
 const template=await asset(tx,company.id,'INVOICE_TEMPLATE'),signing=await asset(tx,company.id,'SIGNING_COMPOSITE'),profile=readGstTemplate(template.bytes);
 return {kind:'GST' as const,template,signing,profile,metadata:{template:meta(template),signing:meta(signing)},bank:profile.bank,layout:profile.layout,workbookExtension:template.document.attachment.storedFilename.endsWith('.xlsm')?'xlsm' as const:'xlsx' as const};
}
type Resources=Awaited<ReturnType<typeof invoiceResources>>;
export function renderInvoice(data:InvoiceData,res:Resources,positions:{placement:Placement;dgcPlacement?:DgcPlacements},includeSigning=true,onLayout?:(p:Placement|DgcPlacements)=>void){
 if(res.kind==='GST')return renderGstInvoice(data,res.profile,{bytes:res.signing.bytes,mime:res.signing.document.attachment.mimeType},positions.placement,includeSigning,onLayout);
 if(includeSigning&&!positions.dgcPlacement)throw new CommandError(400,'Cần xác nhận vị trí dấu và chữ ký riêng cho Invoice DGC.');
 const picture=(a:typeof res.logo)=>({bytes:a.bytes,mime:a.document.attachment.mimeType});
 return renderDgcInvoice(data,res.config.profile,{logo:picture(res.logo),stamp:picture(res.stamp),signature:picture(res.signature)},positions.dgcPlacement,includeSigning,onLayout);
}
const xml=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export function invoiceWorkbook(data:InvoiceData,res:Resources){
 if(res.kind==='GST')return fillGstWorkbook(res.template.bytes,data);
 const p=res.config.profile,zip=new AdmZip();
 // Donor generates PDF, not an XLSM. This supplemental export preserves exact
 // decimal strings and never evaluates source formulas or VBA.
 const rows=[['DGC Invoice',data.invoiceNumber],['Date',data.invoiceDate],['Due date',data.dueDate],['Period',data.period],['Currency',data.currency??'USD'],['From',p.issuerName],['Address',p.address],['To',data.partner.name],['Address',data.partner.address],['Contract',data.agreementNumbers.join('; ')],['No','Description','Revenue','WHT / deduction','Payable'],...data.lines.map((l,i)=>[String(i+1),l.description,l.revenue,l.wht,l.payable]),['Total','',data.totals.revenue,data.totals.wht,data.totals.payable],['Amount in words',data.amountInWords],['Beneficiary',p.bank.beneficiary],['Account',p.bank.account],['Bank',p.bank.bankName],['Bank address',p.bank.bankAddress],['SWIFT',p.bank.swift]];
 zip.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
 zip.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'));
 zip.addFile('xl/workbook.xml',Buffer.from('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DGC Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>'));
 zip.addFile('xl/_rels/workbook.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'));
 zip.addFile('xl/worksheets/sheet1.xml',Buffer.from('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="65" customWidth="1"/><col min="3" max="5" width="22" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>'));
 return zip.toBuffer();
}
