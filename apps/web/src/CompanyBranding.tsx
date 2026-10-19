import React,{createContext,useContext,useEffect,useState} from 'react';
export type Branding={companyCode:string;appName:string;appTitle:string};
const Context=createContext<Branding>({companyCode:'DGC',appName:'DGC Finance',appTitle:'DGC Finance'});
export const useBranding=()=>useContext(Context);
export function CompanyBrandProvider({children}:{children:React.ReactNode}){
 const [config,setConfig]=useState<Branding|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch('/api/v1/public-config',{signal:controller.signal,credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const c=await r.json();if(!/^[A-Za-z0-9_-]{1,50}$/.test(c.companyCode)||typeof c.appName!=='string'||typeof c.appTitle!=='string')throw Error();document.title=c.appTitle;setConfig(c);}).catch(()=>{if(!controller.signal.aborted)setError('Không tải được cấu hình công ty. Vui lòng tải lại trang.');});return()=>controller.abort();},[]);
 if(!config)return <main className="auth-screen"><p role={error?'alert':'status'}>{error||'Đang tải cấu hình công ty…'}</p></main>;
 return <Context.Provider value={config}>{children}</Context.Provider>;
}
