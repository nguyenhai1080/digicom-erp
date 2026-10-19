import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderInputStatement} from '../dist/modules/projects/input-recon-pdf.js';
import {inputVndWords} from '../dist/modules/projects/input-recon-statement.js';
const data={period:'2026-01',reconDate:'2026-02-01',fromDate:'2026-01-01',toDate:'2026-01-31',issuer:'Công ty DGC tổng hợp',partner:'Đối tác đầu vào tổng hợp',partnerKey:'INPUT_FIXTURE',contractNumber:'SYNTHETIC-ONLY',outputPartners:['MOVITEL_FIXTURE'],currency:'VND',fxRate:'25000',lines:Array.from({length:35},(_,i)=>({service:'Dịch vụ tổng hợp '+(i+1)+' — kiểm tra phân trang và tiếng Việt',baseUsd:'100.00',shareRate:'.4',cooperation:'2500000',companyAmount:'1600000',partnerAmount:'900000'})),totals:{baseUsd:'3500.00',cooperation:'87500000',companyAmount:'56000000',partnerAmount:'31500000'},amountInWords:inputVndWords('31500000')};
const bytes=await renderInputStatement(data),doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=3);for(const p of doc.getPages()){assert.ok(p.getWidth()>p.getHeight());assert.equal(p.getRotation().angle,0);}
assert.equal(inputVndWords('1000000000001'),'Một nghìn tỷ, không trăm lẻ một đồng chẵn');
await assert.rejects(renderInputStatement({...data,lines:[{...data.lines[0],partnerAmount:'9'.repeat(60)}]}),e=>e.statusCode===422);
if(process.env.FINANCE_PROOF_ROOT){await mkdir(process.env.FINANCE_PROOF_ROOT,{recursive:true});await writeFile(resolve(process.env.FINANCE_PROOF_ROOT,'synthetic-input-recon-multipage.pdf'),bytes);}
console.log('PASS: InputRecon PDF Unicode, landscape/pagination, amount words and overflow rejection.');
