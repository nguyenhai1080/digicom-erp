import type { FastifyInstance } from 'fastify';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const contained=(root:string,path:string)=>{const r=relative(root,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};

// Optional single-process deployment. API routes keep their own handlers,
// authorization and upload/download limits; the SPA fallback never handles /api.
export async function registerWeb(app:FastifyInstance,directory:string){
 if(!isAbsolute(directory))throw Error('ERP_WEB_ROOT must be an absolute built-web directory');
 const root=await realpath(directory),index=await realpath(resolve(root,'index.html'));
 if(!contained(root,index)||(await stat(index)).size>16*1024*1024)throw Error('Invalid built web index');
 await readFile(index); // Fail startup if the published bundle is unreadable.
 app.setNotFoundHandler(async(request,reply)=>{
  let path:string;try{path=decodeURIComponent(new URL(request.raw.url??'/','http://localhost').pathname);}catch{return reply.code(400).send({message:'Đường dẫn không hợp lệ.'});}
  const missing=()=>reply.code(404).header('Cache-Control','no-store').send({message:'Không tìm thấy nội dung.'});
  if(/^\/api(?:\/|$)/i.test(path))return missing();
  if(!['GET','HEAD'].includes(request.method))return reply.code(405).header('Allow','GET, HEAD').send({message:'Phương thức không được hỗ trợ.'});
  if(path.includes('\\')||path.includes('\0')||path.split('/').some(s=>s.startsWith('.')))return missing();
  let filename=resolve(root,'.'+path);
  if(!contained(root,filename))return missing();
  try{
   try{filename=await realpath(filename);if(!contained(root,filename))return missing();if(!(await stat(filename)).isFile()){if(path!=='/')return missing();filename=index;}}
   catch(e){if(!(e instanceof Error&&'code' in e&&e.code==='ENOENT')||extname(path)||path.startsWith('/assets/'))return missing();filename=index;}
   const type=types[extname(filename).toLowerCase()];if(!type)return missing();
   const size=(await stat(filename)).size;if(size>16*1024*1024)return missing();
   reply.type(type).header('Cache-Control',/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(path)?'public, max-age=31536000, immutable':'no-cache');
   reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
   return reply.send(request.method==='HEAD'?undefined:await readFile(filename));
  }catch(e){if(e instanceof Error&&'code' in e&&e.code==='ENOENT')return missing();throw e;}
 });
}
