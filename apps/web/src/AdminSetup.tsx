import React,{useState} from 'react';

export function AdminSetup({companyCode,appName}:{companyCode:string;appName:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form);
  if(data.get('password')!==data.get('confirmPassword')){setMessage('Hai mật khẩu chưa khớp.');return;}
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/v1/auth/bootstrap',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyCode,fullName:data.get('fullName'),email:data.get('email'),password:data.get('password'),setupToken:data.get('setupToken')}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();if(!response.ok)throw Error(result.message||'Không thể khởi tạo quản trị.');
   form.reset();setDone(true);
  }catch(error){setMessage(error instanceof Error?error.message:'Không kết nối được dịch vụ.');}
  finally{for(const name of ['password','confirmPassword','setupToken']){const input=form.elements.namedItem(name);if(input instanceof HTMLInputElement)input.value='';}setBusy(false);}
 }
 return <main className="auth-screen"><section className="auth-card">
  <div className="brand">{appName}</div><h1>Khởi tạo quản trị DGC</h1>
  {done?<><p role="status">Đã tạo tài khoản quản trị. Anh có thể đăng nhập bằng tài khoản vừa tạo.</p><a href="/">Đến màn hình đăng nhập</a></>:<>
   <p className="muted">Chỉ dùng cho quản trị đầu tiên, sau khi công ty DGC đã khởi tạo và thiết lập một lần được bật trên host.</p>
   <form onSubmit={submit} autoComplete="off"><fieldset disabled={busy}>
    <label>Họ và tên<input name="fullName" required minLength={2} maxLength={150} autoComplete="name" /></label>
    <label>Email quản trị<input name="email" type="email" required maxLength={254} autoComplete="username" /></label>
    <label>Mật khẩu mới<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
    <label>Nhập lại mật khẩu<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
    <label>Mã thiết lập một lần<input name="setupToken" type="password" required minLength={32} maxLength={512} autoComplete="off" /></label>
    <button className="primary" type="submit">{busy?'Đang khởi tạo…':'Tạo tài khoản quản trị'}</button>
   </fieldset></form>
   {message&&<p className="notice" role="alert">{message}</p>}
   <p className="muted">Không gửi mật khẩu hoặc mã thiết lập vào chat. Máy chủ chỉ cho phép tạo tài khoản đầu tiên; đây không phải đăng ký công khai.</p><a href="/">Quay lại đăng nhập</a>
  </>}
 </section></main>;
}
