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
import { FinanceLedger } from './FinanceLedger';
import { Dashboard } from './Dashboard';
import { Users } from './Users';

type Identity = { userId: string; companyId: string; companyCode: string; fullName: string; email: string; permissions: string[] };
type Session = { user: Identity; csrfToken: string };
const version = '0.6.48';
document.title = `ERP Core Web · v${version}`;
async function api(path: string, body?: unknown, csrf?: string) {
  const response = await fetch('/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout((path === '/invoices/create' || path.endsWith('/finalize')) ? 65000 : (path.endsWith('/documents') || path === '/company-assets' || path === '/output-recon/uploads' || path === '/output-recon/inspect' || path.endsWith('/read')) ? (path.endsWith('/read') || path === '/output-recon/inspect' ? 120000 : 60000) : 15000)
  });
  if (response.status === 401 && path === '/auth/me') return null;
  if (response.status === 401) window.dispatchEvent(new Event('erp-session-expired'));
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Không thể xử lý yêu cầu.');
  return result;
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState('Đang kiểm tra dịch vụ…');
  const [message, setMessage] = useState('');
  const [setup, setSetup] = useState(window.location.hash === '#setup');
  const [page, setPage] = useState('dashboard');
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
  function changeMode(value: boolean) { setSetup(value); window.location.hash = value ? 'setup' : ''; setMessage(''); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (setup && password !== data.get('confirmation')) { setMessage('Hai mật khẩu chưa khớp.'); return; }
    setBusy(true); setMessage('');
    try {
      const body = { companyCode: data.get('companyCode'), email: data.get('email'), password };
      if (setup) {
        await api('/auth/bootstrap', { ...body, fullName: data.get('fullName'), setupToken: data.get('setupToken') });
        form.reset(); changeMode(false); setMessage('Đã tạo tài khoản quản trị. Bạn có thể đăng nhập.');
      } else {
        await api('/auth/login', body); setSession(await api('/auth/me')); form.reset();
      }
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
  if (!session) return <main className="auth-screen"><section className="auth-card">
    <div className="brand">ERP Core</div><p className="muted">Không gian quản lý công việc và tài chính</p>
    <h1>{setup ? 'Thiết lập quản trị' : 'Đăng nhập'}</h1>
    {setup && <p>Chỉ dùng cho tài khoản quản trị đầu tiên, khi bạn đã được cấp mã thiết lập.</p>}
    <form method="post" onSubmit={submit}><fieldset disabled={busy}>
      <label>Mã công ty<input name="companyCode" defaultValue="GST" required maxLength={50} autoComplete="organization" /></label>
      {setup && <label>Họ và tên<input name="fullName" required maxLength={120} autoComplete="name" /></label>}
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="username" /></label>
      <label>Mật khẩu<input name="password" type="password" required minLength={setup ? 15 : 1} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} /></label>
      {setup && <><p className="hint">Dùng mật khẩu từ 15 ký tự.</p><label>Nhập lại mật khẩu<input name="confirmation" type="password" required minLength={15} maxLength={128} autoComplete="new-password" /></label><label>Mã thiết lập<input name="setupToken" type="password" required minLength={32} maxLength={512} autoComplete="off" /></label></>}
      <button className="primary" type="submit">{busy ? 'Đang xử lý…' : setup ? 'Tạo tài khoản quản trị' : 'Đăng nhập'}</button>
    </fieldset></form>
    {message && <p className="notice" role="alert">{message}</p>}
    <button className="text-button" onClick={() => changeMode(!setup)} disabled={busy}>{setup ? 'Quay lại đăng nhập' : 'Thiết lập quản trị lần đầu'}</button>
    <footer><span role="status">{health}</span><span>v{version} · Staging</span></footer>
  </section></main>;
  return <div className="shell"><aside><h2>ERP Core</h2><p className="sidebar-subtitle">Hệ thống quản lý công việc và tài chính<br/>{session.user.companyCode}</p><div className="nav-title">QUẢN LÝ</div><nav className="sidebar-nav" aria-label="Quản lý ERP">
    <button className={'nav ' + (page === 'dashboard' ? 'active' : '')} aria-current={page==='dashboard'?'page':undefined} onClick={() => { setPage('dashboard'); setMessage(''); }}>Dashboard</button>
    {session.user.permissions.includes('PROJECT_VIEW') && <button className={'nav ' + (page === 'projects' ? 'active' : '')} aria-current={page==='projects'?'page':undefined} onClick={() => setPage('projects')}>Quản lý Dự án</button>}
    {session.user.permissions.includes('SERVICE_VIEW') && <button className={'nav ' + (page === 'services' ? 'active' : '')} aria-current={page==='services'?'page':undefined} onClick={() => setPage('services')}>Quản lý Dịch vụ</button>}
    {session.user.permissions.includes('PARTNER_VIEW') && <button className={'nav ' + (page === 'partners' ? 'active' : '')} aria-current={page==='partners'?'page':undefined} onClick={() => setPage('partners')}>Quản lý Đối tác</button>}
    {session.user.permissions.includes('CONTRACT_VIEW') && <button className={'nav ' + (page === 'contracts' ? 'active' : '')} aria-current={page==='contracts'?'page':undefined} onClick={() => setPage('contracts')}>Quản lý Hợp đồng</button>}
    {session.user.permissions.includes('RECON_VIEW') && <button className={'nav ' + (page === 'output-recon' ? 'active' : '')} aria-current={page==='output-recon'?'page':undefined} onClick={() => setPage('output-recon')}>Đối soát đầu ra</button>}
    {session.user.permissions.includes('REVENUE_VIEW') && <button className={'nav ' + (page === 'revenues' ? 'active' : '')} onClick={() => setPage('revenues')}>Quản lý Doanh thu</button>}
    {session.user.permissions.includes('AR_VIEW') && <button className={'nav ' + (page === 'receivables' ? 'active' : '')} onClick={() => setPage('receivables')}>Quản lý Công nợ</button>}
    {session.user.permissions.includes('INVOICE_VIEW') && <button className={'nav ' + (page === 'invoices' ? 'active' : '')} aria-current={page==='invoices'?'page':undefined} onClick={() => setPage('invoices')}>Quản lý Invoice</button>}
    {session.user.permissions.includes('SYSTEM_CONFIG_EDIT') && <button className={'nav ' + (page === 'assets' ? 'active' : '')} aria-current={page==='assets'?'page':undefined} onClick={() => setPage('assets')}>Cấu hình chung</button>}
    {session.user.permissions.includes('USER_VIEW') && <button className={'nav '+(page==='users'?'active':'')} onClick={()=>setPage('users')}>Quản lý Người dùng</button>}
    </nav><div className="sidebar-footer">ERP Core · v{version}</div>
  </aside><main><header><div><h1>{page === 'users' ? 'Quản lý Người dùng' : page === 'revenues' ? 'Quản lý Doanh thu' : page === 'receivables' ? 'Quản lý Công nợ' : page === 'invoices' ? 'Quản lý Invoice' : page === 'assets' ? 'Cấu hình chung' : page === 'output-recon' ? 'Đối soát đầu ra' : page === 'contracts' ? 'Quản lý Hợp đồng' : page === 'projects' ? 'Quản lý Dự án' : page === 'partners' ? 'Quản lý Đối tác' : page === 'services' ? 'Quản lý Dịch vụ' : 'Dashboard'}</h1><p className="lead">{page==='users'?'Tài khoản, vai trò và quyền truy cập.':page==='revenues'?'Theo dõi doanh thu và nguồn đối soát đã chốt.':page==='receivables'?'Theo dõi phải thu, số dư và số ngày quá hạn từ Invoice phát hành.':page==='invoices'?'Tạo Invoice theo template GST từ doanh thu đối soát đã chốt.':page==='assets'?'Tỷ giá chung, logo, dấu, chữ ký và template Invoice theo công ty.':page==='output-recon'?'Nhận và kiểm tra PDF đối soát theo đối tác, dịch vụ và kỳ.':page==='contracts'?'Quản lý hợp đồng dịch vụ đầu vào và đầu ra theo DGC.':page==='services'?'Xem danh sách dịch vụ, thêm mới và cập nhật bằng popup nhập liệu.':page==='partners'?'Quản lý hồ sơ đối tác đầu vào và đầu ra.':page==='projects'?'Theo dõi tiến độ, ngân sách và chi phí dự án.':'Tổng quan hệ thống ERP và công ty.'}</p></div><div className="top-user"><div><p>{session.user.fullName}</p><p className="muted">{session.user.companyCode} · {session.user.email}</p></div><button onClick={logout} disabled={busy}>Đăng xuất</button></div></header>
    {message && <p className="notice" role="alert">{message}</p>}
    {page === 'users' ? <Users request={api} csrf={session.csrfToken} permissions={session.user.permissions} userId={session.user.userId}/> : page === 'dashboard' ? <Dashboard key={session.user.companyId} request={api} permissions={session.user.permissions}/> : (page === 'revenues'||page === 'receivables') ? <FinanceLedger key={page} kind={page} request={api} csrf={session.csrfToken} permissions={session.user.permissions} canDownload={session.user.permissions.includes('INVOICE_VIEW')}/> : page === 'invoices' ? <Invoices permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'assets' ? <><ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>{}}/><CompanyAssets csrf={session.csrfToken} request={api}/></> : page === 'output-recon' ? <OutputRecon permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'contracts' ? <ServiceContracts permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'services' ? <Services permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'partners' ? <Partners permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : <Execution permissions={session.user.permissions} csrf={session.csrfToken} request={api}/>}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
