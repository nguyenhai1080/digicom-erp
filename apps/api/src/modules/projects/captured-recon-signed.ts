import type {Prisma} from '@erp/db';
import {z} from 'zod';
import {CommandError} from './commands.js';

const address=z.object({sheetId:z.number().int().nonnegative(),sourceRow:z.number().int().min(2),rowHash:z.string().regex(/^[a-f0-9]{64}$/),legacyId:z.string().min(1),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/).optional()});
const tokens=(v:unknown)=>[...new Set(String(v??'').split(/[,;\n]+/).map(s=>s.trim().toUpperCase()).filter(Boolean))];
const fail=(message:string):never=>{throw new CommandError(409,message);};
export function capturedPeriod(v:unknown){
 if(typeof v==='number'&&Number.isFinite(v)){const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000);return Number.isFinite(d.getTime())?d.toISOString().slice(0,7):null;}
 if(typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])(?:-\d{2}(?:T.*)?)?$/.test(v.trim()))return v.trim().slice(0,7);
 return null;
}
type Scope={id:string;partnerId:string;period:string;raw:unknown;selectedReconIds:string[];selectedInvoiceIds:string[];selectedRevenueIds:string[];revenueIds:string[]};
// Imported signed recon PDFs live in 55_APPROVAL_PACKAGE, not in the original
// 43_RECON_PDF_HEADER file. Resolve only through exact captured row/link tuples.
export async function capturedSignedReconDocument(tx:Prisma.TransactionClient,companyId:string,scope:Scope){
 const raw=scope.raw as any,parsed=address.safeParse(raw?.documentSource);
 if(!parsed.success)fail('Đối soát lịch sử chưa có liên kết để tìm bản đã ký. Không đính kèm bản gốc.');
 const source=parsed.data!,receipt=await tx.auditLog.findFirst({where:{companyId,action:'DGC_CAPTURED_BOOK_TRANSFER'},select:{newValue:true},orderBy:{createdAt:'desc'}}),r=receipt?.newValue as any;
 const hashes=[r?.sourceSnapshotHash,r?.sourceAppendixHash].filter((v):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)),snapshotHash=source.snapshotHash??r?.sourceSnapshotHash;
 if(!hashes.includes(snapshotHash))fail('Không khớp nguồn đối soát lịch sử để tìm bản đã ký.');
 const header=await tx.dgcImportRow.findFirst({where:{companyId,snapshotHash,sheetId:source.sheetId,sourceRow:source.sourceRow,rowHash:source.rowHash,legacyId:source.legacyId,sheetName:'43_RECON_PDF_HEADER'}}),h=(header?.payload as any)?.values;
 if(!header||!h||String(h.Recon_Doc_ID??'').toUpperCase()!==source.legacyId.toUpperCase()||capturedPeriod(h.Period_Month??h.Period)!==scope.period)fail('Nguồn đối soát lịch sử không khớp kỳ hoặc mã hồ sơ đã ký.');
 const partner=await tx.dgcImportLink.findFirst({where:{companyId,targetModel:'partner',targetId:scope.partnerId,legacyId:String(h.Partner_ID??'')}});
 if(!partner)fail('Đối tác trên hồ sơ đối soát lịch sử không khớp công ty hiện tại.');
 const sameCode=await tx.dgcImportRow.count({where:{companyId,snapshotHash:{in:hashes},sheetName:'43_RECON_PDF_HEADER',legacyId:source.legacyId}});
 if(sameCode!==1)fail('Mã đối soát nguồn không duy nhất; chưa thể chọn bản đã ký.');
 const rows=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:{in:hashes},sheetName:'55_APPROVAL_PACKAGE'},take:2001});
 if(rows.length>2000)fail('Danh sách bản ký vượt giới hạn tra cứu.');
 const candidates=rows.filter(row=>{const v=(row.payload as any)?.values,refs=tokens(v?.Related_Revenue_IDs);return v&&(!refs.length||refs.some(id=>scope.revenueIds.includes(id)))&&String(v.Approval_Status??'').toUpperCase()==='APPROVED'&&String(v.Partner_ID??'')===String(h.Partner_ID)&&capturedPeriod(v.Period)===scope.period&&tokens(v.Related_Recon_Doc_IDs).includes(source.legacyId.toUpperCase());});
 if(candidates.length!==1)fail(candidates.length?'Có nhiều bản ký cùng đối soát; cần xác định đúng hồ sơ trước khi gửi.':'Chưa có bản đối soát đã ký được liên kết trong kỳ này. Không đính kèm bản gốc thay thế.');
 const row=candidates[0],v=(row.payload as any).values,reconIds=tokens(v.Related_Recon_Doc_IDs),invoiceIds=tokens(v.Related_Invoice_IDs);
 if(tokens(v.Related_Revenue_IDs).some(id=>!scope.selectedRevenueIds.includes(id)))fail('Bản ký liên kết doanh thu cũ hoặc ngoài lựa chọn, không dùng thay bản hiện hành.');
 if(reconIds.some(id=>!scope.selectedReconIds.includes(id))||invoiceIds.some(id=>!scope.selectedInvoiceIds.includes(id)))fail('Bản ký gộp có thêm đối soát/Invoice ngoài lựa chọn. Chọn đầy đủ Invoice liên quan trước khi gửi.');
 const headerRows=await tx.dgcImportRow.findMany({where:{companyId,snapshotHash:{in:hashes},sheetName:'43_RECON_PDF_HEADER',legacyId:{in:reconIds}}});
 if(headerRows.length!==reconIds.length||headerRows.some(row=>{const v=(row.payload as any)?.values;return !v||String(v.Partner_ID??'')!==String(h.Partner_ID)||capturedPeriod(v.Period_Month??v.Period)!==scope.period;}))fail('Bản ký gộp có phạm vi đối tác/kỳ không khớp.');
 const links=await tx.dgcImportLink.findMany({where:{companyId,snapshotHash:row.snapshotHash,sheetId:row.sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash,targetModel:'document'},take:2});
 if(links.length!==1||!String(v.File_ID??'').trim())fail('Bản đối soát đã ký chưa có tệp liên kết đầy đủ.');
 const document=await tx.document.findFirst({where:{companyId,id:links[0].targetId,documentType:'APPROVAL_PACKAGE',entityType:'DGC_SOURCE_REFERENCE',status:'ACTIVE',attachment:{companyId}},include:{attachment:true}});
 if(!document)fail('Tệp đối soát đã ký không còn hiệu lực.');
 return {document:document!,source:row.legacyId,reconIds};
}
