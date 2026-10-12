import {formatMoney,formatNumber} from './numbers';
import React, { useEffect, useState } from 'react';
import { EvidenceWorkspace } from './EvidenceWorkspace';
import { PartnerCreate } from './Partners';
type Row = { id: string; [key: string]: any };
type Props = { permissions: string[]; csrf: string; request: (path: string, body?: unknown, csrf?: string) => Promise<any> };
const labels: Record<string,string> = { DRAFT:'Nháp', APPROVED:'Đã duyệt', CANCELLED:'Đã huỷ', PLANNED:'Kế hoạch', IN_PROGRESS:'Đang thực hiện', SUBMITTED:'Đã gửi nghiệm thu', ACCEPTED:'Đã nghiệm thu', LEAD:'Cơ hội', LABOR:'Nhân công', MATERIAL:'Vật tư', SUBCONTRACT:'Thầu phụ', TRAVEL:'Đi lại', OVERHEAD:'Chi phí chung', OTHER:'Khác' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const amount = (value: string | null) => value == null ? '—' : value; // Keep Decimal strings; never round financial totals with Number.
function Field({ label, name, type = 'text', value, required = true, children, ...rest }: any) {
  return <label>{label}{children ? <select name={name} defaultValue={value} required={required}>{children}</select> :
    <input name={name} type={type} defaultValue={value} required={required} {...rest}/>}</label>;
}
export function Execution({ permissions, csrf, request }: Props) {
  const can = (p: string) => permissions.includes(p);
  const [projects,setProjects] = useState<Row[]>([]); const [partners,setPartners] = useState<Row[]>([]);
  const [selected,setSelected] = useState<Row|null>(null); const [detail,setDetail] = useState<any>(null);
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(true); const [message,setMessage] = useState('');
  const [costAction,setCostAction] = useState<{row:Row; action:'approve'|'cancel'}|null>(null);
  const [milestone,setMilestone] = useState<Row|null>(null);
  const [milestoneAction,setMilestoneAction] = useState<{row:Row; action:'return'|'cancel'}|null>(null);
  async function loadLists() {
    const [p,r] = await Promise.all([request('/projects'), can('PARTNER_VIEW') ? request('/partners') : Promise.resolve({items:[]})]);
    setProjects(p.items); setPartners(r.items);
  }
  useEffect(() => { let cancelled=false;
    void Promise.all([request('/projects'), can('PARTNER_VIEW') ? request('/partners') : Promise.resolve({items:[]})])
      .then(([p,r])=>{if(!cancelled){setProjects(p.items);setPartners(r.items);}})
      .catch(e=>{if(!cancelled)setMessage(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  }, []);
  useEffect(()=>{let cancelled=false; setDetail(null);setMilestone(null);setMilestoneAction(null);setCostAction(null);setMessage('');
    if(selected) void request(`/projects/${selected.id}/execution`).then(d=>{if(!cancelled)setDetail(d);}).catch(e=>{if(!cancelled)setMessage(e.message);});
    return ()=>{cancelled=true;};
  },[selected?.id]);
  async function submit(event: React.FormEvent<HTMLFormElement>, path:string, make:(data:FormData)=>unknown) {
    event.preventDefault(); if(busy)return; const form=event.currentTarget; const data=new FormData(form);setBusy(true);setMessage('');
    try { await request(path,make(data),csrf);form.reset();setCostAction(null);setMilestone(null);setMilestoneAction(null);
      await loadLists(); if(selected)setDetail(await request(`/projects/${selected.id}/execution`));setMessage('Đã lưu thành công.');
    } catch(e){setMessage(e instanceof Error?e.message:'Không thể lưu.');} finally{setBusy(false);}
  }
  const s=(d:FormData,key:string)=>String(d.get(key)??'').trim();
  const optional=(d:FormData,key:string)=>s(d,key)||undefined;
  const base=selected?`/projects/${selected.id}`:'';
  const form=(title:string,path:string,make:(data:FormData)=>unknown,fields:React.ReactNode,button='Lưu')=><section className="panel"><h3>{title}</h3>
    <form onSubmit={e=>void submit(e,path,make)}><fieldset disabled={busy}><div className="form-grid">{fields}</div><button className="action-primary" type="submit">{busy?'Đang lưu…':button}</button></fieldset></form></section>;
  return <div className="execution">
    {message&&<p className="notice" role="alert">{message}</p>}
    {loading?<p role="status">Đang tải dự án…</p>:<>
    <section className="panel"><div className="section-heading"><h3>Dự án</h3>{selected?<button disabled={busy} onClick={()=>setSelected(null)}>Về danh sách</button>:<button disabled={busy} onClick={()=>void loadLists().catch(e=>setMessage(e.message))}>Tải lại danh sách</button>}</div>
      <p className="muted">Tối đa 100 dự án mới nhất trong phạm vi quyền của bạn.</p>
      {!projects.length?<p>Chưa có dự án. Tạo đối tác và dự án bên dưới để bắt đầu.</p>:<div className="table-scroll"><table><thead><tr><th>Mã</th><th>Dự án</th><th>Trạng thái</th><th></th></tr></thead><tbody>{projects.map(p=><tr key={p.id}><td>{p.projectCode}</td><td>{p.projectName}</td><td>{labels[p.status]??p.status}</td><td><button disabled={busy} onClick={()=>setSelected(p)}>Mở dự án</button></td></tr>)}</tbody></table></div>}
    </section>
    {!selected&&can('PARTNER_CREATE')&&<PartnerCreate permissions={permissions} csrf={csrf} request={request} onSaved={loadLists}/>}
    {!selected&&can('PROJECT_CREATE')&&can('PARTNER_VIEW')&&form('Tạo dự án','/projects',d=>({projectName:s(d,'projectName'),partnerId:s(d,'partnerId'),currency:s(d,'currency')}),<>
      <Field label="Tên dự án" name="projectName" maxLength={500}/><Field label="Đối tác" name="partnerId" value=""><option value="" disabled>Chọn đối tác</option>{partners.map(p=><option key={p.id} value={p.id}>{p.partnerCode} · {p.legalName}</option>)}</Field><Field label="Đồng tiền dự án" name="currency" value="VND" pattern="[A-Z]{3}" maxLength={3}/></>,'Tạo dự án')}
    </>}
    {selected&&!detail&&<p role="status">Đang tải dữ liệu dự án…</p>}
    {detail&&selected&&detail.item.id===selected.id&&<>
      <section className="panel"><div className="section-heading"><h2>{detail.item.projectCode} · {detail.item.projectName}</h2><button disabled={busy} onClick={()=>void request(base+'/execution').then(setDetail).catch(e=>setMessage(e.message))}>Tải lại dự án</button></div>
        <p className="muted">Ngân sách và chi phí được theo dõi riêng theo đồng tiền. Số dư = ngân sách − chi phí đã duyệt.</p>
        <div className="table-scroll"><table><thead><tr><th>Đồng tiền</th><th>Ngân sách hiện hành</th><th>Chi phí đã duyệt</th><th>Số dư</th></tr></thead><tbody>{detail.totals.map((t:any)=><tr key={t.currency}><td>{t.currency}</td><td>{formatMoney(t.budget,t.currency)}</td><td>{formatMoney(t.approvedCost,t.currency)}</td><td>{formatMoney(t.variance,t.currency)}</td></tr>)}</tbody></table></div>
      </section>
      {detail.acceptance&&<section className="panel"><h3>Điều kiện nghiệm thu chính thức</h3>
        <p>Dự án đang thực hiện / UAT: {detail.acceptance.projectInExecution?'Đạt':'Chưa đạt'}</p>
        <p>Hợp đồng chính đang hiệu lực: {detail.acceptance.activeMainContract===null?'Cần quyền xem hợp đồng':detail.acceptance.activeMainContract?'Đạt':'Chưa có'}</p>
        <p>Hồ sơ nghiệm thu: tải PDF vào mục Hồ sơ dự án bên dưới. Phê duyệt nghiệm thu sẽ được bổ sung sau luồng kích hoạt hợp đồng.</p>
        <p className="muted">Nghiệm thu chính thức hiện chưa mở. Gửi đề nghị không tạo doanh thu hoặc xác nhận điều kiện thanh toán.</p>
      </section>}
      <EvidenceWorkspace key={selected.id} projectId={selected.id} currency={detail.item.currency??'VND'} detail={detail}
        permissions={permissions} csrf={csrf} request={request} busy={busy} setBusy={setBusy}
        refresh={async()=>{await loadLists();setDetail(await request(base+'/execution'));}}/>
      {can('COST_BUDGET_REVISE')&&can('COST_BUDGET_VIEW')&&form('Ban hành phiên bản ngân sách',base+'/budgets',d=>({currency:s(d,'currency'),amount:s(d,'amount'),reason:s(d,'reason'),expectedRevisionNo:detail.currentBudgets.find((b:Row)=>b.currency===s(d,'currency'))?.revisionNo??0}),<>
        <Field label="Đồng tiền ngân sách" name="currency" value={detail.item.currency??'VND'} pattern="[A-Z]{3}" maxLength={3}/><Field label="Số tiền ngân sách" name="amount" inputMode="decimal" pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,4})?"/><Field label="Lý do ban hành ngân sách" name="reason" maxLength={500}/></>,'Ban hành ngân sách')}
      {can('COST_BUDGET_VIEW')&&<section className="panel"><h3>Lịch sử ngân sách</h3><div className="table-scroll"><table><thead><tr><th>Phiên bản</th><th>Đồng tiền</th><th>Số tiền</th><th>Lý do</th><th>Trạng thái</th></tr></thead><tbody>{detail.budgets.map((b:Row)=><tr key={b.id}><td>{b.revisionNo}</td><td>{b.currency}</td><td>{formatMoney(b.amount,b.currency)}</td><td>{b.reason}</td><td>{b.isCurrent?'Hiện hành':'Lịch sử'}</td></tr>)}</tbody></table></div></section>}
      {can('MILESTONE_CREATE')&&form('Thêm mốc tiến độ',base+'/milestones',d=>({name:s(d,'name'),plannedStart:optional(d,'plannedStart'),plannedEnd:optional(d,'plannedEnd')}),<>
        <Field label="Tên mốc" name="name" maxLength={500}/><Field label="Ngày bắt đầu dự kiến" name="plannedStart" type="date" required={false}/><Field label="Ngày kết thúc dự kiến" name="plannedEnd" type="date" required={false}/></>,'Tạo mốc')}
      {can('MILESTONE_VIEW')&&<section className="panel"><h3>Mốc tiến độ</h3><p className="muted">Gửi nghiệm thu chỉ chốt đề nghị. Nghiệm thu chính thức cần hồ sơ và hợp đồng, sẽ bổ sung ở bước sau.</p><div className="table-scroll"><table><thead><tr><th>Mã / tên</th><th>Dự kiến kết thúc</th><th>Tiến độ</th><th>Trạng thái</th><th></th></tr></thead><tbody>{detail.milestones.map((m:Row)=><tr key={m.id}><td>{m.milestoneCode} · {m.name}</td><td>{m.plannedEnd?.slice(0,10)??'—'}</td><td>{formatNumber(Number(m.progressPercent)*100,0,4)}%</td><td>{labels[m.status]??m.status}</td><td>{can('MILESTONE_EDIT')&&['PLANNED','IN_PROGRESS'].includes(m.status)&&<button disabled={busy} onClick={()=>{setMilestone(m);setMilestoneAction(null);}}>Cập nhật tiến độ</button>} {can('MILESTONE_EDIT')&&m.status==='SUBMITTED'&&<button disabled={busy} onClick={()=>{setMilestone(null);setMilestoneAction({row:m,action:'return'});}}>Trả lại chỉnh sửa</button>} {can('MILESTONE_CANCEL')&&['PLANNED','IN_PROGRESS','SUBMITTED'].includes(m.status)&&<button disabled={busy} onClick={()=>{setMilestone(null);setMilestoneAction({row:m,action:'cancel'});}}>Huỷ mốc</button>}</td></tr>)}</tbody></table></div></section>}
      {milestoneAction&&form(`${milestoneAction.action==='return'?'Trả lại chỉnh sửa':'Huỷ mốc'}: ${milestoneAction.row.milestoneCode} · ${milestoneAction.row.name}`,base+`/milestones/${milestoneAction.row.id}/${milestoneAction.action}`,d=>({expectedUpdatedAt:milestoneAction.row.updatedAt,reason:s(d,'reason')}),<>
        <p>{milestoneAction.action==='return'?'Mốc trở về đang thực hiện để sửa và gửi lại; giữ nguyên tiến độ và ngày thực tế.':'Mốc đã huỷ được giữ trong lịch sử. Mốc còn chi phí đã duyệt chưa thể huỷ; chi phí nháp gắn mốc đã huỷ không thể duyệt.'}</p>
        <Field label="Lý do thao tác mốc" name="reason" maxLength={500}/></>,milestoneAction.action==='return'?'Xác nhận trả lại':'Xác nhận huỷ mốc')}
      {milestone&&form('Tiến độ: '+milestone.name,base+`/milestones/${milestone.id}/progress`,d=>({expectedUpdatedAt:milestone.updatedAt,progressPercent:(Number(s(d,'percent'))/100).toFixed(6),actualStart:s(d,'actualStart'),actualEnd:optional(d,'actualEnd'),submit:s(d,'submit')==='yes'}),<>
        <Field label="Tiến độ (%)" name="percent" type="number" value={Number(milestone.progressPercent)*100} min="0" max="100" step="0.0001"/><Field label="Ngày bắt đầu thực tế" name="actualStart" type="date" value={milestone.actualStart?.slice(0,10)??today()}/><Field label="Ngày kết thúc thực tế" name="actualEnd" type="date" required={false} value={milestone.actualEnd?.slice(0,10)??''}/><Field label="Thao tác tiến độ" name="submit" value="no"><option value="no">Lưu tiến độ</option><option value="yes">Gửi nghiệm thu (100% và có ngày kết thúc)</option></Field></>,'Lưu tiến độ')}
      {can('COST_CREATE')&&form('Thêm chi phí nháp',base+'/costs',d=>({costDate:s(d,'costDate'),description:s(d,'description'),category:s(d,'category'),currency:s(d,'currency'),amount:s(d,'amount'),sourceRef:optional(d,'sourceRef'),milestoneId:optional(d,'milestoneId')}),<>
        <Field label="Ngày chi phí" name="costDate" type="date" value={today()}/><Field label="Diễn giải" name="description" maxLength={500}/><Field label="Nhóm chi phí" name="category" value="OTHER">{['LABOR','MATERIAL','SUBCONTRACT','TRAVEL','OVERHEAD','OTHER'].map(c=><option key={c} value={c}>{labels[c]}</option>)}</Field><Field label="Đồng tiền chi phí" name="currency" value={detail.item.currency??'VND'} pattern="[A-Z]{3}" maxLength={3}/><Field label="Số tiền chi phí" name="amount" inputMode="decimal" pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,4})?"/><Field label="Số chứng từ / tham chiếu" name="sourceRef" required={false} maxLength={500}/>{can('MILESTONE_VIEW')&&<Field label="Mốc liên quan" name="milestoneId" value="" required={false}><option value="">Không gắn mốc</option>{detail.milestones.filter((m:Row)=>m.status!=='CANCELLED').map((m:Row)=><option key={m.id} value={m.id}>{m.name}</option>)}</Field>}</>,'Lưu chi phí nháp')}
      {can('COST_VIEW')&&<section className="panel"><h3>Chi phí</h3><p className="muted">Chi phí chưa tạo công nợ hay bút toán. Muốn sửa, huỷ khoản cũ và tạo khoản thay thế.</p><div className="table-scroll"><table><thead><tr><th>Mã / diễn giải</th><th>Ngày</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{detail.costs.map((c:Row)=><tr key={c.id}><td>{c.costCode} · {c.description}</td><td>{c.costDate.slice(0,10)}</td><td>{formatMoney(c.amount,c.currency)} {c.currency}</td><td>{labels[c.status]}</td><td>{can('COST_APPROVE')&&c.status==='DRAFT'&&<button disabled={busy} onClick={()=>setCostAction({row:c,action:'approve'})}>Duyệt</button>} {can('COST_CANCEL')&&c.status!=='CANCELLED'&&<button disabled={busy} onClick={()=>setCostAction({row:c,action:'cancel'})}>Huỷ</button>}</td></tr>)}</tbody></table></div></section>}
      {costAction&&form(`${costAction.action==='approve'?'Duyệt':'Huỷ'} ${costAction.row.costCode} · ${formatMoney(costAction.row.amount,costAction.row.currency)} ${costAction.row.currency}`,base+`/costs/${costAction.row.id}/${costAction.action}`,d=>({expectedUpdatedAt:costAction.row.updatedAt,reason:s(d,'reason')}),<Field label="Lý do thao tác chi phí" name="reason" maxLength={500}/>,costAction.action==='approve'?'Xác nhận duyệt chi phí':'Xác nhận huỷ chi phí')}
    </>}
  </div>;
}
