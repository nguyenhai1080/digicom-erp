import assert from 'node:assert/strict';
import {parseReconIdentity} from '../dist/modules/projects/recon-identity.js';
import {parseReconFinancial,correctFinancial} from '../dist/modules/projects/recon-financial.js';
import {invoiceParentLines} from '../dist/modules/projects/invoice-lines.js';
import {equivalents,revenueAmounts} from '../dist/modules/projects/revenue-money.js';
// Fabricated money, same verified physical DIGICOM statement layout.
const source=`BẢNG XÁC NHẬN SẢN LƯỢNG - DOANH THU
DỊCH VỤ TESTSERVICE TRÊN MẠNG DI ĐỘNG MOVITEL - MOZAMBIQUE
Giữa DIGICOM và GST
Theo Hợp đồng hợp tác số SYNTHETIC/DGC-GST.
I - Thời gian: Từ ngày 01/05/2026 đến ngày 31/05/2026
TESTSERVICE 100.00 25,000 2,500,000 85% 15% 2,125,000 375,000
Tổng cộng 100.00 2,500,000 2,125,000 375,000
Tỷ giá ngày đối soát 08/06/2026: USD1 = VND 25,000
Tổng số tiền Digicom phải trả cho GST bằng Việt nam đồng là: VND 375,000
Bằng chữ: Ba trăm bảy mươi lăm nghìn đồng chẵn.`;
const identity=parseReconIdentity(source),f=parseReconFinancial(source);
assert.equal(identity.service,'TESTSERVICE');assert.equal(identity.period,'2026-05');assert.equal(identity.agreementNo,'SYNTHETIC/DGC-GST');
assert.equal(f.ready,true);assert.equal(f.nativeCurrency,'VND');assert.equal(f.mzn,null);
assert.equal(f.native.partnerRevenue,'375000');assert.equal(f.usd.partnerRevenue,'15.00');assert.equal(f.details.length,1);assert.equal(f.details[0].rowType,'TOTAL');
for(const broken of [
 source.replace('85% 15%','85% 25%'),
 source.replace('TESTSERVICE 100.00','TESTSERVICE 101.00'),
 source.replace('2,125,000 375,000\nTổng','2,125,000 370,000\nTổng'),
 source.replace('Tổng cộng 100.00','Tổng cộng 99.00'),
 source.replace('VND 375,000','VND 370,000'),
 source.replace('USD1 = VND 25,000','USD1 = VND 26,000'),
 source.replace('TESTSERVICE 100.00','OTHERSERVICE 100.00'),
 source.replace('2,125,000 375,000\nTổng','2,125,000 375,000.50\nTổng'),
 source.replace('TESTSERVICE 100.00 25,000','TESTSERVICE 100.00 0'),
 source.replace(/Tổng cộng[^\n]+\n/,''),
 source.replace('85% 15%','85%'),
])assert.equal(parseReconFinancial(broken).ready,false);
assert.equal(parseReconIdentity(source.replace('31/05/2026','30/05/2026')).period,'');
assert.throws(()=>correctFinancial(f,[{lineNo:1,revenueMzn:'999'}],'wrong workflow'));
const d=f.details[0],row={id:'rev',currency:'VND',serviceId:'service',contractId:'contract',service:{serviceName:'TESTSERVICE'},calculationJson:{nativeRevenue:d.remunerationProvider,nativeWht:d.wht,nativePayable:d.partnerRevenue,reportingFxRate:f.exchangeRate,rowType:'TOTAL',includeInMonthlyTotal:true,uploadId:'upload',lineNo:1}};
const lines=invoiceParentLines([row],'2026-05');
assert.equal(lines.length,1);assert.equal(lines[0].revenue,'375000');assert.equal(lines[0].payable,'375000');assert.equal(lines[0].wht,'0');
assert.deepEqual(equivalents(revenueAmounts(row).payable,'VND',f.exchangeRate),{usd:'15.00',vnd:'375000'});
console.log('PASS: DIGICOM identity, authoritative GST VND share, FX/totals guards, VND Invoice and reporting.');

const vietnamese=source.replaceAll('100.00','100,00').replaceAll('2,500,000','2.500.000').replaceAll('2,125,000','2.125.000').replaceAll('375,000','375.000').replaceAll('25,000','25.000');
const vi=parseReconFinancial(vietnamese);
assert.equal(vi.ready,true);assert.deepEqual(vi.native,f.native);assert.deepEqual(vi.usd,f.usd);assert.equal(vi.exchangeRate,f.exchangeRate);
assert.equal(parseReconFinancial(vietnamese.replace('VND 375.000','VND 370.000')).ready,false);
assert.equal(parseReconFinancial(vietnamese.replace('USD1 = VND 25.000','USD1 = VND 25,000')).ready,false);
assert.equal(parseReconFinancial(source.replace('VND 375,000','VND 375.000')).ready,false);
console.log('PASS: Vietnamese and English separators agree; mixed formatting and changed totals remain blocked.');
