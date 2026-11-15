import { randomUUID } from 'node:crypto';
import { prisma } from '@erp/db';
import { z } from 'zod';
import { authenticate } from '../auth/access.js';
import { audit, CommandError, parse, writeGuard } from './commands.js';
import { dossierCatalogue, dossierScope, dossierAccess } from './document-dossier.js';
import { sha } from './financial-documents.js';
import { deliverInvoiceMail, emailAddress, mailConfiguration } from './invoice-mail-transport.js';
const selection = dossierScope.extend({ keys: z.array(z.string().regex(/^(doc|upload):[a-f0-9-]{36}$/)).min(1).max(50).refine(v => new Set(v).size === v.length) }).strict();
const compose = selection.extend({ to: z.array(emailAddress).min(1).max(20), cc: z.array(emailAddress).max(20), subject: z.string().trim().min(1).max(200).refine(v => !/[\r\n]/.test(v)), text: z.string().trim().min(1).max(10000) }).strict().refine(b => new Set([...b.to, ...b.cc].map(v => v.toLowerCase())).size === b.to.length + b.cc.length);
const send = compose.safeExtend({ digest: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), confirmed: z.literal(true) }).strict();
async function mailPackage(tx, user, b) {
    const { keys } = b, scope = { direction: b.direction, period: b.period, partnerId: b.partnerId, ...(b.contractId ? { contractId: b.contractId } : {}) }, p = await dossierCatalogue(tx, user, scope), entries = [...keys].sort().map(key => p.entries.find(e => e.file.key === key));
    if (entries.some(e => !e || !e.file.current))
        throw new CommandError(409, 'Tệp không còn hiệu lực hoặc không thuộc phạm vi được xem. Chọn lại danh sách.');
    for (const e of entries) {
        const permission = e.file.kind.startsWith('INPUT') ? 'INPUT_RECON_APPROVE' : e.file.kind.startsWith('OUTPUT_INVOICE') ? 'INVOICE_ISSUE' : 'RECON_APPROVE';
        if (!user.permissions.includes(permission))
            throw new CommandError(403, 'Thiếu quyền gửi loại chứng từ đã chọn.');
    }
    const files = [];
    let size = 0;
    for (const e of entries) {
        size += e.file.size;
        if (!Number.isSafeInteger(size) || size > 18 * 1024 * 1024)
            throw new CommandError(422, 'Gói email tối đa 18 MB. Chọn ít tệp hơn.');
        const content = await e.read();
        files.push({ ...e.file, content });
    }
    // Document identity is deduplicated, not just file names. No original/signed substitutions.
    const unique = [...new Map(files.map(f => [f.key, f])).values()];
    return { scope, files: unique, partner: p.partner.legalName, warnings: [...new Set(unique.flatMap(f => f.warning ? [f.warning] : []))] };
}
const metadata = (p) => ({ ...p, files: p.files.map(({ content, ...f }) => f) });
const digest = (p, b) => sha(JSON.stringify({ package: metadata(p), body: { ...b, keys: [...b.keys].sort() }, from: mailConfiguration().from }));
export async function dossierEmailRoutes(app, config) {
    // writeGuard enforces session/Origin/CSRF; per-file permissions are checked by mailPackage.
    const guard = writeGuard(user => user.permissions.find(p => ['INPUT_RECON_APPROVE', 'INVOICE_ISSUE', 'RECON_APPROVE'].includes(p)) ?? 'INVOICE_ISSUE', config);
    app.post('/api/v1/document-dossier/email/prepare', { onRequest: guard }, async (req) => {
        const b = parse(selection, req.body), p = await prisma.$transaction(tx => mailPackage(tx, req.auth, b), { isolationLevel: 'RepeatableRead', timeout: 30000 }), companyId = req.auth.companyId;
        const staff = await prisma.user.findMany({ where: { companyId, status: 'ACTIVE' }, select: { fullName: true, email: true }, take: 200 }), contacts = await prisma.partnerContact.findMany({ where: { companyId, partnerId: b.partnerId, status: 'ACTIVE' }, select: { fullName: true, email: true }, take: 100 }), partner = await prisma.partner.findUniqueOrThrow({ where: { id: b.partnerId }, select: { email: true, invoiceEmail: true } });
        return { ...metadata(p), from: mailConfiguration().from, configured: mailConfiguration().configured, requestId: randomUUID(), recipients: [...staff.map(s => ({ ...s, group: 'Nội bộ' })), ...contacts.map(c => ({ ...c, group: 'Đối tác' })), { fullName: p.partner, email: partner.invoiceEmail ?? partner.email, group: 'Đối tác' }].filter(c => emailAddress.safeParse(c.email).success), subject: `Digicom - Chứng từ kỳ ${b.period} - ${p.partner}`, text: `Kính gửi Quý đối tác / Anh chị,\n\nDigicom gửi kèm các chứng từ kỳ ${b.period}.\nVui lòng kiểm tra các tệp đính kèm.\n\nTrân trọng,\nDigicom` };
    });
    app.post('/api/v1/document-dossier/email/preview', { onRequest: guard }, async (req) => { const b = parse(compose, req.body), p = await prisma.$transaction(tx => mailPackage(tx, req.auth, b), { isolationLevel: 'RepeatableRead', timeout: 30000 }); return { ...metadata(p), digest: digest(p, b) }; });
    app.post('/api/v1/document-dossier/email/send', { onRequest: guard }, async (req) => {
        const user = req.auth, { digest: expected, requestId, confirmed, ...b } = parse(send, req.body);
        if (!mailConfiguration().configured)
            throw new CommandError(409, 'Chưa cấu hình dịch vụ gửi thư.');
        const p = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId + '|DOSSIER_EMAIL'},0))`;
            await tx.$queryRaw `SELECT id FROM companies WHERE id=${user.companyId}::uuid FOR SHARE`;
            if (await tx.auditLog.findFirst({ where: { companyId: user.companyId, action: 'DOSSIER_EMAIL_ATTEMPT', entityId: requestId } }))
                throw new CommandError(409, 'Yêu cầu đã tiếp nhận; kiểm tra lịch sử trước khi gửi lại.');
            if (await tx.auditLog.findFirst({ where: { companyId: user.companyId, action: 'DOSSIER_EMAIL_ATTEMPT', createdAt: { gt: new Date(Date.now() - 5 * 60000) }, newValue: { path: ['digest'], equals: expected } } }))
                throw new CommandError(409, 'Nội dung và tệp này vừa được tiếp nhận; kiểm tra lịch sử.');
            if (await tx.auditLog.count({ where: { companyId: user.companyId, action: { in: ['DOSSIER_EMAIL_ATTEMPT', 'INVOICE_EMAIL_ATTEMPT'] }, createdAt: { gt: new Date(Date.now() - 60000) } } }) >= 5)
                throw new CommandError(429, 'Vui lòng chờ trước khi gửi thêm.');
            const { to, cc, subject, text, ...chosen } = b, p = await mailPackage(tx, user, chosen);
            if (digest(p, b) !== expected)
                throw new CommandError(409, 'Tệp hoặc nội dung đã thay đổi; kiểm tra email lại.');
            await audit(tx, user, 'DOSSIER_EMAIL_ATTEMPT', 'DocumentDossierEmail', requestId, null, { ...metadata(p), to, cc, subject, text, from: mailConfiguration().from, digest: expected });
            return p;
        }, { timeout: 30000 });
        const messageId = `<${requestId}@${mailConfiguration().from.split('@')[1]}>`;
        let result;
        try {
            result = await (config.emailTransport ?? deliverInvoiceMail)({ to: b.to, cc: b.cc, subject: b.subject, text: b.text, messageId, attachments: p.files.map(f => ({ filename: f.filename, content: f.content, contentType: 'application/pdf' })) });
        }
        catch {
            await prisma.$transaction(tx => audit(tx, user, 'DOSSIER_EMAIL_UNKNOWN', 'DocumentDossierEmail', requestId, null, { scope: p.scope, keys: b.keys, messageId, status: 'UNKNOWN' }));
            return { requestId, status: 'UNKNOWN', message: 'Chưa rõ kết quả gửi. Kiểm tra lịch sử hoặc hộp thư trước khi gửi lại.' };
        }
        const status = result.accepted.length ? (result.rejected.length ? 'PARTIAL' : 'ACCEPTED') : 'REJECTED';
        await prisma.$transaction(tx => audit(tx, user, 'DOSSIER_EMAIL_' + status, 'DocumentDossierEmail', requestId, null, { scope: p.scope, keys: b.keys, messageId, status, ...result }));
        return { requestId, status, ...result, message: status === 'ACCEPTED' ? 'Máy chủ thư đã nhận; chưa xác nhận đến hộp thư.' : status === 'PARTIAL' ? 'Chỉ tiếp nhận một phần người nhận; kiểm tra trước khi gửi lại.' : 'Máy chủ thư từ chối các người nhận.' };
    });
    app.get('/api/v1/document-dossier/email/history', { preHandler: authenticate }, async (req) => { const user = req.auth, scope = parse(dossierScope, req.query); dossierAccess(user); if (!user.permissions.some(p => ['INPUT_RECON_APPROVE', 'INVOICE_ISSUE', 'RECON_APPROVE'].includes(p)))
        throw new CommandError(403, 'Không có quyền xem lịch sử gửi.'); await prisma.$transaction(tx => dossierCatalogue(tx, user, scope)); return { items: await prisma.auditLog.findMany({ where: { companyId: user.companyId, entityType: 'DocumentDossierEmail', AND: [{ newValue: { path: ['scope', 'direction'], equals: scope.direction } }, { newValue: { path: ['scope', 'period'], equals: scope.period } }, { newValue: { path: ['scope', 'partnerId'], equals: scope.partnerId } }, ...(scope.contractId ? [{ newValue: { path: ['scope', 'contractId'], equals: scope.contractId } }] : [])] }, select: { entityId: true, action: true, newValue: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }) }; });
}
