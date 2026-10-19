import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
if(process.env.NODE_ENV==='production'&&!process.env.API_BASE_URL)throw new Error('Production requires the dedicated API_BASE_URL');
const apiBase = new URL(process.env.API_BASE_URL || 'http://127.0.0.1:3001');
if (!['https:', 'http:'].includes(apiBase.protocol) || apiBase.username || apiBase.password) {
  throw new Error('API_BASE_URL must be an HTTP(S) URL without credentials');
}
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8'
};
const server = createServer(async (request, response) => {
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (pathname === '/api/v1/health') {
    try {
      const upstream = await fetch(new URL('/api/v1/health', apiBase), {
        signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }
      });
      const result = await upstream.json();
      if (!upstream.ok || result.status !== 'ok' || result.service !== 'erp-core-api' || result.database !== 'connected') {
        throw new Error('API health failed');
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', service: 'erp-core-api', database: 'connected' }));
    } catch {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'error', service: 'erp-core-web', database: 'unavailable' }));
    }
    return;
  }
  if (pathname.startsWith('/api/v1/')) {
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD, POST' }); response.end(); return;
    }
    try {
      const upload = request.method === 'POST' && (/^\/api\/v1\/projects\/[0-9a-f-]{36}\/documents$/i.test(pathname) || ['/api/v1/company-assets','/api/v1/output-recon/uploads','/api/v1/output-recon/inspect'].includes(pathname));
      const readPdf = request.method === 'POST' && (pathname === '/api/v1/output-recon/inspect' || /^\/api\/v1\/output-recon\/uploads\/[0-9a-f-]{36}\/read$/i.test(pathname));
      const preview = request.method === 'GET' && /^\/api\/v1\/output-recon\/uploads\/[0-9a-f-]{36}\/preview$/i.test(pathname);
      const financialPdf = request.method === 'POST' && (pathname.startsWith('/api/v1/invoices/') || /\/(finalize|signed-preview)$/.test(pathname));
      const inputRecon = pathname.startsWith('/api/v1/input-recon');
      const manualRevenueUpload = request.method === 'POST' && ['/api/v1/manual-revenue/import-preview', '/api/v1/manual-revenue/drafts'].includes(pathname);
      const cashHistoryImport = request.method === 'POST' && pathname === '/api/v1/cash-history/import';
      const expenseUpload = request.method === 'POST' && (pathname === '/api/v1/expenses' || /^\/api\/v1\/expenses\/[0-9a-f-]{36}\/update$/i.test(pathname));
      const bodyLimit = cashHistoryImport ? 12 * 1024 * 1024 : expenseUpload || manualRevenueUpload ? 8 * 1024 * 1024 : upload ? 7 * 1024 * 1024 : 32768;
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > bodyLimit) {
          response.writeHead(413, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
          response.end(JSON.stringify({ message:'Tệp quá lớn. Chọn file tối đa 5 MB.' })); return;
        }
        chunks.push(chunk);
      }
      const headers = { Accept: 'application/json' };
      for (const name of ['content-type', 'cookie', 'origin', 'x-csrf-token']) {
        if (typeof request.headers[name] === 'string') headers[name] = request.headers[name];
      }
      const target = new URL(request.url, apiBase);
      if (target.origin !== apiBase.origin) throw new Error('Invalid upstream origin');
      const upstream = await fetch(target, {
        method: request.method, headers,
        body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
        redirect: 'manual', signal: AbortSignal.timeout(readPdf ? 120000 : financialPdf || inputRecon ? 65000 : upload ? 60000 : preview || cashHistoryImport || expenseUpload ? 45000 : 15000)
      });
      const outputHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (upstream.headers.get('content-type')?.split(';')[0] === 'application/pdf') {
        outputHeaders['Content-Type'] = 'application/pdf';
        outputHeaders['Content-Disposition'] = upstream.headers.get('content-disposition') || 'attachment; filename="document.pdf"';
      }
      if (preview && upstream.headers.get('content-type')?.split(';')[0] === 'image/png') outputHeaders['Content-Type'] = 'image/png';
      if (/^\/api\/v1\/expenses\/[0-9a-f-]{36}\/document$/i.test(pathname) && ['image/png','image/jpeg'].includes(upstream.headers.get('content-type')?.split(';')[0])) {
        outputHeaders['Content-Type'] = upstream.headers.get('content-type');
        outputHeaders['Content-Disposition'] = upstream.headers.get('content-disposition') || 'inline';
      }
      if ((/^\/api\/v1\/company-assets\/[0-9a-f-]{36}\/download$/i.test(pathname) || /^\/api\/v1\/invoices\/[0-9a-f-]{36}\/download$/i.test(pathname) || ['/api/v1/output-recon/signing-asset','/api/v1/invoices/signing-asset','/api/v1/invoices/preview-page'].includes(pathname)) && ['image/png','image/jpeg','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel.sheet.macroEnabled.12'].includes(upstream.headers.get('content-type')?.split(';')[0])) {
        outputHeaders['Content-Type'] = upstream.headers.get('content-type');
        outputHeaders['Content-Disposition'] = upstream.headers.get('content-disposition') || 'attachment';
      }
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) outputHeaders['Set-Cookie'] = cookies;
      const outputBody = request.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer());
      response.writeHead(upstream.status, outputHeaders);
      response.end(outputBody);
    } catch {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ message: 'Không kết nối được dịch vụ. Vui lòng thử lại.' }));
    }
    return;
  }
  if (pathname.startsWith('/api/')) { response.writeHead(404); response.end(); return; }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  const root = resolve(publicDirectory);
  let filename = resolve(root, '.' + pathname);
  if (filename !== root && !filename.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  if (filename === root) filename = resolve(root, 'index.html');
  try {
    let body;
    try { body = await readFile(filename); }
    catch (error) {
      if (error.code !== 'ENOENT' || extname(pathname)) throw error;
      filename = resolve(root, 'index.html'); body = await readFile(filename);
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filename)] || 'application/octet-stream',
      'Cache-Control': filename.includes(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('ERP Core Web listening on port ' + server.address().port);
});
