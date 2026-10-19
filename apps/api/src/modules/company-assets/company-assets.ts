import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { z } from 'zod';
import { prisma, type Prisma } from '@erp/db';
import { requirePermission, type AuthConfig } from '../auth/access.js';
import { audit, code, CommandError, parse, writeGuard } from '../projects/commands.js';

import {asset,sha} from '../projects/financial-documents.js';
import {composeSigningImage,signingSourceKinds,signingCompositeLayout} from './signing-composite.js';

const kinds = ['COMPANY_LOGO','COMPANY_STAMP','SIGNATURE','SIGNER_TITLE_NAME','SIGNING_COMPOSITE','INVOICE_TEMPLATE'] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const scope = (companyId: string) => ({ companyId, entityType: 'CompanyAsset', entityId: companyId });
const selection = { attachment: true, createdBy: { select: { fullName: true } } } as const;
let validatingImages = 0;
function root() {
  const value = process.env.STORAGE_ROOT ?? './storage';
  if ((process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== 'local') ||
      (process.env.NODE_ENV === 'production' && !isAbsolute(value))) throw new CommandError(503, 'Kho tài sản chưa được cấu hình.');
  return resolve(value);
}
const upload = z.object({
  kind: z.enum(kinds), filename: z.string().trim().min(1).max(180).refine(v => !/[\x00-\x1f\x7f\\/:"<>|?*]/.test(v)),
  base64: z.string().min(8).max(Math.ceil(MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  expectedCurrentId: z.uuid().nullable(), reason: z.string().trim().min(1).max(500)
}).strict();

// Validate bytes without re-encoding company imagery or executing workbook macros.
async function format(data: Buffer, filename: string, kind: typeof kinds[number]) {
  const ext = filename.split('.').pop()!.toLowerCase();
  if (kind === 'INVOICE_TEMPLATE') {
    if (!['xlsx','xlsm'].includes(ext) || data.readUInt32LE(0) !== 0x04034b50) throw new CommandError(400, 'Chọn template XLSX hoặc XLSM hợp lệ.');
    try {
      const zip = new AdmZip(data), entries = zip.getEntries();
      if (entries.length > 2000 || entries.reduce((sum, e) => sum + e.header.size, 0) > 50 * 1024 * 1024 ||
          entries.some(e => e.header.encripted || e.entryName.includes('..') || e.entryName.includes('\\') || e.entryName.startsWith('/'))) throw new Error('Invalid archive');
      const content = zip.getEntry('[Content_Types].xml'), workbook = zip.getEntry('xl/workbook.xml');
      if (!content || !workbook || content.header.size > 1024 * 1024 || workbook.header.size > 1024 * 1024) throw new Error('Missing workbook');
      const xml = content.getData().toString('utf8'), book = workbook.getData().toString('utf8');
      const expected = ext === 'xlsm' ? 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
      if (!xml.includes(expected) || !book.includes('<workbook') || !book.includes('<sheet') || /<!DOCTYPE|<!ENTITY/i.test(xml + book)) throw new Error('Invalid workbook');
      if (ext === 'xlsx' && entries.some(e => /vbaProject\.bin$/i.test(e.entryName))) throw new Error('Mismatched workbook');
    } catch { throw new CommandError(400, 'Template Excel không hợp lệ hoặc vượt giới hạn giải nén.'); }
    return { ext, mime: ext === 'xlsm' ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  if (!['png','jpg','jpeg'].includes(ext)) throw new CommandError(400, 'Chọn ảnh PNG hoặc JPEG.');
  if (validatingImages >= 1) throw new CommandError(429, 'Đang kiểm tra ảnh khác. Vui lòng thử lại sau vài giây.');
  validatingImages++;
  try {
    const image = sharp(data, { limitInputPixels: 20_000_000, failOn: 'warning' });
    const info = await image.metadata();
    if (!['png','jpeg'].includes(info.format ?? '') || (ext === 'png') !== (info.format === 'png') || (info.pages ?? 1) > 1) throw new Error('Invalid image');
    await image.stats();
  } catch { throw new CommandError(400, 'Ảnh không hợp lệ hoặc quá lớn (tối đa 20 triệu điểm ảnh).'); }
  finally { validatingImages--; }
  return { ext: ext === 'jpeg' ? 'jpg' : ext, mime: ext === 'png' ? 'image/png' : 'image/jpeg' };
}
function display(doc: Prisma.DocumentGetPayload<{ include: typeof selection }>) {
  return { id: doc.id, kind: doc.documentType, version: doc.versionNo, status: doc.status,
    filename: doc.attachment.originalFilename, bytes: Number(doc.attachment.fileSize), mimeType: doc.attachment.mimeType,
    checksumSha256: doc.attachment.checksumSha256, uploadedAt: doc.createdAt, uploadedBy: doc.createdBy?.fullName ?? '' };
}
const sourceIds=z.object({stamp:z.uuid(),signature:z.uuid(),title:z.uuid()}).strict();
async function compositeSources(tx:Prisma.TransactionClient,companyId:string,ids:z.infer<typeof sourceIds>){
 const resources=await Promise.all(Object.entries(signingSourceKinds).map(async([name,kind])=>[name,await asset(tx,companyId,kind,ids[name as keyof typeof ids])] as const));
 return {images:Object.fromEntries(resources.map(([name,a])=>[name,a.bytes])) as Parameters<typeof composeSigningImage>[0],
  provenance:{layout:signingCompositeLayout,sources:Object.fromEntries(resources.map(([name,a])=>[name,{id:a.document.id,version:a.document.versionNo,checksum:a.document.attachment.checksumSha256}]))}};
}
async function saveAsset(request:FastifyRequest,body:Pick<z.infer<typeof upload>,'kind'|'filename'|'expectedCurrentId'|'reason'>,data:Buffer,fileFormat:{ext:string;mime:string},verifySources?:(tx:Prisma.TransactionClient)=>Promise<unknown>){
    const user=request.auth!,checksum = hash(data), id = randomUUID();
    const folder = body.kind === 'INVOICE_TEMPLATE' ? 'invoice-templates' : 'company-assets';
    const directory = resolve(root(), folder, user.companyId), relative = `${folder}/${user.companyId}/${id}.${fileFormat.ext}`;
    const filename = resolve(root(), relative), temp = filename + '.pending'; let stored = false;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, filename); stored = true;
      const item = await prisma.$transaction(async tx => {
        // Serialize all asset changes for a company; never overwrite an existing file.
        await tx.$queryRaw`SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR UPDATE`;
        const provenance=verifySources?await verifySources(tx):undefined;
        const where = { ...scope(user.companyId), documentType: body.kind };
        const current = await tx.document.findFirst({ where: { ...where, status: 'ACTIVE' }, include: selection });
        if ((current?.id ?? null) !== body.expectedCurrentId) throw new CommandError(409, 'Tài sản đã thay đổi. Tải lại trước khi upload.');
        if (current?.attachment.checksumSha256 === checksum) throw new CommandError(409, 'File này đang được sử dụng.');
        const latest = await tx.document.aggregate({ where, _max: { versionNo: true } });
        const attachment = await tx.attachment.create({ data: { id, companyId: user.companyId, originalFilename: body.filename,
          storedFilename: `${id}.${fileFormat.ext}`, storageProvider: 'local', storagePath: relative,
          mimeType: fileFormat.mime, fileSize: BigInt(data.length), checksumSha256: checksum, uploadedById: user.userId } });
        if (current) await tx.document.update({ where: { id: current.id }, data: { status: 'SUPERSEDED' } });
        const doc = await tx.document.create({ data: { ...where, documentCode: await code(tx, user.companyId, 'COMPANY_ASSET', 'AST'),
          versionNo: (latest._max.versionNo ?? 0) + 1, attachmentId: attachment.id, createdById: user.userId }, include: selection });
        await audit(tx, user, provenance?'COMPANY_ASSET_COMPOSE':'COMPANY_ASSET_UPLOAD', 'Document', doc.id, current ? display(current) : null, {...display(doc),...(provenance?{provenance}:{})}, body.reason);
        return display(doc);
      });
      return item;
    } catch (error) {
      try { await unlink(stored ? filename : temp); } catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') request.log.error({ err: cleanup }, 'Asset cleanup failed'); }
      if (error instanceof CommandError) throw error;
      request.log.error({ err: error }, 'Asset upload failed');
      throw new CommandError(503, 'Không lưu được tài sản. Kiểm tra kho lưu trữ API.');
    }
}
export async function companyAssetRoutes(app: FastifyInstance, config: AuthConfig) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CommandError) return reply.code(error.statusCode).send({ message: error.message });
    throw error;
  });
  app.get('/api/v1/company-assets', { preHandler: requirePermission('SYSTEM_CONFIG_EDIT') }, async request => {
    const where = { ...scope(request.auth!.companyId), documentType: { in: [...kinds] } };
    const [current, history] = await Promise.all([
      prisma.document.findMany({ where: { ...where, status: 'ACTIVE' }, include: selection, orderBy: { documentType: 'asc' } }),
      prisma.document.findMany({ where: { ...where, status: 'SUPERSEDED' }, include: selection, orderBy: { createdAt: 'desc' }, take: 501 })
    ]);
    return { items: [...current, ...history.slice(0,500)].map(display), truncated: history.length > 500, maxBytes: MAX_BYTES, companyCode:request.auth!.companyCode };
  });
  app.post('/api/v1/company-assets', { bodyLimit: 7 * 1024 * 1024, onRequest: writeGuard('SYSTEM_CONFIG_EDIT', config) }, async (request, reply) => {
    const body = parse(upload, request.body), data = Buffer.from(body.base64, 'base64');
    if (data.length < 8 || data.length > MAX_BYTES || data.toString('base64') !== body.base64) throw new CommandError(400, 'File không hợp lệ, tối đa 5 MB.');
    const fileFormat=await format(data,body.filename,body.kind);
    return reply.code(201).send({item:await saveAsset(request,body,data,fileFormat)});
  });
  app.post('/api/v1/company-assets/signing-composite/preview',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async request=>{
    if(request.auth!.companyCode!=='DGC')throw new CommandError(409,'Chức năng ghép ảnh này dành cho DGC.');
    const body=parse(z.object({sourceIds}).strict(),request.body);
    const source=await prisma.$transaction(tx=>compositeSources(tx,request.auth!.companyId,body.sourceIds),{isolationLevel:'RepeatableRead'});
    const bytes=await composeSigningImage(source.images);
    return {base64:bytes.toString('base64'),mimeType:'image/png',digest:sha(JSON.stringify(source.provenance)+'|'+sha(bytes)),provenance:source.provenance};
  });
  app.post('/api/v1/company-assets/signing-composite/create',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async(request,reply)=>{
    if(request.auth!.companyCode!=='DGC')throw new CommandError(409,'Chức năng ghép ảnh này dành cho DGC.');
    const body=parse(z.object({sourceIds,digest:z.string().regex(/^[a-f0-9]{64}$/),expectedCurrentId:z.uuid().nullable(),reason:z.string().trim().min(1).max(500)}).strict(),request.body);
    const source=await prisma.$transaction(tx=>compositeSources(tx,request.auth!.companyId,body.sourceIds),{isolationLevel:'RepeatableRead'});
    const bytes=await composeSigningImage(source.images);
    if(body.digest!==sha(JSON.stringify(source.provenance)+'|'+sha(bytes)))throw new CommandError(409,'Ảnh nguồn đã thay đổi. Xem lại bản ghép trước khi lưu.');
    const item=await saveAsset(request,{kind:'SIGNING_COMPOSITE',filename:'DGC-signing-composite.png',expectedCurrentId:body.expectedCurrentId,reason:body.reason},bytes,{ext:'png',mime:'image/png'},async tx=>{
      const current=await compositeSources(tx,request.auth!.companyId,body.sourceIds);
      if(JSON.stringify(current.provenance)!==JSON.stringify(source.provenance))throw new CommandError(409,'Ảnh nguồn đã thay đổi. Xem lại bản ghép trước khi lưu.');
      return source.provenance;
    });
    return reply.code(201).send({item});
  });
  app.get('/api/v1/company-assets/:id/download', { preHandler: requirePermission('SYSTEM_CONFIG_EDIT') }, async (request, reply) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const doc = await prisma.document.findFirst({ where: { ...scope(request.auth!.companyId), id, documentType: { in: [...kinds] } }, include: selection });
    if (!doc) throw new CommandError(404, 'Không tìm thấy tài sản.');
    const a = doc.attachment, folder = doc.documentType === 'INVOICE_TEMPLATE' ? 'invoice-templates' : 'company-assets';
    const ext = a.storedFilename.split('.').pop();
    if (a.companyId !== request.auth!.companyId || a.storageProvider !== 'local' || !['png','jpg','xlsx','xlsm'].includes(ext ?? '') ||
        a.storedFilename !== `${a.id}.${ext}` || a.storagePath !== `${folder}/${doc.companyId}/${a.id}.${ext}`) throw new CommandError(409, 'Đường dẫn tài sản không hợp lệ.');
    let data: Buffer;
    try {
      const file = resolve(root(), a.storagePath), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || BigInt(stat.size) !== a.fileSize) throw new Error('Invalid file');
      data = await readFile(file);
    } catch { throw new CommandError(409, 'Không đọc được tài sản trong kho.'); }
    if (hash(data) !== a.checksumSha256) throw new CommandError(409, 'File tài sản đã thay đổi.');
    const name = encodeURIComponent(a.originalFilename).replace(/[!'()*]/g, v => '%' + v.charCodeAt(0).toString(16).toUpperCase());
    return reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').type(a.mimeType ?? 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="asset.${ext}"; filename*=UTF-8''${name}`).send(data);
  });
}
