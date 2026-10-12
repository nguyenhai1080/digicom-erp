import {formatMoney,formatNumber} from './numbers';
import React,{useEffect,useState} from 'react';
type Props={invoiceId:string;csrf:string;permissions:string[];request:(path:string,body?:unknown,csrf?:string)=>Promise<any>;onClose:()=>void;onSaved:()=>Promise<void>};
const money=formatMoney;
export function InvoicePayments({invoiceId,csrf,permissions,request,onClose,onSaved}:Props){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false),[file,setFile]=useState<File|null>(null);
 const [form,setForm]=useState({paymentDate:new Date().toLocaleDateString('en-CA'),paidUsd:'',paidVnd:'',fxRate:'',swiftNo:'',bankAccount:'',paymentMethod:'Bank Transfer',note:''}),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 async function load(){setData(await request('/invoices/'+invoiceId+'/payments'));}
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[invoiceId]);
 const canPost=['PAYMENT_POST','PAYMENT_CREATE','PAYMENT_APPROVE'].every(p=>permissions.includes(p));
 function change(key:string,value:string){setForm(v=>({...v,[key]:value}));setConfirmed(false);setRequestId(crypto.randomUUID());}
 async function save(){
  setBusy(true);setMessage('');try{
   let swiftFile;
   if(file){if(file.size>5*1024*1024)throw new Error('Chứng từ tối đa 5 MB.');const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});swiftFile={filename:file.name,base64};}
   const result=await request('/invoices/'+invoiceId+'/payments',{...form,paidUsd:data.invoice.currency==='VND'?'0':form.paidUsd,fxRate:data.invoice.currency==='VND'?'1':form.fxRate||undefined,requestId,expectedUpdatedAt:data.invoice.updatedAt,confirmed:true,swiftFile},csrf);
   setMessage(result.message);setConfirmed(false);setForm(v=>({...v,paidUsd:'',paidVnd:'',fxRate:'',swiftNo:'',note:''}));setFile(null);setRequestId(crypto.randomUUID());await load();await onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:'Không ghi nhận được thanh toán.');}finally{setBusy(false);}
 }
 const inv=data?.invoice,eligible=inv&&['ISSUED','OVERDUE','PARTIALLY_PAID'].includes(inv.status)&&Number(inv.outstanding)>0;
 return <section className="invoice-preview"><div className="panel-heading"><h3>Thanh toán Invoice {inv?.invoiceNumber}</h3><button disabled={busy} onClick={onClose}>Đóng</button></div>
 {message&&<p className="notice" role="alert">{message}</p>}{inv&&<><section className="cards"><article><b>Phải thu {inv.currency}</b><p>{money(inv.payable,inv.currency)}</p></article><article><b>Đã thu {inv.currency}</b><p>{money(inv.paid,inv.currency)}</p></article><article><b>Còn phải thu {inv.currency}</b><p>{inv.outstanding===null?'Chưa phát hành':money(inv.outstanding,inv.currency)}</p></article></section>
 {eligible&&canPost&&<><h4>Ghi nhận tiền đã nhận</h4><div className="partner-grid">
 <label>Ngày thanh toán<input type="date" disabled={busy} value={form.paymentDate} onChange={e=>change('paymentDate',e.target.value)}/></label>
 {inv.currency==='USD'&&<label>Số tiền đã thu USD<input type="number" min="0.01" step="0.01" max={inv.outstanding} disabled={busy} value={form.paidUsd} onChange={e=>change('paidUsd',e.target.value)}/></label>}
 <label>Số tiền thực nhận VND<input type="number" min="1" step="1" disabled={busy} value={form.paidVnd} onChange={e=>change('paidVnd',e.target.value)}/></label>
 <label>Tỷ giá thanh toán<input readOnly value={inv.currency==='VND'?'1':Number(form.paidUsd)>0&&Number(form.paidVnd)>0?(Number(form.paidVnd)/Number(form.paidUsd)).toFixed(2):''}/></label><label>Còn phải thu sau thanh toán ({inv.currency})<input readOnly value={(inv.currency==='VND'?form.paidVnd:form.paidUsd)?Math.max(0,Number(inv.outstanding)-Number(inv.currency==='VND'?form.paidVnd:form.paidUsd)).toFixed(2):inv.outstanding}/></label>
 <label>Số SWIFT / tham chiếu<input disabled={busy} value={form.swiftNo} onChange={e=>change('swiftNo',e.target.value)}/></label>
 <label>Tài khoản nhận tiền *<input disabled={busy} value={form.bankAccount} onChange={e=>change('bankAccount',e.target.value)}/></label>
 <label>Phương thức<select disabled={busy} value={form.paymentMethod} onChange={e=>change('paymentMethod',e.target.value)}><option value="Bank Transfer">Chuyển khoản</option><option value="Cash">Tiền mặt</option><option value="Other">Khác</option></select></label>
 <label>Chứng từ SWIFT (PDF / PNG / JPEG, tối đa 5 MB)<input key={String(!file)} type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setConfirmed(false);setRequestId(crypto.randomUUID());}}/>{file&&<small>{file.name}</small>}</label>
 <label>Ghi chú<textarea disabled={busy} value={form.note} onChange={e=>change('note',e.target.value)}/></label></div>
 <p className="muted">{inv.currency==='VND'?'Tiền thu VND giảm công nợ VND.':'USD giảm công nợ; VND ghi nhận tiền thực thu.'} Tỷ giá không thay đổi doanh thu đã chốt.</p>
 <label className="check-label"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã kiểm tra chứng từ và xác nhận đã nhận khoản tiền này.</label>
 <button className="action-primary" disabled={busy||!confirmed||(inv.currency==='USD'&&!form.paidUsd)||!form.paidVnd||!form.bankAccount.trim()} onClick={()=>void save()}>{busy?'Đang ghi nhận…':'Ghi nhận thanh toán'}</button></>}
 <h4>Lịch sử thanh toán</h4><div className="table-scroll"><table><thead><tr><th>Mã / ngày</th><th>Đã thu {inv.currency}</th><th>Thực nhận VND</th><th>Tỷ giá</th><th>SWIFT / tài khoản</th><th>Chứng từ</th></tr></thead><tbody>{data.items.map((p:any)=><tr key={p.id}><td>{p.paymentCode}<small>{p.paymentDate.slice(0,10)}</small></td><td className="number">{money(inv.currency==='VND'?p.paidVnd:p.paidUsd,inv.currency)}</td><td className="number">{formatMoney(p.paidVnd,'VND')}</td><td className="number">{formatNumber(p.fxRate,0,8)}</td><td>{p.swiftNo||'—'}<small>{p.bankAccount} · {p.paymentMethod}</small><small>{p.note}</small></td><td>{p.documentId?<a href={'/api/v1/invoice-payments/'+p.id+'/document'} target="_blank" rel="noreferrer">Mở chứng từ</a>:'—'}</td></tr>)}</tbody></table></div>{!data.items.length&&<p className="muted">Chưa có thanh toán.</p>}</>}
 </section>;
}
