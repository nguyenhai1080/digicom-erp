import React, { useEffect, useState } from 'react';
import {DgcInvoiceSettings} from './DgcInvoiceSettings';
type Asset = { id: string; kind: string; version: number; status: string; filename: string; bytes: number; uploadedAt: string; uploadedBy: string; mimeType: string; checksumSha256: string };
const labels: Record<string,string> = { COMPANY_LOGO:'Logo công ty', COMPANY_STAMP:'Dấu công ty', SIGNATURE:'Chữ ký', SIGNER_TITLE_NAME:'Chức danh và họ tên', SIGNING_COMPOSITE:'Ảnh ghép dấu, chữ ký và chức danh', INVOICE_TEMPLATE:'Template Invoice' };
export function CompanyAssets({ csrf, request }: { csrf: string; request: (path:string, body?:unknown, csrf?:string)=>Promise<any> }) {
  const [page,setPage]=useState(1);
  const [items,setItems] = useState<Asset[]>([]), [kind,setKind] = useState('COMPANY_LOGO'), [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [ready,setReady] = useState(false), [history,setHistory] = useState(false);
  async function load() { const data = await request('/company-assets'); setItems(data.items); setPage(1); setReady(true); if(data.truncated) setMessage('Danh sách hiển thị 500 phiên bản gần nhất theo loại tài sản.'); }
  useEffect(()=>{ void load().catch(error=>setMessage(error.message)); },[]);
  async function upload(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget, values=new FormData(form), file=values.get('file');
    if(!(file instanceof File)||!file.size||file.size>5*1024*1024) { setMessage('Chọn file tối đa 5 MB.'); return; }
    const current=items.find(item=>item.kind===kind&&item.status==='ACTIVE');
    setBusy(true); setMessage('');
    try {
      const base64 = await new Promise<string>((resolve,reject)=>{const reader=new FileReader(); reader.onerror=()=>reject(new Error('Không đọc được file.')); reader.onload=()=>resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file);});
      await request('/company-assets',{ kind, filename:file.name, base64, expectedCurrentId:current?.id??null, reason:String(values.get('reason')??'') },csrf);
      form.reset(); await load(); setMessage('Đã lưu file vào kho tài sản. Phiên bản mới được sử dụng cho hồ sơ tạo về sau; các phiên bản cũ vẫn được giữ.');
    } catch(error) { setMessage(error instanceof Error?error.message:'Không upload được file.'); await load().catch(()=>{}); }
    finally { setBusy(false); }
  }
  const visible = items.filter(item=>history||item.status==='ACTIVE');
  return <><DgcInvoiceSettings csrf={csrf} request={request}/><section className="panel"><div className="panel-heading"><div><h3>Tài sản công ty và template Invoice</h3><p className="muted">Quản lý ảnh gốc và các phiên bản template dùng để lập chứng từ.</p></div><button disabled={busy} onClick={()=>{setMessage('');void load().catch(error=>setMessage(error.message));}}>Tải lại</button></div>
    <form onSubmit={upload}><fieldset disabled={busy||!ready}><div className="form-grid">
      <label>Loại tài sản<select value={kind} onChange={event=>setKind(event.target.value)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>File gốc<input key={kind} name="file" type="file" required accept={kind==='INVOICE_TEMPLATE'?'.xlsx,.xlsm':'.png,.jpg,.jpeg'}/><span className="hint">{kind==='INVOICE_TEMPLATE'?'XLSX hoặc XLSM; giữ nguyên file, không chạy macro.':'PNG hoặc JPEG; giữ nguyên ảnh, không vẽ lại.'} Tối đa 5 MB.</span></label>
      <label>Lý do upload / thay phiên bản<input name="reason" required maxLength={500} placeholder="Ví dụ: Cập nhật logo chính thức"/></label>
    </div><p className="hint">{items.some(item=>item.kind===kind&&item.status==='ACTIVE')?'File mới sẽ thay phiên bản đang dùng. File cũ và các chứng từ đã phát hành được giữ nguyên.':'Chưa có tài sản đang dùng cho loại này.'}</p><button className="primary" type="submit">{busy?'Đang lưu…':'Upload và sử dụng phiên bản này'}</button></fieldset></form>
    {message&&<p className="notice" role="status">{message}</p>}
    <div className="panel-heading"><h3>File đã lưu</h3><label><input type="checkbox" checked={history} onChange={event=>{setHistory(event.target.checked);setPage(1);}}/> Hiện lịch sử phiên bản</label></div>
    <div className="table-wrap"><table><thead><tr><th>Loại tài sản</th><th>File</th><th>Phiên bản</th><th>Trạng thái</th><th>Người upload / thời gian</th><th>Thao tác</th></tr></thead><tbody>{visible.slice((page-1)*10,page*10).map(item=><tr key={item.id}><td>{labels[item.kind]}</td><td>{item.filename}<div className="muted">{Math.ceil(item.bytes/1024)} KB</div></td><td>v{item.version}</td><td>{item.status==='ACTIVE'?'Đang dùng':'Phiên bản cũ'}</td><td>{item.uploadedBy}<div className="muted">{new Date(item.uploadedAt).toLocaleString('vi-VN')}</div></td><td><a href={'/api/v1/company-assets/'+item.id+'/download'}>Tải file gốc</a></td></tr>)}</tbody></table></div>
    <div className="pagination"><span>{visible.length} tài sản · Trang {page}/{Math.max(1,Math.ceil(visible.length/10))}</span><button disabled={busy||page<=1} onClick={()=>setPage(page-1)}>Trang trước</button><button disabled={busy||page*10>=visible.length} onClick={()=>setPage(page+1)}>Trang sau</button></div>
    {ready&&!visible.length&&<p className="muted">Chưa có file. Chọn loại tài sản và upload ở phía trên.</p>}
  </section></>;
}
