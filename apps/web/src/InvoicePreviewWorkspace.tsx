import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {formatMoney} from './numbers';
import {SigningControls,type Placement} from './FinancialReview';
import {InvoiceCanvas} from './InvoiceCanvas';

type Props={plan:any;mode:string;positions:Record<string,{stamp:Placement;signature:Placement}>;pages:Record<string,string>;previews:Record<string,string>;busy:boolean;message:string;confirmed:boolean;onConfirm:(v:boolean)=>void;onPage:(key:string,pdf?:boolean)=>Promise<void>;onPosition:(key:string,kind:'stamp'|'signature',p:Placement)=>void;onSave:()=>Promise<void>;onClose:()=>void;onSelect:()=>void};
export function InvoicePreviewWorkspace(p:Props){
 const panel=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),attempted=useRef(new Set<string>());
 const [active,setActive]=useState(p.plan.invoices[0]?.businessKey??'');
 const items=p.plan.invoices as any[],item=items.find(i=>i.businessKey===active)??items[0],key=item?.businessKey,position=p.positions[key],ready=items.filter(i=>p.previews[i.businessKey]).length;
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 useEffect(()=>{panel.current?.scrollTo({top:0});},[key]);
 // Render only the selected Invoice, once on first visit. A failed load needs
 // an explicit retry; switching invoices never starts parallel PDF jobs.
 useEffect(()=>{if(key&&!p.pages[key]&&!p.busy&&!attempted.current.has(key)){attempted.current.add(key);void p.onPage(key);}},[key,p.pages[key],p.busy,p.onPage]);
 if(!item||!position)return null;
 return createPortal(<dialog ref={dialog} className="partner-dialog invoice-workspace" aria-labelledby="invoice-workspace-title" onCancel={e=>{e.preventDefault();if(!p.busy)p.onClose();}}>
  <div className="partner-dialog-heading"><div><h2 id="invoice-workspace-title">Preview Invoice</h2><p>{item.invoice.partner.name} · Kỳ {item.invoice.period} · {p.mode==='PER_SERVICE'?'Tách theo dịch vụ':'Gộp tất cả dịch vụ'} · {items.length} Invoice</p></div><button disabled={p.busy} onClick={p.onClose}>Đóng</button></div>
  <div className="invoice-workspace-help"><b>Kéo thả:</b> di chuyển dấu và chữ ký trực tiếp trên trang. Vị trí được giữ riêng cho từng Invoice. Gói dịch vụ con nằm chung một Invoice.</div>
  <div className="invoice-workspace-layout">
   <div className="invoice-workspace-list" role="tablist" aria-label="Danh sách Invoice xem trước" aria-orientation="vertical">{items.map((i,index)=><button key={i.businessKey} id={'invoice-item-'+index} role="tab" aria-selected={key===i.businessKey} aria-controls="invoice-workspace-page" tabIndex={key===i.businessKey?0:-1} disabled={p.busy} onClick={()=>{p.onSelect();setActive(i.businessKey);}} onKeyDown={e=>{if(p.busy)return;let n=index;if(e.key==='ArrowDown'||e.key==='ArrowRight')n=(index+1)%items.length;else if(e.key==='ArrowUp'||e.key==='ArrowLeft')n=(index+items.length-1)%items.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=items.length-1;else return;e.preventDefault();p.onSelect();setActive(items[n].businessKey);document.getElementById('invoice-item-'+n)?.focus();}}><strong>{i.serviceName??i.invoice.lines.map((l:any)=>l.serviceName).join(' / ')}</strong><span>{i.invoice.invoiceNumber}</span><b>{formatMoney(i.invoice.totals.payable,i.invoice.currency)} {i.invoice.currency}</b><small>{p.previews[i.businessKey]?'Đã tạo PDF xem trước':'Cần kiểm tra PDF'}</small></button>)}</div>
   <div ref={panel} className="invoice-workspace-page" id="invoice-workspace-page" role="tabpanel" aria-labelledby={'invoice-item-'+items.indexOf(item)}>
    <div className="invoice-workspace-toolbar"><div><b>{item.serviceName??'Invoice'}</b><span>Trang ký {position.stamp.page} (trang cuối) · {item.invoice.lines.length} dòng chi tiết</span></div><button disabled={p.busy} onClick={()=>void p.onPage(key)}>Tải lại trang</button><button disabled={p.busy} className="action-primary" onClick={()=>void p.onPage(key,true)}>Tạo PDF có dấu để kiểm tra</button>{p.previews[key]&&<a href={p.previews[key]} target="_blank" rel="noreferrer">Mở PDF Invoice xem trước</a>}</div>
    {p.message&&<p className="notice" role="alert">{p.message}</p>}{p.busy&&<p role="status">Đang chuẩn bị bản xem trước…</p>}
    <div className="invoice-workspace-stage">{p.pages[key]?<InvoiceCanvas retryLabel="Tải lại trang" key={p.pages[key]} src={p.pages[key]} assetId={p.plan.dgcSigningAssets.stamp.id} placement={position.stamp} disabled={p.busy} assetKind="stamp" onChange={v=>p.onPosition(key,'stamp',v)} extra={{assetId:p.plan.dgcSigningAssets.signature.id,kind:'signature',placement:position.signature,onChange:v=>p.onPosition(key,'signature',v)}}/>:!p.busy&&<p>Chưa tải được trang Invoice. Bấm “Tải lại trang” để thử lại.</p>}</div>
    <details className="invoice-workspace-options"><summary>Chỉnh vị trí và kích thước bằng số</summary><h3>Dấu công ty</h3><SigningControls lockPage value={position.stamp} disabled={p.busy} maxPage={position.stamp.page} onChange={v=>p.onPosition(key,'stamp',v)}/><h3>Chữ ký</h3><SigningControls lockPage value={position.signature} disabled={p.busy} maxPage={position.signature.page} onChange={v=>p.onPosition(key,'signature',v)}/></details>
   </div>
  </div>
  <div className="partner-dialog-footer invoice-workspace-footer"><p>PDF xem trước: {ready}/{items.length}. Kiểm tra đầy đủ các trang trong từng PDF trước khi lưu.</p><label className="check-label"><input type="checkbox" checked={p.confirmed} disabled={p.busy||ready!==items.length} onChange={e=>p.onConfirm(e.target.checked)}/>Tôi đã kiểm tra số liệu, thông tin Invoice và vị trí dấu/chữ ký trên từng PDF.</label><div><button disabled={p.busy} onClick={p.onClose}>Để sau</button><button className="action-primary" disabled={p.busy||!p.confirmed||ready!==items.length} onClick={()=>void p.onSave()}>{p.busy?'Đang xử lý…':'Chốt và lưu '+items.length+' Invoice nháp'}</button></div></div>
 </dialog>,document.body);
}
