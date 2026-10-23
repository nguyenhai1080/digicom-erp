import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@erp/db';
import { requirePermission, type AuthConfig, type Identity } from '../auth/access.js';
import { audit, code, CommandError, currency, money, parse, project, text, timestamp, unchanged, writeGuard } from './commands.js';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BODY = 7 * 1024 * 1024;
const ids = (value: unknown) => parse(z.object({ id: z.uuid(), child: z.uuid().optional() }), value);
const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
function storageRoot() {
  if (process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== 'local') throw new CommandError(503, 'Kho chứng từ hiện cần lưu trữ local.');
  const root = process.env.STORAGE_ROOT ?? './storage';
  if (process.env.NODE_ENV === 'production' && !isAbsolute(root)) throw new CommandError(503, 'Kho chứng từ chưa được cấu hình.');
  return resolve(root);
}
const uploadSchema = z.object({
  filename: z.string().trim().min(5).max(180).regex(/\.pdf$/i).refine(v => !/[\x00-\x1f\x7f\\/:"<>|?*]/.test(v)),
  documentType: z.enum(['CONTRACT','MILESTONE_EVIDENCE','OTHER']),
  documentNumber: text.optional(),
  base64: z.string().min(8).max(Math.ceil(MAX_PDF_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/)
}).strict();

// Only project-scoped, server-stored files are usable. Paths never come from clients.
export async function evidence(tx: Prisma.TransactionClient, user: Identity, projectId: string, documentId: string, type?: string) {
  const doc = await tx.document.findFirst({ where: { id: documentId, companyId: user.companyId, entityType: 'Project', entityId: projectId,
    status: 'ACTIVE', ...(type ? { documentType: type } : {}) }, include: { attachment: true } });
  if (!doc || doc.attachment.companyId !== user.companyId) throw new CommandError(404, 'Không tìm thấy chứng từ hợp lệ của dự án.');
  if ((doc.documentType === 'CONTRACT' && !user.permissions.includes('CONTRACT_VIEW')) ||
      (doc.documentType === 'MILESTONE_EVIDENCE' && !user.permissions.includes('MILESTONE_VIEW'))) {
    throw new CommandError(403, 'Bạn không có quyền xem loại hồ sơ này.');
  }
  const attachment = doc.attachment;
  const expected = `documents/${user.companyId}/${attachment.id}.pdf`;
  if (attachment.storageProvider !== 'local' || attachment.storagePath !== expected || attachment.storedFilename !== attachment.id + '.pdf') {
    throw new CommandError(409, 'Chứng từ chưa có tệp hợp lệ trong kho.');
  }
  const filename = resolve(storageRoot(), expected);
  let data: Buffer;
  try {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PDF_BYTES || BigInt(stat.size) !== attachment.fileSize) throw new Error('Invalid stored size');
    data = await readFile(filename);
  } catch { throw new CommandError(409, 'Tệp chứng từ không còn truy cập được. Kiểm tra kho lưu trữ.'); }
  if (BigInt(data.length) !== attachment.fileSize || digest(data) !== attachment.checksumSha256) {
    throw new CommandError(409, 'Tệp chứng từ đã thay đổi. Không thể dùng hồ sơ này.');
  }
  return { doc, data };
}
export async function evidenceRoutes(app: FastifyInstance, config: AuthConfig) {
  app.post('/api/v1/projects/:id/documents', { bodyLimit: MAX_UPLOAD_BODY, onRequest: writeGuard('PROJECT_EDIT', config) }, async (request, reply) => {
    const { id } = ids(request.params); const user = request.auth!; const body = parse(uploadSchema, request.body);
    const typePermission = body.documentType === 'CONTRACT' ? 'CONTRACT_EDIT' : body.documentType === 'MILESTONE_EVIDENCE' ? 'MILESTONE_EDIT' : null;
    const viewPermission = body.documentType === 'CONTRACT' ? 'CONTRACT_VIEW' : body.documentType === 'MILESTONE_EVIDENCE' ? 'MILESTONE_VIEW' : null;
    if ((typePermission && !user.permissions.includes(typePermission)) || (viewPermission && !user.permissions.includes(viewPermission))) throw new CommandError(403, 'Bạn không có quyền tải loại hồ sơ này.');
    const data = Buffer.from(body.base64, 'base64');
    if (data.length > MAX_PDF_BYTES || data.toString('base64') !== body.base64 || !/^%PDF-[12]\.\d/.test(data.subarray(0, 8).toString('ascii')) ||
      !data.subarray(-1024).toString('ascii').includes('%%EOF')) throw new CommandError(400, 'Chọn tệp PDF hợp lệ, tối đa 5 MB.');
    await project(prisma, user, id);
    const attachmentId = randomUUID(); const relative = `documents/${user.companyId}/${attachmentId}.pdf`;
    const directory = resolve(storageRoot(), 'documents', user.companyId); const filename = resolve(storageRoot(), relative);
    let created = false;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await open(filename, 'wx', 0o600); created = true;
      try { await handle.writeFile(data); } finally { await handle.close(); }
    } catch (error) {
      if (created) { try { await unlink(filename); } catch (cleanupError) { request.log.error({ err: cleanupError, attachmentId }, 'Evidence cleanup failed'); } }
      request.log.error({ err: error }, 'Evidence storage unavailable');
      throw new CommandError(503, 'Không ghi được tệp vào kho chứng từ. Kiểm tra lưu trữ của API.');
    }
    try {
      const item = await prisma.$transaction(async tx => {
        await project(tx, user, id, true);
        const attachment = await tx.attachment.create({ data: { id: attachmentId, companyId: user.companyId,
          originalFilename: body.filename, storedFilename: attachmentId + '.pdf', storageProvider: 'local', storagePath: relative,
          mimeType: 'application/pdf', fileSize: BigInt(data.length), checksumSha256: digest(data), uploadedById: user.userId } });
        const doc = await tx.document.create({ data: { companyId: user.companyId, documentCode: await code(tx, user.companyId, 'DOCUMENT', 'DOC'),
          documentType: body.documentType, documentNumber: body.documentNumber, entityType: 'Project', entityId: id,
          attachmentId: attachment.id, createdById: user.userId } });
        await audit(tx, user, 'DOCUMENT_UPLOAD', 'Document', doc.id, null, { ...doc, filename: body.filename, bytes: data.length, checksumSha256: attachment.checksumSha256 });
        return { id: doc.id, documentCode: doc.documentCode, documentType: doc.documentType, filename: body.filename, bytes: data.length };
      }); return reply.code(201).send({ item });
    } catch (error) {
      try { await unlink(filename); } catch (cleanupError) { request.log.error({ err: cleanupError, attachmentId }, 'Failed to remove uncommitted evidence file'); }
      throw error;
    }
  });
  app.get('/api/v1/projects/:id/documents/:child/download', { preHandler: requirePermission('PROJECT_VIEW') }, async (request, reply) => {
    const { id, child } = ids(request.params); const user = request.auth!;
    await project(prisma, user, id);
    const { doc, data } = await evidence(prisma, user, id, child!);
    const name = encodeURIComponent(doc.attachment.originalFilename).replace(/[!'()*]/g, v => '%' + v.charCodeAt(0).toString(16).toUpperCase());
    return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${name}`).send(data);
  });
  app.post('/api/v1/projects/:id/contracts', { preHandler: writeGuard('CONTRACT_CREATE', config) }, async (request, reply) => {
    const { id } = ids(request.params); const user = request.auth!;
    const body = parse(z.object({ contractName: text, contractNumber: text.optional(), currency, baseContractValue: money }).strict(), request.body);
    const item = await prisma.$transaction(async tx => {
      const p = await project(tx, user, id, true);
      if (!await tx.partner.findFirst({ where: { id: p.partnerId, companyId: user.companyId, status: { in: ['ACTIVE','PROSPECT'] } } })) {
        throw new CommandError(404, 'Không tìm thấy đối tác hợp lệ của dự án.');
      }
      if (body.currency !== p.currency) throw new CommandError(400, 'Đồng tiền hợp đồng phải trùng với dự án.');
      if (await tx.projectContract.findFirst({ where: { projectId: id, role: 'MAIN', isPrimary: true } })) throw new CommandError(409, 'Dự án đã có hợp đồng chính.');
      const contract = await tx.contract.create({ data: { ...body, companyId: user.companyId, partnerId: p.partnerId, ownerUserId: user.userId,
        sourceProjectId: id, contractCode: await code(tx, user.companyId, 'CONTRACT', 'CT'), businessType: 'PROJECT', contractType: 'MAIN', valueType: 'FIXED' } });
      await tx.projectContract.create({ data: { companyId: user.companyId, projectId: id, contractId: contract.id, role: 'MAIN', isPrimary: true } });
      await audit(tx, user, 'CONTRACT_CREATE', 'Contract', contract.id, null, contract); return contract;
    }); return reply.code(201).send({ item });
  });
  const contract = async (tx: Prisma.TransactionClient, user: Identity, projectId: string, contractId: string) => {
    if (!user.permissions.includes('CONTRACT_VIEW')) throw new CommandError(403, 'Bạn không có quyền xem hợp đồng.');
    await project(tx, user, projectId, true);
    const link = await tx.projectContract.findFirst({ where: { companyId: user.companyId, projectId, contractId, role: 'MAIN', isPrimary: true,
      contract: { companyId: user.companyId, sourceProjectId: projectId } }, include: { contract: true } });
    if (!link) throw new CommandError(404, 'Không tìm thấy hợp đồng chính của dự án.');
    return link.contract;
  };
  app.post('/api/v1/projects/:id/contracts/:child/document', { preHandler: writeGuard('CONTRACT_EDIT', config) }, async request => {
    const { id, child } = ids(request.params); const user = request.auth!;
    const body = parse(z.object({ documentId: z.uuid(), expectedUpdatedAt: timestamp, reason: text }).strict(), request.body);
    return prisma.$transaction(async tx => {
      const previous = await contract(tx, user, id, child!); unchanged(previous, body.expectedUpdatedAt);
      if (previous.status !== 'DRAFT') throw new CommandError(409, 'Chỉ thay hồ sơ hợp đồng ở trạng thái nháp.');
      await evidence(tx, user, id, body.documentId, 'CONTRACT');
      const item = await tx.contract.update({ where: { id: previous.id }, data: { officialDocumentId: body.documentId } });
      await audit(tx, user, 'CONTRACT_DOCUMENT', 'Contract', item.id, previous, item, body.reason); return { item };
    });
  });
  for (const action of ['submit','approve','return'] as const) app.post(`/api/v1/projects/:id/contracts/:child/${action}`,
    { preHandler: writeGuard(action === 'submit' ? 'CONTRACT_SUBMIT' : 'CONTRACT_APPROVE', config) }, async request => {
      const { id, child } = ids(request.params); const user = request.auth!;
      const body = parse(z.object({ expectedUpdatedAt: timestamp, reason: text }).strict(), request.body);
      return prisma.$transaction(async tx => {
        const previous = await contract(tx, user, id, child!); unchanged(previous, body.expectedUpdatedAt);
        if (previous.status !== (action === 'submit' ? 'DRAFT' : 'UNDER_REVIEW')) throw new CommandError(409, 'Trạng thái hợp đồng không cho phép thao tác này.');
        if (action !== 'return') {
          if (!previous.officialDocumentId) throw new CommandError(409, 'Gắn tệp hợp đồng trước khi gửi hoặc duyệt.');
          await evidence(tx, user, id, previous.officialDocumentId, 'CONTRACT');
        }
        const item = await tx.contract.update({ where: { id: previous.id }, data: { status: action === 'submit' ? 'UNDER_REVIEW' : action === 'approve' ? 'APPROVED' : 'DRAFT' } });
        await audit(tx, user, 'CONTRACT_' + action.toUpperCase(), 'Contract', item.id, previous, item, body.reason); return { item };
      });
    });
}
