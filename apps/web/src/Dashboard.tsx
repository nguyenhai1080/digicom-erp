import React,{useEffect,useRef,useState} from 'react';
type Props={request:(path:string)=>Promise<any>;permissions:string[]};
type Series={period:string;serviceId:string;total:boolean;revenue:string;wht:string;payable:string;revenueVnd:string|null;whtVnd:string|null;payableVnd:string|null;missingUsd:number;missingVnd:number};
type Data={totals:{usd:string|null;vnd:string|null;missingUsd:number;missingVnd:number};totalPayableUsd:string;services:{id:string;name:string}[];series:Series[]};
const money=(v:string|number,c='USD')=>new Intl.NumberFormat('vi-VN',{minimumFractionDigits:c==='VND'?0:2,maximumFractionDigits:c==='VND'?0:2}).format(Number(v));
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function Dashboard({request,permissions}:Props){
 const canRevenue=permissions.includes('REVENUE_VIEW'),canAR=permissions.includes('AR_VIEW');
 const [data,setData]=useState<Data|null>(null),[ar,setAr]=useState<any[]|null>(null),[error,setError]=useState(''),[arError,setArError]=useState(''),[busy,setBusy]=useState(false);
 const [year,setYear]=useState(String(new Date().getFullYear())),[service,setService]=useState('all');
 const [currency,setCurrency]=useState<'USD'|'VND'>('USD');
 const sequence=useRef(0);
 async function load(){
  const n=++sequence.current;setBusy(true);setError('');setArError('');
  await Promise.all([
   canRevenue?request('/dashboard/revenue').then(v=>{if(n===sequence.current)setData(v);}).catch(e=>{if(n===sequence.current){setData(null);setError(e.message||'Không tải được doanh thu.');}}):Promise.resolve(),
   canAR?request('/receivables?asOf='+new Date().toLocaleDateString('en-CA')).then(v=>{if(n===sequence.current)setAr(v.totalsByCurrency);}).catch(e=>{if(n===sequence.current){setAr(null);setArError(e.message||'Không tải được phải thu.');}}):Promise.resolve()
  ]);if(n===sequence.current)setBusy(false);
 }
 useEffect(()=>{void load();return()=>{sequence.current++;};},[request,canRevenue,canAR]);
 const years=[...new Set([String(new Date().getFullYear()),...(data?.series.map(r=>r.period.slice(0,4))??[])])].sort().reverse();
 const rows=(data?.series??[]).filter(r=>r.period.startsWith(year+'-')&&(service==='all'?r.total:r.serviceId===service));
 // GST revenue is the payable entitlement after deductions, in either reporting currency.
 const values=Array.from({length:12},(_,i)=>rows.filter(r=>Number(r.period.slice(5))===i+1).reduce((sum,r)=>sum+Math.round(Number(currency==='VND'?r.payableVnd:r.payable)*100),0)/100);
 const incomplete=rows.some(r=>currency==='USD'?r.missingUsd>0:r.missingVnd>0);
 const sum=values.reduce((s,v)=>s+Math.round(v*100),0)/100,max=Math.max(...values,1);
 return <div className="dashboard"><section className="cards dashboard-kpis">
  <article><h3>Doanh thu lũy kế</h3>{(['USD','VND'] as const).map(c=><div className="dashboard-currency" key={c}><span>{c}</span><p className="dashboard-kpi" role="status">{!canRevenue?'Không có quyền':error?'Không tải được':!data?'Đang tải…':data.totals[c==='USD'?'usd':'vnd']===null?'Thiếu tỷ giá':money(data.totals[c==='USD'?'usd':'vnd']!,c)}</p></div>)}<small className="muted">Phần GST thực nhận · Quy đổi theo kỳ</small></article>
  <article><h3>Phải thu</h3>{(['USD','VND'] as const).map(c=><div className="dashboard-currency" key={c}><span>{c}</span><p className="dashboard-kpi" role="status">{!canAR?'Không có quyền':arError?'Không tải được':ar?money(ar.find(v=>v.currency===c)?.outstanding??'0',c):'Đang tải…'}</p></div>)}<small className="muted">Công nợ theo tiền tệ gốc</small></article>
  <article><h3>Phải trả (VND)</h3><p className="dashboard-kpi unavailable">Chưa có dữ liệu</p><small className="muted">Chưa có sổ phải trả</small></article>
  <article><h3>Cash balance (VND)</h3><p className="dashboard-kpi unavailable">Chưa có dữ liệu</p><small className="muted">Chưa có sổ thu chi</small></article>
 </section>
 <section className="panel"><h2>Biểu đồ doanh thu dịch vụ theo tháng</h2>
 <div className="dashboard-filters"><label><span className="sr-only">Năm doanh thu</span><select aria-label="Năm doanh thu" value={year} onChange={e=>setYear(e.target.value)}>{years.map(v=><option key={v}>{v}</option>)}</select></label>
 <label><span className="sr-only">Dịch vụ</span><select aria-label="Dịch vụ" value={service} onChange={e=>setService(e.target.value)}><option value="all">Tất cả dịch vụ</option>{data?.services.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Tiền tệ<select aria-label="Tiền tệ báo cáo" value={currency} onChange={e=>setCurrency(e.target.value as 'USD'|'VND')}><option>USD</option><option>VND</option></select></label><button disabled={busy} onClick={()=>void load()}>{busy?'Đang tải…':'Refresh'}</button></div>
 {error&&<p className="notice" role="alert">{error}</p>}{arError&&<p className="notice" role="alert">{arError}</p>}
 {!canRevenue?<p>Không có quyền xem doanh thu.</p>:data&&<><div className="dashboard-summary"><span>Tổng: <b>{incomplete?'Chưa đủ tỷ giá':money(sum)} {currency}</b></span><span>Năm: <b>{year}</b></span></div>
 {incomplete&&<p className="notice">Thiếu tỷ giá cho một số khoản. Biểu đồ chỉ hiển thị phần có tỷ giá; chưa thể dùng làm tổng đầy đủ. Bổ sung tỷ giá trong Cấu hình chung.</p>}<div className="dashboard-chart"><svg viewBox="0 0 1000 340" role="img" aria-label={'Biểu đồ doanh thu năm '+year}><title>{'Doanh thu theo tháng năm '+year}</title><line x1="30" y1="295" x2="980" y2="295" stroke="#d5e2ee"/>
 {values.map((v,i)=>{const x=35+i*79,h=Math.max(0,v/max*245);return <g key={i}><title>{months[i]+': '+money(v)+' '+currency}</title><rect x={x} y={295-h} width="62" height={h} rx="5" fill="#1f4e79"/>{v!==0&&<text x={x+31} y={285-h} textAnchor="middle" className="dashboard-chart-value">{Math.abs(v)>=1000?(v/1000).toFixed(1)+'K':money(v)}</text>}<text x={x+31} y="320" textAnchor="middle">{months[i]}</text></g>;})}</svg>
 <p className="muted">{rows.length?(service==='all'?'Tất cả dịch vụ chỉ tính doanh thu tổng, không cộng trùng các dịch vụ con.':'Doanh thu riêng của dịch vụ đã chọn, bao gồm dòng chi tiết nếu là dịch vụ con.'):'Không có dữ liệu phù hợp với bộ lọc.'}</p></div></>}
 </section></div>;
}
