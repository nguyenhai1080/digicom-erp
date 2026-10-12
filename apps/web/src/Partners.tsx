import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
type Props = { permissions: string[]; csrf: string; request: (path:string, body?:unknown, csrf?:string)=>Promise<any> };
const types:Record<string,string>={SUPPLIER:'Input · Đầu vào',CUSTOMER:'Output · Đầu ra',BOTH:'Both · Cả hai',OTHER:'Other · Khác'};
const categories=['Telco','Content Provider','Aggregator','Vendor','Customer','Outsourcing','Other'];
const statuses:Record<string,string>={ACTIVE:'Active · Hoạt động',INACTIVE:'Inactive · Ngừng hoạt động',BLACKLISTED:'Blacklist · Danh sách chặn',PROSPECT:'Tiềm năng',SUSPENDED:'Tạm dừng',ARCHIVED:'Đã lưu trữ'};
const fields=[
  ['countryName','Quốc gia',100],['registrationNumber','Business Registration No.',100],['taxCode','Tax Registration',100],
  ['contactName','Người liên hệ',200],['invoiceRecipient','Attn / Người nhận invoice',200],['invoiceEmail','Email invoice',254],['email','Email liên hệ',254],['phone','Điện thoại',100]
] as const;
export function PartnerEditor({permissions,csrf,request,item,onClose,onSaved}:Props&{item?:any;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false); const [saved,setSaved]=useState(false); const [message,setMessage]=useState(''); const dialog=useRef<HTMLDialogElement>(null);
  const [deleting,setDeleting]=useState(false);
  const editable=permissions.includes(item?'PARTNER_EDIT':'PARTNER_CREATE')&&item?.status!=='ARCHIVED';
  useEffect(()=>{const el=dialog.current;el?.showModal(); return()=>el?.close();},[]);
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy||saved||(!deleting&&!editable))return;const data=new FormData(event.currentTarget);
    const s=(key:string)=>String(data.get(key)??'').trim();
    const body:any=deleting?{expectedUpdatedAt:item.updatedAt,reason:s('deleteReason')}:{legalName:s('legalName'),partnerType:s('partnerType'),partnerCategory:s('partnerCategory')||null,status:s('status'),
      paymentTermDays:s('paymentTermDays')===''?null:Number(s('paymentTermDays')),
      ...Object.fromEntries([...fields.map(f=>f[0]),'registeredAddress','billingAddress'].map(k=>[k,s(k)||null]))};
    if(!deleting){if(item){body.expectedUpdatedAt=item.updatedAt;body.reason=s('reason');body.partnerCode=s('partnerCode')||item.partnerKey;}else if(s('partnerCode'))body.partnerCode=s('partnerCode');}
    setBusy(true);setMessage('');
    try{await request(item?`/partners/${item.id}/${deleting?'delete':'update'}`:'/partners',body,csrf);setSaved(true);
      try{await onSaved();onClose();}catch{setMessage('Hồ sơ đã lưu. Đóng cửa sổ và tải lại danh sách để xem thông tin mới.');}}
    catch(e){setMessage(e instanceof Error?e.message:'Không thể lưu hồ sơ.');}finally{setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="partner-dialog" aria-labelledby="partner-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <div className="partner-dialog-heading"><div><h2 id="partner-title">{deleting?'Xác nhận xóa đối tác':item?(editable?'Cập nhật đối tác':'Hồ sơ đối tác'):'Thêm mới đối tác'}</h2><p className="muted">Khai báo đối tác đầu vào/đầu ra và thông tin xuất Invoice/SOA.</p></div><button type="button" disabled={busy} onClick={onClose}>Đóng</button></div>
    <form onSubmit={save}><div className="partner-dialog-body">{deleting?<fieldset disabled={busy||saved}><p>Xóa vĩnh viễn <b>{item.partnerKey} · {item.legalName}</b>? Chỉ đối tác chưa có liên kết nghiệp vụ hoặc hồ sơ liên quan mới được xóa.</p><label>Lý do xóa *<input name="deleteReason" required maxLength={500}/></label></fieldset>:<fieldset disabled={busy||saved||!editable}>
      <div className="partner-grid">
        {item&&<label>Partner_ID<input value={item.partnerKey} readOnly/></label>}
        <label>Mã đối tác<input name="partnerCode" defaultValue={item?.partnerCode??''} placeholder="Tự động nếu bỏ trống" maxLength={100} pattern="[\p{L}\p{N}_.\-]+"/></label>
        <label>Loại đối tác<select name="partnerType" defaultValue={item?.partnerType??'SUPPLIER'}>{Object.entries(types).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="partner-wide">Tên đối tác *<input name="legalName" defaultValue={item?.legalName??''} required maxLength={500}/></label>
        <label>Nhóm đối tác<select name="partnerCategory" defaultValue={item?(item.partnerCategory??'Other'):'Telco'}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Quốc gia<input name="countryName" defaultValue={item?(item.countryName??item.countryCode??''):'Mozambique'} maxLength={100} placeholder="Ví dụ: Việt Nam, Mozambique"/></label>
        <label>Trạng thái<select name="status" defaultValue={item?.status??'ACTIVE'}>{Object.entries(statuses).filter(([k])=>['ACTIVE','INACTIVE','BLACKLISTED'].includes(k)||k===item?.status).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Payment term days<input name="paymentTermDays" type="number" min={0} max={3650} step={1} defaultValue={item?(item.paymentTermDays??''):45}/></label>
        {fields.filter(f=>f[0]!=='countryName').map(([name,label,max])=><label key={name}>{label}<input name={name} defaultValue={item?.[name]??''} maxLength={max} type={name.toLowerCase().includes('email')?'email':name==='phone'?'tel':'text'}/></label>)}
        <label className="partner-wide">Địa chỉ<textarea name="registeredAddress" rows={2} maxLength={2000} defaultValue={item?.registeredAddress??''}/></label>
        <label className="partner-wide">Địa chỉ xuất Invoice/SOA<textarea name="billingAddress" rows={2} maxLength={2000} defaultValue={item?.billingAddress??''}/></label>
        {item&&editable&&<label className="partner-wide">Lý do cập nhật *<input name="reason" required maxLength={500}/></label>}
      </div>
    </fieldset>}{item&&!deleting&&<p className="muted">Tạo: {item.createdBy??'Chưa ghi nhận'} · {new Date(item.createdAt).toLocaleString('vi-VN')}<br/>Cập nhật: {item.updatedBy??'Chưa ghi nhận'} · {new Date(item.updatedAt).toLocaleString('vi-VN')}</p>}{message&&<p className="notice" role="alert">{message}</p>}</div>
    <div className="partner-dialog-footer">{item&&!deleting&&!saved&&permissions.includes('PARTNER_ARCHIVE')&&<button type="button" disabled={busy} onClick={()=>{setDeleting(true);setMessage('');}}>Xóa đối tác…</button>}<button type="button" disabled={busy} onClick={()=>deleting?setDeleting(false):onClose()}>{deleting?'Quay lại':editable&&!saved?'Hủy':'Đóng hồ sơ'}</button>{(editable||deleting)&&!saved&&<button className="action-primary" disabled={busy} type="submit">{busy?'Đang xử lý…':deleting?'Xác nhận xóa':item?'Lưu thay đổi':'Lưu đối tác'}</button>}</div></form>
  </dialog>,document.body);
}
export function PartnerCreate({onSaved,...props}:Props&{onSaved:()=>Promise<void>}){
  const [open,setOpen]=useState(false);
  return <section className="panel"><div className="section-heading"><div><h3>Đối tác</h3><p className="muted">Thông tin pháp lý, liên hệ và xuất Invoice/SOA theo biểu mẫu DGC.</p></div><button className="action-primary" onClick={()=>setOpen(true)}>Thêm mới đối tác</button></div>{open&&<PartnerEditor {...props} onSaved={onSaved} onClose={()=>setOpen(false)}/>}</section>;
}
export function Partners(props:Props){
  const [data,setData]=useState<any>(null);const [page,setPage]=useState(1);const [search,setSearch]=useState('');const [query,setQuery]=useState('');
  const [message,setMessage]=useState('');const [editor,setEditor]=useState<any>(null);const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState('ALL');const path=`/partners?page=${page}&status=${status}&search=${encodeURIComponent(query)}`;
  async function load(){setData(await props.request(path));}
  useEffect(()=>{let cancelled=false;setLoading(true);setMessage('');void props.request(path).then(d=>{if(!cancelled)setData(d);}).catch(e=>{if(!cancelled)setMessage(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[path]);
  async function open(id:string){setLoading(true);setMessage('');try{setEditor((await props.request('/partners/'+id)).item);}catch(e){setMessage(e instanceof Error?e.message:'Không thể mở hồ sơ.');}finally{setLoading(false);}}
  return <div className="execution"><section className="panel"><h2>Danh sách đối tác</h2>
    <form className="list-toolbar" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim());}}><input aria-label="Tìm theo mã, tên, mã số thuế hoặc email" placeholder="Tìm kiếm đối tác…" value={search} onChange={e=>setSearch(e.target.value)} maxLength={200}/><button disabled={loading}>Tìm kiếm</button>{props.permissions.includes('PARTNER_CREATE')&&<button className="action-primary" type="button" disabled={loading} onClick={()=>setEditor({new:true})}>+ Thêm mới đối tác</button>}<button type="button" disabled={loading} onClick={()=>void load().catch(e=>setMessage(e.message))}>Tải lại</button><select aria-label="Lọc trạng thái" value={status} onChange={e=>{setPage(1);setStatus(e.target.value);}}><option value="ALL">Tất cả trạng thái</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></form>
    {message&&<p className="notice" role="alert">{message}</p>}{loading?<p role="status">Đang tải đối tác…</p>:data&&<><div className="table-scroll"><table><thead><tr><th>Mã đối tác</th><th>Loại</th><th>Nhóm</th><th>Quốc gia</th><th>Tax Registration</th><th>Email liên hệ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.items.map((p:any)=><tr key={p.id}><td title={p.legalName}><b>{p.partnerKey}</b>{p.partnerCode!==p.partnerKey&&<span className="secondary-code">{p.partnerCode}</span>}</td><td>{types[p.partnerType]}</td><td>{p.partnerCategory??'—'}</td><td>{p.countryName??p.countryCode??'—'}</td><td>{p.taxCode??'—'}</td><td>{p.email??'—'}</td><td><span className={"status-badge status-"+p.status.toLowerCase()}>{statuses[p.status]}</span></td><td><button onClick={()=>void open(p.id)}>Xem hồ sơ</button></td></tr>)}</tbody></table></div>{!data.items.length&&<p>Chưa có đối tác phù hợp.</p>}<div className="pager"><p>{data.total} đối tác · Trang {page}/{Math.max(1,Math.ceil(data.total/10))}</p><div><button disabled={page===1} onClick={()=>setPage(page-1)}>Trang trước</button> <button disabled={page*10>=data.total} onClick={()=>setPage(page+1)}>Trang sau</button></div></div></>}
  </section>{editor&&<PartnerEditor {...props} item={editor.new?undefined:editor} onSaved={load} onClose={()=>setEditor(null)}/>}</div>;
}
