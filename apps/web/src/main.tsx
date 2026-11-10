import {DigicomDashboard,type DashboardTarget} from './DigicomDashboard';
import {DgcReconciliation,DgcDebt,DgcInvoices,DgcSettings} from './DgcWorkspaces';
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
import {StatementsOfAccount} from './StatementsOfAccount';
import {InvoiceHistory} from './InvoiceHistory';
import { FinanceLedger } from './FinanceLedger';
import { Dashboard } from './Dashboard';
import { Users } from './Users';
import {CompanyBrandProvider,useBranding,companyDisplayName,displayBrandText} from './CompanyBranding';
import {AdminSetup} from './AdminSetup';
import {MasterTransfer} from './MasterTransfer';
import {EvidenceTransfer} from './EvidenceTransfer';
import {CapturedBookTransfer} from './CapturedBookTransfer';
import {OctoberRestart} from './OctoberRestart';

type Identity = { userId: string; companyId: string; companyCode: string; fullName: string; email: string; permissions: string[] };
type Session = { user: Identity; csrfToken: string };
const version = '0.6.97';
async function api(path: string, body?: unknown, csrf?: string) {
  const response = await fetch('/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.startsWith('/dgc-migration/') ? 120000 : (path === '/invoices/create' || path.endsWith('/finalize') || path.startsWith('/input-recon/')) ? 65000 : (path.endsWith('/documents') || path === '/company-assets' || path === '/output-recon/uploads' || path === '/output-recon/inspect' || path.endsWith('/read')) ? (path.endsWith('/read') || path === '/output-recon/inspect' ? 120000 : 60000) : 15000)
  });
  if (response.status === 401 && path === '/auth/me') return null;
  if (response.status === 401) window.dispatchEvent(new Event('erp-session-expired'));
  const result = await response.json();
  if (!response.ok) throw new Error(displayBrandText(result.message || 'Không thể xử lý yêu cầu.'));
  if(typeof result?.message==='string')result.message=displayBrandText(result.message);
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
  const [menuOpen,setMenuOpen]=useState(false);
  const [initialWorkspaceTab,setInitialWorkspaceTab]=useState<string|undefined>(undefined);
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
    <div className="brand">{branding.appName}</div><p className="muted">{branding.companyCode==='DGC'?branding.appTitle:'Không gian quản lý công việc và tài chính'}</p>
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
  if(session.user.companyCode==='DGC'&&session.user.permissions.includes('SYSTEM_CONFIG_EDIT')&&window.location.pathname==='/migration/book')return <CapturedBookTransfer request={api} csrf={session.csrfToken}/>;
  if(session.user.companyCode==='DGC'&&session.user.permissions.includes('INVOICE_VIEW')&&window.location.pathname==='/operations/restart-october')return <OctoberRestart request={api} csrf={session.csrfToken}/>;
  const isDgc=session.user.companyCode==='DGC',has=(p:string)=>session.user.permissions.includes(p);
  const workspaceProps={permissions:session.user.permissions,csrf:session.csrfToken,request:api,ratesVersion:reconFxVersion,initialTab:initialWorkspaceTab};
  function navigateDashboard(target:DashboardTarget){
   const destination={
    'create-invoice':{page:'output-recon',tab:'create'},'draft-invoices':{page:'invoices',tab:'unissued'},
    revenues:{page:'revenues',tab:undefined},receivables:{page:'receivables',tab:'ar'},payables:{page:'receivables',tab:'ap'},cash:{page:'cash',tab:undefined}
   }[target];setInitialWorkspaceTab(destination.tab);setPage(destination.page);
  }
  return <div className={'shell'+(isDgc?' dgc-shell':'')}><aside><div className="sidebar-brand"><h2>{branding.appName}</h2>{isDgc&&<button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="erp-navigation" onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?'Đóng menu':'Mở menu'}</button>}</div><p className="sidebar-subtitle">{isDgc?branding.appTitle:<>Hệ thống quản lý công việc và tài chính<br/>{companyDisplayName(session.user.companyCode)}</>}</p>{!isDgc&&<div className="nav-title">QUẢN LÝ</div>}<nav id="erp-navigation" className="sidebar-nav" aria-label="Quản lý ERP" data-open={menuOpen} onClick={e=>{if((e.target as HTMLElement).closest('button.nav')){setInitialWorkspaceTab(undefined);if(isDgc)setMenuOpen(false);}}}>
    <button className={'nav ' + (page === 'dashboard' ? 'active' : '')} aria-current={page==='dashboard'?'page':undefined} onClick={() => { setPage('dashboard'); setMessage(''); }}>Dashboard</button>
    {session.user.permissions.includes('PROJECT_VIEW') && <button className={'nav ' + (page === 'projects' ? 'active' : '')} aria-current={page==='projects'?'page':undefined} onClick={() => setPage('projects')}>Quản lý Dự án</button>}
    {session.user.permissions.includes('SERVICE_VIEW') && <button className={'nav ' + (page === 'services' ? 'active' : '')} aria-current={page==='services'?'page':undefined} onClick={() => setPage('services')}>Quản lý Dịch vụ</button>}
    {session.user.permissions.includes('PARTNER_VIEW') && <button className={'nav ' + (page === 'partners' ? 'active' : '')} aria-current={page==='partners'?'page':undefined} onClick={() => setPage('partners')}>Quản lý Đối tác</button>}
    {session.user.permissions.includes('CONTRACT_VIEW') && <button className={'nav ' + (page === 'contracts' ? 'active' : '')} aria-current={page==='contracts'?'page':undefined} onClick={() => setPage('contracts')}>Quản lý Hợp đồng</button>}
    {(isDgc?(has('RECON_VIEW')||has('INPUT_RECON_VIEW')||has('INVOICE_VIEW')&&has('INVOICE_CREATE')):has('RECON_VIEW'))&&<button className={'nav '+(page==='output-recon'?'active':'')} aria-current={page==='output-recon'?'page':undefined} onClick={()=>setPage('output-recon')}>{isDgc?'Quản lý đối soát':'Đối soát đầu ra'}</button>}


    {session.user.permissions.includes('REVENUE_VIEW') && <button className={'nav ' + (page === 'revenues' ? 'active' : '')} onClick={() => setPage('revenues')}>Quản lý Doanh thu</button>}
    {session.user.permissions.includes('INVOICE_VIEW') && <button className={'nav ' + (page === 'invoices' ? 'active' : '')} aria-current={page==='invoices'?'page':undefined} onClick={() => setPage('invoices')}>Quản lý Invoice</button>}
    {(has('AR_VIEW')||isDgc&&has('AP_VIEW'))&&<button className={'nav '+(page==='receivables'?'active':'')} aria-current={page==='receivables'?'page':undefined} onClick={()=>setPage('receivables')}>Quản lý Công nợ</button>}

    {(isDgc||has('PAYMENT_VIEW')) && <button className={'nav '+(page==='cash'?'active':'')} onClick={()=>setPage('cash')}>Quản lý Thu chi</button>}

    {(has('SYSTEM_CONFIG_EDIT')||isDgc&&has('REVENUE_VIEW'))&&<button className={'nav '+(page==='assets'?'active':'')} aria-current={page==='assets'?'page':undefined} onClick={()=>setPage('assets')}>Cấu hình chung</button>}
    {session.user.permissions.includes('USER_VIEW') && <button className={'nav '+(page==='users'?'active':'')} onClick={()=>setPage('users')}>Quản lý Người dùng</button>}
    </nav><div className="sidebar-footer">{branding.appName} · v{version}</div>
  </aside><main><header><div><h1>{page==='invoice-history'?'Invoice lịch sử':page==='soa-review'?'Statement of Account':page==='reporting-rates'?'Tỷ giá báo cáo':page==='input-recon'?'Đối soát đầu vào':page==='payables'?'Công nợ phải trả':page==='cash'?'Quản lý Thu chi':page === 'users' ? 'Quản lý Người dùng' : page === 'revenues' ? 'Quản lý Doanh thu' : page === 'receivables' ? 'Quản lý Công nợ' : page === 'invoices' ? 'Quản lý Invoice' : page === 'assets' ? 'Cấu hình chung' : page === 'output-recon' ? (isDgc?'Quản lý đối soát':'Đối soát đầu ra') : page === 'contracts' ? 'Quản lý Hợp đồng' : page === 'projects' ? 'Quản lý Dự án' : page === 'partners' ? 'Quản lý Đối tác' : page === 'services' ? 'Quản lý Dịch vụ' : 'Dashboard'}</h1><p className="lead">{page==='invoice-history'?'Tra cứu các bản lưu và PDF gốc theo hàng nguồn.':page==='soa-review'?'Lập SOA và tra cứu số dư đến ngày chốt.':page==='reporting-rates'?'Tỷ giá VND / USD dùng chung theo tháng.':page==='input-recon'?'Tính khoản chia cho đối tác đầu vào từ doanh thu đã duyệt.':page==='payables'?'Công nợ phải trả từ đối soát đầu vào đã duyệt.':page==='cash'?'Theo dõi tiền vào, tiền ra và số dư tài khoản/quỹ.':page==='users'?'Tài khoản, vai trò và quyền truy cập.':page==='revenues'?'Theo dõi doanh thu và nguồn đối soát đã chốt.':page==='receivables'?'Theo dõi phải thu, số dư và số ngày quá hạn từ Invoice phát hành.':page==='invoices'?(isDgc?'Quản lý Invoice đã phát hành, chưa phát hành, lịch sử và Statement of Account.':'Tạo Invoice theo template công ty từ doanh thu đối soát đã chốt.'):page==='assets'?'Tỷ giá chung và cấu hình công ty theo quyền truy cập.':page==='output-recon'?(isDgc?'Đối soát đầu ra, tạo Invoice và đối soát đầu vào.':'Nhận và kiểm tra PDF đối soát theo đối tác, dịch vụ và kỳ.'):page==='contracts'?'Quản lý hợp đồng dịch vụ đầu vào và đầu ra.':page==='services'?'Xem danh sách dịch vụ, thêm mới và cập nhật bằng popup nhập liệu.':page==='partners'?'Quản lý hồ sơ đối tác đầu vào và đầu ra.':page==='projects'?'Theo dõi tiến độ, ngân sách và chi phí dự án.':(isDgc?'Theo dõi kết quả kinh doanh và các việc cần xử lý.':'Tổng quan hệ thống ERP và công ty.')}</p></div><div className="top-user"><div><p>{session.user.fullName}</p><p className="muted">{companyDisplayName(session.user.companyCode)} · {session.user.email}</p></div><button onClick={logout} disabled={busy}>Đăng xuất</button></div></header>
    {message && <p className="notice" role="alert">{message}</p>}
    {session.user.companyCode==='DGC'&&page==='invoice-history'&&<p><a href="/operations/restart-october">Hồ sơ tháng 10/2026 trước khi nhập lại</a></p>}
    {page==='invoice-history'?<InvoiceHistory request={api}/>:page==='soa-review'?<><StatementsOfAccount request={api} csrf={session.csrfToken} permissions={session.user.permissions}/><details><summary>Đối chiếu chi tiết khoản thu theo ngày chốt</summary><SoaCutoffReview request={api}/></details></>:page==='reporting-rates'?<ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>{}}/>:page==='input-recon'||page==='payables'?<InputRecon key={page} ratesVersion={reconFxVersion} request={api} csrf={session.csrfToken} permissions={session.user.permissions} payables={page==='payables'}/>:page==='cash'?<CashManagement deferred={isDgc} request={api} csrf={session.csrfToken} permissions={session.user.permissions}/>:page === 'users' ? <Users request={api} csrf={session.csrfToken} permissions={session.user.permissions} userId={session.user.userId}/> : page === 'dashboard' ? isDgc?<DigicomDashboard request={api} permissions={session.user.permissions} onNavigate={navigateDashboard}/>:<Dashboard payablesEnabled={session.user.companyCode==='DGC'} cashEnabled={session.user.companyCode!=='DGC'} key={session.user.companyId} request={api} permissions={session.user.permissions}/> : (page === 'revenues'||page === 'receivables') ? isDgc&&page==='receivables'?<DgcDebt {...workspaceProps}/>:<FinanceLedger key={page} kind={page} request={api} csrf={session.csrfToken} permissions={session.user.permissions} canDownload={session.user.permissions.includes('INVOICE_VIEW')}/> : page === 'invoices' ? isDgc?<DgcInvoices {...workspaceProps}/>:<Invoices permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'assets' ? isDgc?<DgcSettings {...workspaceProps} onRatesSaved={()=>setReconFxVersion(v=>v+1)}/>:<>{session.user.companyCode!=='DGC'&&<CashAccounts request={api} csrf={session.csrfToken} permissions={session.user.permissions}/>}<ReportingRates csrf={session.csrfToken} request={api} permissions={session.user.permissions} onSaved={()=>{}}/><CompanyAssets csrf={session.csrfToken} request={api}/></> : page === 'output-recon' ? isDgc?<DgcReconciliation {...workspaceProps}/>:<OutputRecon permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'contracts' ? <ServiceContracts permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'services' ? <Services permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : page === 'partners' ? <Partners permissions={session.user.permissions} csrf={session.csrfToken} request={api}/> : <Execution permissions={session.user.permissions} csrf={session.csrfToken} request={api}/>}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><CompanyBrandProvider><App/></CompanyBrandProvider></React.StrictMode>);
