import React,{useState} from 'react';
type Props={request:(path:string,body?:unknown,csrf?:string)=>Promise<any>;csrf:string};
const base64=(blob:Blob)=>new Promise<string>((yes,no)=>{const r=new FileReader();r.onload=()=>yes(String(r.result).split(',')[1]);r.onerror=()=>no(Error('Không đọc được chứng từ.'));r.readAsDataURL(blob);});
export function CapturedBookTransfer({request,csrf}:Props){
 const [bundle,setBundle]=useState<any>(null),[files,setFiles]=useState<File[]>([]),[progress,setProgress]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<any>(null),[result,setResult]=useState<any>(null),[error,setError]=useState('');
 const call=(name:string,data:any)=>request('/dgc-migration/book/'+name,data,csrf);
 async function upload(){setBusy(true);setError('');setPreview(null);try{
  const prepared=await call('prepare',{bundle,bundleHash:bundle.bundleHash}),selected=new Map(files.map(f=>[f.name,f]));
  for(const f of prepared.files)if(selected.get(f.sha256+'.pdf')?.size!==f.size)throw Error('Chưa chọn đủ chứng từ của gói chuyển.');
  let done=0;for(const item of prepared.files){const file=selected.get(item.sha256+'.pdf')!;for(let offset=0;offset<file.size;offset+=1024*1024){setProgress('Đang chuyển chứng từ '+(done+1)+'/'+prepared.files.length+' · '+Math.floor(100*offset/file.size)+'%');await call('file',{token:item.token,offset,base64:await base64(file.slice(offset,offset+1024*1024))});}done++;}
  setProgress('Đã chuyển chứng từ. Đang gắn vào sổ…');await call('install-files',{bundle,bundleHash:bundle.bundleHash});
  setProgress('Đang thử nhập toàn sổ và hoàn tác…');setPreview(await call('preview',{bundle,bundleHash:bundle.bundleHash}));setProgress('Sẵn sàng nhập nguyên trạng.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function apply(){setBusy(true);setError('');try{setResult(await call('apply',{bundle,bundleHash:bundle.bundleHash,previewToken:preview.previewToken}));setPreview(null);setProgress('Đã nhập sổ DGC.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="panel"><h1>Chuyển sổ DGC</h1><p>Giữ nguyên số liệu và chứng từ hiện tại. Hồ sơ nháp vẫn là nháp; bản hủy/thay thế giữ trong lịch sử. Quỹ và ngân hàng chưa áp dụng.</p>
 <label>Gói sổ<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{setBundle(null);setPreview(null);setError('');const f=e.target.files?.[0];if(f)void f.text().then(t=>setBundle(JSON.parse(t))).catch(()=>setError('Không đọc được gói sổ.'));}}/></label>
 <label>Chứng từ PDF của gói<input type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={e=>{setFiles(Array.from(e.target.files??[]));setPreview(null);}}/></label>
 {bundle&&<p>{bundle.counts?.revenue} dòng doanh thu · {bundle.counts?.invoice} Invoice hiện hành/nháp · {bundle.counts?.archive} Invoice lịch sử · {bundle.counts?.receipt} khoản thu · {bundle.documents?.length} chứng từ.</p>}
 <p>{files.length} tệp đã chọn.</p><button disabled={busy||!bundle||!files.length||!!result} onClick={()=>void upload()}>Chuyển chứng từ và thử nhập</button>
 <p role="status">{progress}</p>{error&&<p role="alert">{error}</p>}
 {preview&&<section><p>Đã thử nhập toàn bộ rồi hoàn tác; dữ liệu sẵn sàng chuyển.</p><button disabled={busy} onClick={()=>void apply()}>Nhập nguyên trạng vào DGC ERP</button></section>}
 {result&&<p role="status">Đã nhập {result.counts?.invoice} Invoice, {result.counts?.revenue} doanh thu, {result.counts?.receipt} khoản thu và {result.counts?.archive} Invoice lịch sử. <a href="/">Mở ERP DGC</a></p>}
 </main>;
}
