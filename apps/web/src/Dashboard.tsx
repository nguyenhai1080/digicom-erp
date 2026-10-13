import React,{useEffect,useRef,useState} from 'react';
import {compareRevenue} from './revenue-comparison';
type Props={request:(path:string)=>Promise<any>;permissions:string[]};
type Series={period:string;serviceId:string;total:boolean;revenue:string;wht:string;payable:string;revenueVnd:string|null;whtVnd:string|null;payableVnd:string|null;missingUsd:number;missingVnd:number};
type Data={totals:{usd:string|null;vnd:string|null;missingUsd:number;missingVnd:number};totalPayableUsd:string;services:{id:string;name:string}[];series:Series[]};
const money=(v:string|number,c='USD')=>new Intl.NumberFormat('vi-VN',{minimumFractionDigits:c==='VND'?0:2,maximumFractionDigits:c==='VND'?0:2}).format(Number(v));
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function Dashboard({request,permissions}:Props){
 const canCash=permissions.includes('PAYMENT_VIEW'),[cash,setCash]=useState<{bank:string|null;cash:string|null}|null>(null),[cashLoaded,setCashLoaded]=useState(false),[cashError,setCashError]=useState('');
 const canRevenue=permissions.includes('REVENUE_VIEW'),canAR=permissions.includes('AR_VIEW');
 const [data,setData]=useState<Data|null>(null),[ar,setAr]=useState<any[]|null>(null),[error,setError]=useState(''),[arError,setArError]=useState(''),[busy,setBusy]=useState(false);
 const [year,setYear]=useState(String(new Date().getFullYear())),[service,setService]=useState('all');
 const [currency,setCurrency]=useState<'USD'|'VND'>('USD');
 const [compare,setCompare]=useState(true);
 const sequence=useRef(0);
 async function load(){
  const n=++sequence.current;setBusy(true);setError('');setArError('');setCashError('');
  await Promise.all([
   canCash?request('/cash-balances').then(v=>{if(n===sequence.current){setCash({bank:v.bank,cash:v.cash});setCashLoaded(true);}}).catch(e=>{if(n===sequence.current)setCashError(e.message);}):Promise.resolve(),
   canRevenue?request('/dashboard/revenue').then(v=>{if(n===sequence.current)setData(v);}).catch(e=>{if(n===sequence.current){setData(null);setError(e.message||'Không tải được doanh thu.');}}):Promise.resolve(),
   canAR?request('/receivables?asOf='+new Date().toLocaleDateString('en-CA')).then(v=>{if(n===sequence.current)setAr(v.totalsByCurrency);}).catch(e=>{if(n===sequence.current){setAr(null);setArError(e.message||'Không tải được phải thu.');}}):Promise.resolve()
  ]);if(n===sequence.current)setBusy(false);
 }
 useEffect(()=>{void load();return()=>{sequence.current++;};},[request,canRevenue,canAR,canCash]);
 const years=[...new Set([String(new Date().getFullYear()),...(data?.series.map(r=>r.period.slice(0,4))??[])])].sort().reverse();
 const comparison=compareRevenue(data?.series??[],year,service,currency);
 const {current:rows,values,previousValues,incomplete,sum}=comparison,previousYear=String(Number(year)-1);
 const max=Math.max(...values,...(compare?previousValues:[]),1);
 return <div className="dashboard"><section className="cards dashboard-kpis">
  <article><h3>Doanh thu lũy kế</h3>{(['USD','VND'] as const).map(c=><div className="dashboard-currency" key={c}><span>{c}</span><p className="dashboard-kpi" role="status">{!canRevenue?'Không có quyền':error?'Không tải được':!data?'Đang tải…':data.totals[c==='USD'?'usd':'vnd']===null?'Thiếu tỷ giá':money(data.totals[c==='USD'?'usd':'vnd']!,c)}</p></div>)}</article>
  <article><h3>Phải thu</h3>{(['USD','VND'] as const).map(c=><div className="dashboard-currency" key={c}><span>{c}</span><p className="dashboard-kpi" role="status">{!canAR?'Không có quyền':arError?'Không tải được':ar?money(ar.find(v=>v.currency===c)?.outstanding??'0',c):'Đang tải…'}</p></div>)}</article>
  <article><h3>Phải trả (VND)</h3><p className="dashboard-kpi unavailable">Chưa có dữ liệu</p><small className="muted">Chưa có sổ phải trả</small></article>
  <article><h3>Cash balance (VND)</h3>{(['bank','cash'] as const).map(kind=><div className="dashboard-currency" key={kind}><span>{kind==='bank'?'Tài khoản ngân hàng':'Quỹ tiền mặt'}</span><p className="dashboard-kpi" role="status">{!canCash?'Không có quyền':cashError?'Không tải được':!cashLoaded?'Đang tải…':cash?.[kind]==null?'Chưa khai báo':money(cash[kind]!,'VND')}</p></div>)}</article>
 </section>
 <section className="panel"><h2>Biểu đồ doanh thu dịch vụ theo tháng</h2>
 <div className="dashboard-filters"><label><span className="sr-only">Năm doanh thu</span><select aria-label="Năm doanh thu" value={year} onChange={e=>setYear(e.target.value)}>{years.map(v=><option key={v}>{v}</option>)}</select></label>
 <label><span className="sr-only">Dịch vụ</span><select aria-label="Dịch vụ" value={service} onChange={e=>setService(e.target.value)}><option value="all">Tất cả dịch vụ</option>{data?.services.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Tiền tệ<select aria-label="Tiền tệ báo cáo" value={currency} onChange={e=>setCurrency(e.target.value as 'USD'|'VND')}><option>USD</option><option>VND</option></select></label><button disabled={busy} onClick={()=>void load()}>{busy?'Đang tải…':'Refresh'}</button></div>
 {error&&<p className="notice" role="alert">{error}</p>}{arError&&<p className="notice" role="alert">{arError}</p>}
 {!canRevenue?<p>Không có quyền xem doanh thu.</p>:data&&<><label className="dashboard-compare-toggle"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>So sánh với năm trước ({previousYear})</label><div className="dashboard-summary"><span>Tổng {year}: <b>{incomplete?'Chưa đủ tỷ giá':money(sum,currency)} {currency}</b></span>{compare&&<><span>Cùng kỳ {previousYear}: <b>{comparison.ready?money(comparison.priorSum,currency)+' '+currency:'Chưa đủ dữ liệu'}</b></span><span>Tăng / giảm: <b>{comparison.change===null?'—':(comparison.change>0?'+':'')+new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(comparison.change)+'%'}</b></span></>}</div>
 {compare&&<><div className="dashboard-legend"><span><i style={{background:'#1f4e79'}}/>{year}</span><span><i style={{background:'#91b5d1'}}/>{previousYear}</span></div><p className="muted">So sánh cùng các tháng đã có doanh thu năm {year}{comparison.periods.length?': '+comparison.periods.map(m=>'T'+Number(m)).join(', '):''}. {comparison.previousIncomplete?'Năm trước còn thiếu tỷ giá.':!comparison.ready?'Chưa đủ dữ liệu để tính tăng / giảm.':''}</p></>}
 {incomplete&&<p className="notice">Thiếu tỷ giá cho một số khoản. Biểu đồ chỉ hiển thị phần có tỷ giá; chưa thể dùng làm tổng đầy đủ. Bổ sung tỷ giá trong Cấu hình chung.</p>}<div className="dashboard-chart"><svg viewBox="0 0 1000 340" role="img" aria-label={'Biểu đồ doanh thu năm '+year}><title>{'Doanh thu theo tháng năm '+year}</title><line x1="30" y1="295" x2="980" y2="295" stroke="#d5e2ee"/>
 {values.map((v,i)=>{const x=35+i*79,h=Math.max(0,v/max*245),old=previousValues[i],oldH=Math.max(0,old/max*245);return <g key={i}><title>{months[i]+' '+year+': '+money(v,currency)+' '+currency+(compare?' · '+previousYear+': '+money(old,currency)+' '+currency:'')}</title><rect x={x} y={295-h} width={compare?28:62} height={h} rx="4" fill="#1f4e79"/>{compare&&<rect x={x+34} y={295-oldH} width="28" height={oldH} rx="4" fill="#91b5d1"/>}{!compare&&v!==0&&<text x={x+31} y={285-h} textAnchor="middle" className="dashboard-chart-value">{Math.abs(v)>=1000?(v/1000).toFixed(1)+'K':money(v,currency)}</text>}<text x={x+31} y="320" textAnchor="middle">{months[i]}</text></g>;})}</svg>
 <p className="muted">{rows.length?(service==='all'?'Tất cả dịch vụ chỉ tính doanh thu tổng, không cộng trùng các dịch vụ con.':'Doanh thu riêng của dịch vụ đã chọn, bao gồm dòng chi tiết nếu là dịch vụ con.'):'Không có dữ liệu phù hợp với bộ lọc.'}</p></div></>}
 </section></div>;
}
