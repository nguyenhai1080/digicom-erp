import {useState} from 'react';
import {formatNumber} from './numbers';
const money=(v:string)=>formatNumber(v,2);
export function CapturedInputPreview({data}:{data:any}){
 const [page,setPage]=useState(1),pages=Math.max(1,Math.ceil(data.lines.length/10));
 return <><p className="notice">Bản in tra cứu từ số liệu đã chuyển, không phải PDF nguồn. Không tính lại tiền theo tỷ giá hoặc hợp đồng hiện tại.</p>
 <div className="table-scroll"><table><thead><tr><th>Mã / dịch vụ</th><th>Cơ sở USD</th><th>Số chia USD</th><th>Tỷ giá đã lưu</th><th>Số nội tệ</th><th>Thuế</th><th>WHT</th><th>Phải trả</th></tr></thead><tbody>{data.lines.slice((page-1)*10,page*10).map((l:any)=><tr key={l.code}><td>{l.code}<small>{l.service}</small></td><td>{money(l.baseUsd)}</td><td>{money(l.foreignAmount)}</td><td>{l.fxRate}</td><td>{money(l.localAmount)}</td><td>{money(l.taxAmount)}</td><td>{money(l.whtAmount)}</td><td>{money(l.payableAmount)} {data.currency}</td></tr>)}</tbody></table></div>
 <div className="pagination"><span>{data.lines.length} hồ sơ · Trang {page}/{pages} · 10 kết quả/trang</span><button disabled={page===1} onClick={()=>setPage(page-1)}>Trang hồ sơ trước</button><button disabled={page===pages} onClick={()=>setPage(page+1)}>Trang hồ sơ sau</button></div>
 <p>Tổng phải trả đã lưu: {money(data.totals.payableAmount)} {data.currency}</p></>;
}
