import {Prisma} from '@erp/db';
import type {Amounts,Financial} from './recon-financial.js';
// Owner-provided DIGICOM Vietnamese statement: GST's VND share is the
// settlement amount. Movitel USD is upstream evidence, never GST revenue.
export function parseDigicomStatement(raw:string):Financial|null{
 const text=raw.replace(/\s+/g,' ').trim();
 if(!/BẢNG XÁC NHẬN SẢN LƯỢNG\s*[-–]\s*DOANH THU/i.test(text)||! /DIGICOM/i.test(text))return null;
 let vietnamese=false;
 const D=(v:string)=>{const valid=vietnamese?/^(?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{2})?$/:/^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{2})?$/;if(!valid.test(v)){errors.push('Định dạng số trong PDF DIGICOM không nhất quán.');return new Prisma.Decimal(0);}return new Prisma.Decimal(vietnamese?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,''));},whole=(v:Prisma.Decimal)=>v.toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed(0),errors:string[]=[];
 const result:Financial={version:1,source:'DIGICOM_VND_STATEMENT',nativeCurrency:'VND',sourcePartnerKey:'DIGICOM',exchangeRate:null,details:[],native:null,mzn:null,usd:null,warnings:[],errors,ready:false};
 const num='(?:[0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)(?:[.,][0-9]{2})?';
 const row=new RegExp('(?:^|\\s)([A-Z][A-Z0-9_-]{1,59})\\s+('+num+')\\s+('+num+')\\s+('+num+')\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%\\s+('+num+')\\s+('+num+')(?=\\s|$)','g');
 const rows=[...text.matchAll(row)];
 // This verified template has one service; do not silently consume a partial
 // multi-service statement until its layout has been characterized.
 if(rows.length!==1){errors.push('Mẫu DIGICOM cần một dòng dịch vụ đầy đủ; kiểm tra bảng gốc.');return result;}
 const m=rows[0];
 // The upstream USD amount has cents, which disambiguate comma vs dot.
 vietnamese=/,\d{2}$/.test(m[2]);
 const upstream=D(m[2]),fx=D(m[3]),pool=D(m[4]),otherRate=new Prisma.Decimal(m[5]),gstRate=new Prisma.Decimal(m[6]),other=D(m[7]),gst=D(m[8]);
 const title=text.match(/DỊCH VỤ\s+([A-Z0-9_-]+)\s+TRÊN MẠNG DI ĐỘNG/i)?.[1];
 if(title!==m[1])errors.push('Dịch vụ dòng tiền không khớp tiêu đề DIGICOM.');
 if([pool,other,gst].some(v=>!v.isInteger()||v.lt(0)))errors.push('Số tiền VND phải là số nguyên không âm.');
 if(!fx.gt(0)||fx.gte('1000000000000'))errors.push('Tỷ giá VND/USD không hợp lệ.');
 if(!otherRate.plus(gstRate).eq(100)||otherRate.lt(0)||gstRate.lt(0))errors.push('Tỷ lệ chia sẻ DIGICOM/GST không hợp lệ.');
 if(!fx.gt(0))return result;
 // The supplied form prints "5=3-4", although USD-to-VND conversion is
 // multiplication. Validate the reported amounts; never rewrite the source.
 if(whole(upstream.mul(fx))!==whole(pool))errors.push('Doanh thu hợp tác VND không khớp USD nguồn × tỷ giá.');
 if(whole(pool.mul(gstRate).div(100))!==whole(gst)||whole(pool.mul(otherRate).div(100))!==whole(other))errors.push('Số tiền chia sẻ không khớp tỷ lệ trong PDF.');
 const total=text.match(new RegExp('Tổng cộng\\s+('+num+')\\s+('+num+')\\s+('+num+')\\s+('+num+')','i'));
 if(!total||![upstream,pool,other,gst].every((v,i)=>v.eq(D(total[i+1]))))errors.push('Dòng tổng DIGICOM không khớp dòng dịch vụ.');
 const footer=text.match(new RegExp('Tổng số tiền Digicom phải trả cho GST[^:]{0,100}:\\s*(?:VND\\s*)?('+num+')','i'));
 if(!footer||!gst.eq(D(footer[1])))errors.push('Số GST được hưởng không khớp tổng tiền cuối PDF.');
 const rate=text.match(new RegExp('Tỷ giá ngày đối soát\\s+([0-9/]+):\\s*USD\\s*1\\s*=\\s*VND\\s+('+num+')','i'));
 if(!rate||!fx.eq(D(rate[2])))errors.push('Tỷ giá dòng dịch vụ không khớp tỷ giá cuối PDF.');
 const a:Amounts={totalServiceRevenue:pool.toFixed(0),ivaTax:'0',serviceRevenueForSharing:pool.toFixed(0),remunerationProvider:gst.toFixed(0),wht:'0',partnerRevenue:gst.toFixed(0)};
 const usd=Object.fromEntries(Object.entries(a).map(([k,v])=>[k,D(v).div(fx).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2)])) as Amounts;
 result.exchangeRate=fx.toFixed();result.native=a;result.usd=usd;
 result.details=[{...a,lineNo:1,serviceName:m[1],costDeduction:'0',sharingRate:gstRate.div(100).toFixed(),distributionRatio:'1',usd,rowType:'TOTAL'}];
 result.warnings.push('Kiểm tra số tiền bằng chữ trên PDF gốc. Invoice dùng số GST được hưởng bằng VND.');
 result.ready=errors.length===0;return result;
}
