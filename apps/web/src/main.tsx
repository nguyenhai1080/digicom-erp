import {CashAccounts} from './CashAccounts';
import {CashManagement} from './CashManagement';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Execution } from './Execution';
import { Partners } from './Partners';
import { Services } from './Services';
import { ServiceContracts } from './ServiceContracts';
import { OutputRecon } from './OutputRecon';
import { CompanyAssets } from './CompanyAssets';
import { ReportingRates } from './ReportingRates';
import { Invoices } from './Invoices';
import {InputRecon} from './InputRecon';
import {SoaCutoffReview} from './SoaCutoffReview';
import {InvoiceHistory} from './InvoiceHistory';
import { FinanceLedger } from './FinanceLedger';
import { Dashboard } from './Dashboard';
import { Users } from './Users';
import {CompanyBrandProvider,useBranding} from './CompanyBranding';
import {AdminSetup} from './AdminSetup';
import {MasterTransfer} from './MasterTransfer';
import {EvidenceTransfer} from './EvidenceTransfer';

type Identity = { userId: string; companyId: string; companyCode: string; fullName: string; email: string; permissions: string[] };
type Session = { user: Identity; csrfToken: string };
const version = '0.6.79';
async function api(path: string, body?: unknown, csrf?: string) {
  const response = await fetch('/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.startsWith('/dgc-migration/evidence/') ? 120000 : (path === '/invoices/create' || path.endsWith('/finalize') || path.startsWith('/input-recon/')) ? 65000 : (path.endsWith('/documents') || path === '/company-assets' || path === '/output-recon/uploads' || path === '/output-recon/inspect' || path.endsWith('/read')) ? (path.endsWith('/read') || path === '/output-recon/inspect' ? 120000 : 60000) : 15000)
  });
  if (response.status === 401 && path === '/auth/me') return null;
  if (response.status === 401) window.dispatchEvent(new Event('erp-session-expired'));
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Không thể xử lý yêu cầu.');
  return result;
}
function App() {
  const branding=useBranding();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState('Đang kiểm tra dịch vụ…');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState('dashboard');
  const [reconFxVersion,setReconFxVersion]=useState(0);
  useEffect(() => {
    let cancelled = false;
    const expired = () => { setSession(null); setPage('dashboard'); };
    window.addEventListener('erp-session-expired', expired);
    void api('/auth/me').then(result => { if (!cancelled) setSession(result); })
      .catch(() => { if (!cancelled) setMessage('Không kết nối được dịch vụ. Vui lòng thử lại.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    void api('/health').then(result => {
      if (!cancelled) setHealth(result.status === 'ok' && result.database === 'connected' ? 'Dịch vụ đang hoạt động' : 'Chưa xác nhận kết nối');
    }).catch(() => { if (!cancelled) setHealth('Chưa kết nối được dịch vụ'); });
    return () => { cancelled = true; window.removeEventListener('erp-session-expired', expired); };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    setBusy(true); setMessage('');
    try {
      const body = { companyCode: branding.companyCode, email: data.get('email'), password };
      await api('/auth/login', body); setSession(await api('/auth/me')); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không kết nối được dịch vụ.'); }
    finally { const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = ''; setBusy(false); }
  }
  async function logout() {
    if (!session) return; setBusy(true); setMessage('');
    try { await api('/auth/logout', {}, session.csrfToken); setSession(null); setPage('dashboard'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Không đăng xuất được.'); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="auth-screen"><p role="status">Đang kiểm tra phiên đăng nhập…</p></main>;
  if(!session&&branding.companyCode==='DGC'&&window.location.pathname==='/setup')return <AdminSetup companyCode={branding.companyCode} appName={branding.appName}/>;
  if (!session) return <main className="auth-screen"><section className="auth-card">
    <div className="brand">{branding.appName}</div><p className="muted">Không gian quản lý công việc và tài chính</p>
    <h1>Đăng nhập</h1>
    <form method="post" onSubmit={submit}><fieldset disabled={busy}>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="username" /></label>
      <label>Mật khẩu<input name="password" type="password" required minLength={1} maxLength={128} autoComplete="current-password" /></label>
      <button className="primary" type="submit">{busy ? 'Đang xử lý…' : 'Đăng nhập'}</button>
    </fieldset></form>
    {message && <p className="notice" role="alert">{message}</p>}
    <footer><span role="status">{health}</span><span>v{version} · Staging</span></footer>
  </section></main>;
  if(session.user.companyCode==='DGC'&&session.user.permissions.includes('SYSTEM_CONFIG_EDIT')&&window.location.pathname==='/migration/masters')return <MasterTransfer request={api} csrf={session.csrfToken}/>;
  if(session.user.companyCode==='DGC'&&session.user.permissions.includes('SYSTEM_CONFIG_EDIT')&&window.location.pathname==='/migration/evidence')return <EvidenceTransfer request={api} csrf={session.csrfToken}/>;
  return <div className="shell"><aside><h2>{branding.appName}</h2><p className="sidebar-subtitle">Hệ thống quản lý công việc và tài chính<br/>{session.user.companyCode}</p><div className="nav-title">QUẢN LÝ</div><nav className="sidebar-nav" aria-label="Quản lý ERP">
    <button className={'nav ' + (page === 'dashboard' ? 'active' : '')} aria-current={page==='dashboard'?'page':undefined} onClick={() => { setPage('dashboard'); setMessage(''); }}>Dashboard</button>
    {session.user.permissions.includes('PROJECT_VIEW') && <button className={'nav ' + (page === 'projects' ? 'active' : '')} aria-current={page==='projects'?'page':undefined} onClick={() => setPage('projects')}>Quản lý Dự án</button>}
    {session.user.permissions.includes('SERVICE_VIEW') && <button className={'nav ' + (page === 'services' ? 'active' : '')} aria-current={page==='services'?'page':undefined} onClick={() => setPage('services')}>Quản lý Dịch vụ</button>}
    {session.user.permissions.includes('PARTNER_VIEW') && <button className={'nav ' + (page === 'partners' ? 'active' : '')} aria-current={page==='partners'?'page':undefined} onClick={() => setPage('partners')}>Quản lý Đối tác</button>}
    {session.user.permissions.includes('CONTRACT_VIEW') && <button className={'nav ' + (page === 'contracts' ? 'active' : '')} aria-current={page==='contracts'?'page':undefined} onClick={() => setPage('contracts')}>Quản lý Hợp đồng</button>}
    {session.user.permissions.includes('RECON_VIEW') && <button className={'nav ' + (page === 'output-recon' ? 'active' : '')} aria-current={page==='output-recon'?'page':undefined} onClick={() => setPage('output-recon')}>Đối soát đầu ra</button>}
    {session.user.companyCode==='DGC'&&session.user.permissions.includes('INPUT_RECON_VIEW')&&<button className={'nav '+(page==='input-recon'?'active':'')} onClick={()=>setPage('input-recon')}>Đối soát đầu vào</button>}
    {session.user.companyCode==='DGC'&&session.user.permissions.includes('AP_VIEW')&&<button className={'nav '+(page==='payables'?'active':'')} onClick={()=>setPage('payables')}>Công nợ phải trả</button>}
    {session.user.permissions.includes('REVENUE_VIEW') && <button className={'nav ' + (page === 'revenues' ? 'active' : '')} onClick={() => setPage('revenues')}>Quản lý Doanh thu</button>}
    {session.user.permissions.includes('AR_VIEW') && <button className={'nav ' + (page === 'receivables' ? 'active' : '')} onClick={() => setPage('receivables')}>Quản lý Công nợ</button>}
    {session.user.permissions.includes('INVOICE_VIEW') && <button className={'nav ' + (page === 'invoices' ? 'active' : '')} aria-current={page==='invoices'?'page':undefined} onClick={() => setPage('invoices')}>Quản lý Invoice</button>}
    {session.user.companyCode==='DGC'&&session.user.permissions.includes('INVOICE_VIEW')&&<button className={'nav '+(page==='invoice-history'?'active':'')} aria-current={page==='invoice-history'?'page':undefined} onClick={()=>setPage('invoice-history')}>Invoice lịch sử</button>}
    {session.user.companyCode==='DGC'&&['AR_VIEW','INVOICE_VIEW','INVOICE_PAYMENT_VIEW'].every(p=>session.user.permissions.includes(p))&&<button className={'nav '+(page==='soa-review'?'active':'')} aria-current={page==='soa-review'?'page':undefined} onClick={()=>setPage('soa-review')}>Đối chiếu ngày chốt SOA</button>}
    {session.user.permissions.includes('PAYMENT_VIEW') && <button className={'nav '+(page==='cash'?'active':'')} onClick={()=>setPage('cash')}>Quản lý Thu chi</button>}
    {session.user.companyCode==='DGC'&&session.user.permissions.includes('REVENUE_VIEW')&&<button className={'nav '+(page==='reporting-rates'?'active':'')} aria-current={page==='reporting-rates'?'page':undefined} onClick={()=>setPage('reporting-rates')}>Tỷ giá báo cáo</button>}
    {session.user.permissions.includes('SYSTEM_CONFIG_EDIT') && <button className={'nav ' + (page === 'assets' ? 'active' : '')} aria-current={page==='assets'?'page':undefined} onClick={() => setPage('assets')}>Cấu hình chung</button>}
    {session.user.permissions.includes('USER_VIEW') && <button className={'nav '+(page==='users'?'active':'')} onClick={()=>setPage('users')}>Quản lý Người dùng</button>}
    </nav><div className="sidebar-footer">{branding.appName} · v{version}</div>
  </aside><main><header><div><h1>{page==='invoice-history'?'Invoice lịch sử':page==='soa-review'?'Đối chiếu ngày chốt SOA':page==='reporting-rates'?'Tỷ giá báo cáo':page==='input-recon'?'Đối soát đầu vào':page==='payables'?'Công nợ phải trả':page==='cash'?'Quản lý Thu chi':page === 'users' ? 'Quản lý Người dùng' : page === 'revenues' ? 'Quản lý Doanh thu' : page === 'receivables' ? 'Quản lý Công nợ' : page === 'invoices' ? 'Quản lý Invoice' : page === 'assets' ? 'Cấu hình chung' : page === 'output-recon' ? 'Đối soát đầu ra' : page === 'contracts' ? 'Quản lý Hợp đồng' : page === 'projects' ? 'Quản lý Dự án' : page === 'partners' ? 'Quản lý Đối tác' : page === 'services' ? 'Quản lý Dịch vụ' : 'Dashboard'}</h1><p className="lead">{page==='invoice-history'?'Tra cứu các bản lưu và PDF gốc theo hàng nguồn.':page==='soa-review'?'So sánh số dư theo thời điểm ghi nhận khoản thu.':page==='reporting-rates'?'Tỷ giá VND / USD dùng chung theo tháng.':page==='input-recon'?'Tính khoản chia cho đối tác đầu vào từ doanh thu đã duyệt.':page==='payables'?'Công nợ phải trả từ đối soát đầu vào đã duyệt.':page==='cash'?'Theo dõi tiền vào, tiền ra và số dư tài khoản/quỹ.':page==='users'?'Tài khoản, vai trò và quyền truy cập.':page==='revenues'?'Theo dõi doanh thu và nguồn đối soát đã chốt.':page==='receivables'?'Theo dõi phải thu, số dư và số ngày quá hạn từ Invoice phát hành.':page==='invoices'?'Tạo Invoice theo template công ty từ doanh thu đối soát đã chốt.':page==='assets'?'Tỷ giá chung, logo, dấu, chữ ký và template Invoice theo công ty.':page==='output-recon'?'Nhận và kiểm tra PDF đối soát theo đối tác, dịch vụ và kỳ.':page==='contracts'?'Quản lý hợp đồng dịch vụ đầu vào và đầu ra.':page==='services'?'Xem danh sách dịch vụ, thêm mới và cập nhật bằng popup nhập liệu.':page==='partners'?'Quản lý hồ sơ đối tác đầu vào và đầu ra.':page==='projects'?'Theo dõi tiến độ, ngân sách và chi phí dự án.':'Tổng quan hệ thống ERP và công ty.'}</p></div><div className="top-user"><div><p>{session.user.fullName}</p><p className="muted">{session.user.companyCode} · {session.user.email}</p></div><button onClick={logout} disabled={busy}>Đăng xuất</button></div></header>
    {message && <p className="notice" role="alert">{message}</p>}
    {session.user.companyCode==='DGC'&&['input-recon','output-recon'].includes(page)&&session.user.permissions.includes('REVENUE_VIEW')&&<details className="panel"><summary>Tỷ giá dùng cho đối soát đầu vào / đầu ra</summary><ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>setReconFxVersion(v=>v+1)}/></details>}
    {page==='invoice-history'?<InvoiceHistory request={api}/>:page==='soa-review'?<SoaCutoffReview request={api}/>:page==='reporting-rates'?<ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>{}}/>:page==='input-recon'||page==='payables'?<InputRecon key={page} ratesVersion={reconFxVersion} request={api} csrf={session.csrfToken} permissions={session.user.permissions} payables={page==='payables'}/>:page==='cash'?<CashManagement request={api} csrf={session.csrfToken} permissions={session.user.permissions}/>:page === 'users' ? <Users request={api} csrf={session.csrfToken} permissions={session.user.permissions} userId={session.user.userId}/> : page === 'dashboard' ? <Dashboard key={session.user.companyId} request={api} permissions={session.user.permissions}/> : (page === 'revenues'||page === 'receivables') ? <FinanceLedger key={page} kind={page} request={api} csrf={session.csrfToken} permissions={session.user.permissions} canDownload={session.user.permissions.includes('INVOICE_VIEW')}/> : page === 'invoices' ? <Invoices permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'assets' ? <><CashAccounts request={api} csrf={session.csrfToken} permissions={session.user.permissions}/><ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>{}}/><CompanyAssets csrf={session.csrfToken} request={api}/></> : page === 'output-recon' ? <OutputRecon permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'contracts' ? <ServiceContracts permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'services' ? <Services permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'partners' ? <Partners permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : <Execution permissions={session.user.permissions} csrf={session.csrfToken} request={api}/>}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><CompanyBrandProvider><App/></CompanyBrandProvider></React.StrictMode>);
