import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
type Props={permissions:string[];csrf:string;request:(path:string,body?:unknown,csrf?:string)=>Promise<any>};
const categories=['Basic','Application','Content','Utility','Other'];
const statuses:Record<string,string>={ACTIVE:'Active · Hoạt động',INACTIVE:'Inactive · Ngừng hoạt động',SUSPENDED:'Suspended · Tạm dừng',ARCHIVED:'Đã lưu trữ'};
function ServiceEditor({item,onClose,onSaved,...props}:Props&{item?:any;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);const[busy,setBusy]=useState(false);const[saved,setSaved]=useState(false);
  const[message,setMessage]=useState('');const[deleting,setDeleting]=useState(false);
  const editable=props.permissions.includes(item?'SERVICE_EDIT':'SERVICE_CREATE')&&item?.status!=='ARCHIVED';
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy||saved)return;const data=new FormData(e.currentTarget);const s=(k:string)=>String(data.get(k)??'').trim();
    const body:any=deleting?{expectedUpdatedAt:item.updatedAt,reason:s('deleteReason')}:{serviceName:s('serviceName'),
      dgcCategory:s('dgcCategory'),status:s('status'),keyword:s('keyword')||null,description:s('description')||null,
      startDate:s('startDate')||null,endDate:s('endDate')||null};
    if(!deleting){if(!editable)return;if(s('serviceCode'))body.serviceCode=s('serviceCode');
      if(item){body.expectedUpdatedAt=item.updatedAt;body.reason=s('reason');}}
    setBusy(true);setMessage('');
    try{await props.request(item?`/services/${item.id}/${deleting?'delete':'update'}`:'/services',body,props.csrf);setSaved(true);
      try{await onSaved();onClose();}catch{setMessage('Thao tác đã hoàn tất. Đóng cửa sổ và tải lại danh sách.');}}
    catch(e){setMessage(e instanceof Error?e.message:'Không thể lưu dịch vụ.');}finally{setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="partner-dialog" aria-labelledby="service-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <div className="partner-dialog-heading"><div><h2 id="service-title">{deleting?'Xác nhận xóa dịch vụ':item?'Hồ sơ dịch vụ':'Thêm mới dịch vụ'}</h2><p className="muted">Thông tin và phân loại dịch vụ.</p></div><button disabled={busy} onClick={onClose}>Đóng</button></div>
    <form onSubmit={submit}><div className="partner-dialog-body">
      {deleting?<fieldset disabled={busy||saved}><p>Xóa vĩnh viễn <b>{item.serviceKey} · {item.serviceName}</b>? Chỉ dịch vụ chưa có liên kết nghiệp vụ mới được xóa.</p><label>Lý do xóa *<input name="deleteReason" required maxLength={500}/></label></fieldset>:
      <fieldset disabled={busy||saved||!editable}><div className="partner-grid">
        {item&&<label>Service_ID<input value={item.serviceKey} readOnly/></label>}
        <label>Mã dịch vụ<input name="serviceCode" defaultValue={item?.serviceCode??''} placeholder="Tự động nếu bỏ trống" maxLength={100}/></label>
        <label>Phân loại dịch vụ<select name="dgcCategory" defaultValue={item?(item.dgcCategory??''):'Basic'} required>
          {item&&!item.dgcCategory&&<option value="">Chưa phân loại · {item.category}</option>}{categories.map(c=><option key={c}>{c}</option>)}
        </select></label>
        <label className="partner-wide">Tên dịch vụ *<input name="serviceName" required maxLength={500} defaultValue={item?.serviceName??''}/></label>
        <label>Keyword<input name="keyword" maxLength={500} defaultValue={item?.keyword??''}/></label><label>Trạng thái<select name="status" defaultValue={item?.status??'ACTIVE'}>{Object.entries(statuses).filter(([k])=>k!=='ARCHIVED'||item?.status==='ARCHIVED').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Ngày bắt đầu<input name="startDate" type="date" defaultValue={item?.startDate?.slice(0,10)??''}/></label>
        <label>Ngày kết thúc<input name="endDate" type="date" defaultValue={item?.endDate?.slice(0,10)??''}/></label>
        <label className="partner-wide">Mô tả<textarea name="description" rows={3} maxLength={4000} defaultValue={item?.description??''}/></label>
        {item&&editable&&<label className="partner-wide">Lý do cập nhật *<input name="reason" required maxLength={500}/></label>}
      </div></fieldset>}
      {item&&!deleting&&<p className="muted">Tạo: {item.createdBy??'Chưa ghi nhận'} · {new Date(item.createdAt).toLocaleString('vi-VN')}<br/>Cập nhật: {item.updatedBy??'Chưa ghi nhận'} · {new Date(item.updatedAt).toLocaleString('vi-VN')}</p>}
      {message&&<p className="notice" role="alert">{message}</p>}</div>
      <div className="partner-dialog-footer">
        {item&&!deleting&&!saved&&props.permissions.includes('SERVICE_ARCHIVE')&&<button disabled={busy} type="button" onClick={()=>{setDeleting(true);setMessage('');}}>Xóa dịch vụ…</button>}
        <button disabled={busy} type="button" onClick={()=>deleting?setDeleting(false):onClose()}>{deleting?'Quay lại':'Đóng'}</button>
        {!saved&&(editable||deleting)&&<button className="action-primary" disabled={busy} type="submit">{busy?'Đang xử lý…':deleting?'Xác nhận xóa':item?'Lưu thay đổi':'Lưu dịch vụ'}</button>}
      </div></form>
    </dialog>,document.body);
}
export function Services(props:Props){
  const[data,setData]=useState<any>(null);const[page,setPage]=useState(1);const[search,setSearch]=useState('');const[query,setQuery]=useState('');
  const[status,setStatus]=useState('');const[message,setMessage]=useState('');const[editor,setEditor]=useState<any>(null);const[loading,setLoading]=useState(false);
  const path=`/services?page=${page}&search=${encodeURIComponent(query)}${status?'&status='+status:''}`;
  async function load(){setData(await props.request(path));}
  useEffect(()=>{let cancelled=false;setLoading(true);setMessage('');void props.request(path).then(d=>{if(!cancelled)setData(d);}).catch(e=>{if(!cancelled)setMessage(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[path]);
  async function open(id:string){setLoading(true);setMessage('');try{setEditor((await props.request('/services/'+id)).item);}catch(e){setMessage(e instanceof Error?e.message:'Không thể mở dịch vụ.');}finally{setLoading(false);}}
  return <div className="execution"><section className="panel"><h2>Danh sách dịch vụ</h2>
    <form className="list-toolbar" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim());}}><input aria-label="Tìm theo mã, tên hoặc keyword" placeholder="Tìm kiếm dịch vụ…" value={search} onChange={e=>setSearch(e.target.value)} maxLength={200}/><button disabled={loading}>Tìm kiếm</button>{props.permissions.includes('SERVICE_CREATE')&&<button className="action-primary" type="button" disabled={loading} onClick={()=>setEditor({new:true})}>+ Thêm mới dịch vụ</button>}<button type="button" disabled={loading} onClick={()=>void load().catch(e=>setMessage(e.message))}>Tải lại</button><select aria-label="Lọc trạng thái" value={status} onChange={e=>{setPage(1);setStatus(e.target.value);}}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></form>
    {message&&<p className="notice" role="alert">{message}</p>}{loading?<p role="status">Đang tải dịch vụ…</p>:data&&<><p className="list-summary">{data.total} dịch vụ</p><div className="table-scroll"><table><thead><tr><th>Service_ID</th><th>Tên dịch vụ</th><th>Phân loại</th><th>Keyword</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.items.map((s:any)=><tr key={s.id}><td><span className="record-code">{s.serviceKey}</span>{s.serviceCode!==s.serviceKey&&<span className="secondary-code">{s.serviceCode}</span>}</td><td>{s.serviceName}</td><td>{s.dgcCategory??`Chưa đối chiếu (${s.category})`}</td><td>{s.keyword??'—'}</td><td><span className={"status-badge status-"+s.status.toLowerCase()}>{statuses[s.status]}</span></td><td><button onClick={()=>void open(s.id)}>Xem hồ sơ</button></td></tr>)}</tbody></table></div>{!data.items.length&&<p>Chưa có dịch vụ phù hợp.</p>}<div className="pager"><p>{data.total} dịch vụ · Trang {page}/{Math.max(1,Math.ceil(data.total/50))}</p><div><button disabled={page===1} onClick={()=>setPage(page-1)}>Trang trước</button> <button disabled={page*50>=data.total} onClick={()=>setPage(page+1)}>Trang sau</button></div></div></>}
  </section>{editor&&<ServiceEditor {...props} item={editor.new?undefined:editor} onSaved={load} onClose={()=>setEditor(null)}/>}</div>;
}


