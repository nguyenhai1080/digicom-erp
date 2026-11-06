import React,{useId,useState} from 'react';
import {OutputRecon} from './OutputRecon';
import {InputRecon} from './InputRecon';
import {Invoices} from './Invoices';
import {InvoiceHistory} from './InvoiceHistory';
import {FinanceLedger} from './FinanceLedger';
import {ReportingRates} from './ReportingRates';
import {CompanyAssets} from './CompanyAssets';

type Props={permissions:string[];csrf:string;request:(path:string,body?:unknown,csrf?:string)=>Promise<any>;ratesVersion?:number;onRatesSaved?:()=>void};
type Tab={id:string;label:string;content:React.ReactNode};
function WorkspaceTabs({label,tabs}:{label:string;tabs:Tab[]}){
 const [selected,setSelected]=useState(tabs[0]?.id),uid=useId();
 const active=tabs.find(t=>t.id===selected)??tabs[0];
 if(!active)return null;
 return <><div className="workspace-tabs" role="tablist" aria-label={label}>{tabs.map((tab,index)=><button key={tab.id} id={uid+'-'+tab.id} role="tab" type="button" aria-selected={active.id===tab.id} aria-controls={uid+'-panel'} tabIndex={active.id===tab.id?0:-1} className={active.id===tab.id?'action-primary':''} onClick={()=>setSelected(tab.id)} onKeyDown={e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();setSelected(tabs[next].id);document.getElementById(uid+'-'+tabs[next].id)?.focus();}}>{tab.label}</button>)}</div><div key={active.id} role="tabpanel" id={uid+'-panel'} aria-labelledby={uid+'-'+active.id}>{active.content}</div></>;
}
export function DgcReconciliation(props:Props){
 const has=(p:string)=>props.permissions.includes(p),tabs:Tab[]=[];
 if(has('RECON_VIEW'))tabs.push({id:'output',label:'Đối soát đầu ra',content:<OutputRecon {...props}/>});
 if(has('INVOICE_VIEW')&&has('INVOICE_CREATE'))tabs.push({id:'create',label:'Tạo Invoice',content:<Invoices {...props} creationOnly/>});
 if(has('INPUT_RECON_VIEW'))tabs.push({id:'input',label:'Đối soát đầu vào',content:<InputRecon {...props}/>});
 return <WorkspaceTabs label="Đối soát" tabs={tabs}/>;
}
export function DgcDebt(props:Props){
 const has=(p:string)=>props.permissions.includes(p),tabs:Tab[]=[];
 if(has('AR_VIEW'))tabs.push({id:'ar',label:'Công nợ phải thu',content:<FinanceLedger {...props} kind="receivables" canDownload={has('INVOICE_VIEW')}/>});
 if(has('AP_VIEW'))tabs.push({id:'ap',label:'Công nợ phải trả',content:<InputRecon {...props} payables/>});
 return <WorkspaceTabs label="Quản lý Công nợ" tabs={tabs}/>;
}
export function DgcInvoices(props:Props){
 if(!props.permissions.includes('INVOICE_VIEW'))return null;
 return <WorkspaceTabs label="Quản lý Invoice" tabs={[
  {id:'issued',label:'Invoice đã phát hành',content:<Invoices {...props} listOnly hideNavigation initialTab="issued"/>},
  {id:'unissued',label:'Invoice chưa phát hành',content:<Invoices {...props} listOnly hideNavigation initialTab="unissued"/>},
  {id:'history',label:'Invoice lịch sử',content:<><p><a href="/operations/restart-october">Hồ sơ tháng 10/2026 trước khi nhập lại</a></p><InvoiceHistory request={props.request}/></>}
 ]}/>;
}
export function DgcSettings(props:Props){
 return <>{props.permissions.includes('REVENUE_VIEW')&&<ReportingRates {...props} onSaved={()=>props.onRatesSaved?.()}/ >}{props.permissions.includes('SYSTEM_CONFIG_EDIT')&&<CompanyAssets csrf={props.csrf} request={props.request}/>}</>;
}
