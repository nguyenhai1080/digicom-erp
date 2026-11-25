import { prisma, Prisma } from '@erp/db';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { requirePermission } from '../auth/access.js';
import { audit, code, CommandError, date, parse, timestamp, unchanged, writeGuard } from './commands.js';
import { financialPeriodLock } from './recon-finalize.js';
import { checkedFile, persistPdf, persistPaymentImage, rollbackFiles, sha } from './financial-documents.js';
import { paymentFileSchema, historicalPaymentAmounts } from './historical-payment.js';
import { canPostInvoicePayment } from './invoice-payment-access.js';
import { distributeReceipt, receiptTotals } from './group-receipt-math.js';
const amount = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/), D = (s) => new Prisma.Decimal(s);
const uuid = z.uuid().transform(v => v.toLowerCase());
const input = z.object({ requestId: uuid, partnerId: uuid, paymentDate: date, bankReference: z.string().trim().min(5).max(200).regex(/^[A-Za-z0-9 /_:.-]+$/).transform(v => v.toUpperCase()), grossUsd: amount, bankFeeUsd: amount, cashCurrency: z.enum(['USD', 'VND']), cashAmount: amount, fxRate: z.string().regex(/^[1-9]\d{0,11}(\.\d{1,4})?$/).optional(), bankAccount: z.string().trim().max(200).default(''), note: z.string().trim().max(2000).default(''), swiftFile: paymentFileSchema.optional(), items: z.array(z.object({ invoiceId: uuid, expectedUpdatedAt: timestamp, amount }).strict()).min(2).max(50) }).strict();
const read = [requirePermission('INVOICE_VIEW'), requirePermission('INVOICE_PAYMENT_VIEW')];
function dgc(u) { if (u.companyCode !== 'DGC')
    throw new CommandError(404, 'Chức năng dành cho Digicom.'); }
function writable(u) { dgc(u); if (!canPostInvoicePayment(u) || !u.permissions.includes('INVOICE_PAYMENT_VIEW') || !u.permissions.includes('INVOICE_VIEW'))
    throw new CommandError(403, 'Cần quyền xem Invoice/khoản thu và tạo, duyệt thanh toán.'); }
function normalized(b) { if (new Set(b.items.map(i => i.invoiceId)).size !== b.items.length)
    throw new CommandError(400, 'Không chọn trùng Invoice.'); return { ...b, items: [...b.items].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)) }; }
async function evidence(file) {
    if (!file)
        return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64))
        throw new CommandError(400, 'Chứng từ không hợp lệ.');
    const bytes = Buffer.from(file.base64, 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024)
        throw new CommandError(400, 'Chứng từ tối đa 5 MB.');
    let ext = 'pdf';
    if (bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        try {
            const pdf = await PDFDocument.load(bytes);
            if (pdf.isEncrypted || pdf.getPageCount() > 30)
                throw Error();
        }
        catch {
            throw new CommandError(400, 'PDF lỗi, khóa hoặc quá 30 trang.');
        }
    }
    else {
        try {
            const img = sharp(bytes, { limitInputPixels: 20000000 }), meta = await img.metadata();
            if (!['png', 'jpeg'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
                throw Error();
            await img.stats();
            ext = meta.format === 'png' ? 'png' : 'jpg';
        }
        catch {
            throw new CommandError(400, 'Chọn PDF/PNG/JPG hợp lệ, ảnh tối đa 20 triệu điểm ảnh.');
        }
    }
    return { bytes, ext, checksum: sha(bytes), filename: file.filename };
}
async function plan(tx, u, b) {
    const totals = receiptTotals(b.grossUsd, b.bankFeeUsd, b.cashCurrency, b.cashAmount, b.fxRate);
    if (!b.items.reduce((sum, i) => sum.plus(i.amount), D('0')).eq(totals.gross))
        throw new CommandError(409, 'Tổng phân bổ Invoice phải bằng tổng USD thanh toán trước phí.');
    const rows = await tx.invoice.findMany({ where: { companyId: u.companyId, id: { in: b.items.map(i => i.invoiceId) } }, include: { receivable: true, scopes: { include: { items: { include: { revenue: { include: { reconciliation: true } } } } } } } });
    if (rows.length !== b.items.length)
        throw new CommandError(404, 'Không tìm thấy đủ Invoice của công ty.');
    const fees = distributeReceipt(totals.fee.toFixed(2), 2, b.items.map(i => ({ id: i.invoiceId, amount: i.amount }))), cash = distributeReceipt(totals.cash.toString(), b.cashCurrency === 'VND' ? 0 : 2, b.items.map(i => ({ id: i.invoiceId, amount: i.amount })));
    const items = [];
    for (const i of b.items) {
        const inv = rows.find(r => r.id === i.invoiceId);
        unchanged(inv, i.expectedUpdatedAt);
        if (inv.partnerId !== b.partnerId || inv.currency !== 'USD' || !inv.isCurrent || !inv.issuedAt || !['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(inv.status))
            throw new CommandError(409, 'Chọn Invoice USD hiện hành, cùng đối tác và còn phải thu.');
        const ar = inv.receivable;
        if (!ar || ar.companyId !== u.companyId || !ar.originalAmount.eq(inv.payableAmount) || !ar.paidAmount.eq(inv.paidAmount) || !ar.outstandingAmount.eq(ar.originalAmount.minus(ar.paidAmount)))
            throw new CommandError(409, 'Invoice và công nợ không khớp.');
        if (!inv.scopes.length || inv.scopes.some(s => !s.isCurrent || s.status !== 'INVOICED' || !s.items.length || s.items.some(v => !v.isCurrent || v.companyId !== u.companyId || !v.revenue.isCurrent || !['INVOICED', 'PARTIALLY_PAID', 'PAID'].includes(v.revenue.status) || v.revenue.companyId !== u.companyId || !v.revenue.reconciliation.isCurrent || v.revenue.reconciliation.status !== 'APPROVED')))
            throw new CommandError(409, 'Nguồn Invoice đã thay đổi; kiểm tra lại trước khi thu.');
        const old = await tx.invoicePayment.aggregate({ where: { companyId: u.companyId, invoiceId: inv.id }, _sum: { allocationAmount: true } });
        if (!(old._sum.allocationAmount ?? D('0')).eq(inv.paidAmount))
            throw new CommandError(409, 'Lịch sử khoản thu không khớp Invoice.');
        const after = historicalPaymentAmounts(inv.payableAmount.toString(), inv.paidAmount.toString(), i.amount, 'USD', i.amount, 'USD');
        items.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, period: inv.period, expectedUpdatedAt: inv.updatedAt.toISOString(), amount: D(i.amount).toFixed(2), beforeOutstanding: ar.outstandingAmount.toFixed(2), afterOutstanding: after.outstanding.toFixed(2), paidAfter: after.paidAfter.toFixed(2), status: after.status, feeShareUsd: fees.get(inv.id), cashShare: cash.get(inv.id), revenueIds: inv.scopes.flatMap(s => s.items.map(v => v.revenueId)), arId: ar.id });
    }
    return { items, grossUsd: totals.gross.toFixed(2), bankFeeUsd: totals.fee.toFixed(2), cashAmount: totals.cash.toFixed(b.cashCurrency === 'VND' ? 0 : 2), cashCurrency: b.cashCurrency, fxRate: totals.fx?.toString() ?? null };
}
async function view(tx, companyId, id) {
    const g = await tx.invoiceReceiptGroup.findFirst({ where: { companyId, id }, include: { partner: { select: { partnerKey: true, legalName: true } }, allocations: { orderBy: { id: 'asc' }, select: { id: true, invoiceId: true, paymentCode: true, allocationAmount: true, cashAmount: true, historicalSource: true } } } });
    if (!g)
        throw new CommandError(404, 'Không tìm thấy khoản thu chung.');
    return { ...g, documentUrl: g.documentId ? '/api/v1/invoice-receipt-groups/' + g.id + '/document' : null };
}
export async function groupReceiptRoutes(app, config) {
    app.get('/api/v1/invoice-receipt-groups/candidates', { preHandler: read }, async (req) => {
        const u = req.auth;
        dgc(u);
        const q = parse(z.object({ partnerId: uuid.optional(), q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict(), req.query);
        const base = { companyId: u.companyId, currency: 'USD', isCurrent: true, issuedAt: { not: null }, status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'] }, receivable: { outstandingAmount: { gt: 0 } } };
        const partners = await prisma.partner.findMany({ where: { companyId: u.companyId, invoices: { some: base } }, select: { id: true, partnerKey: true, legalName: true }, orderBy: { partnerKey: 'asc' }, take: 1000 });
        if (!q.partnerId)
            return { partners, items: [], total: 0, page: 1, pages: 1 };
        const where = { ...base, partnerId: q.partnerId, ...(q.q ? { invoiceNumber: { contains: q.q, mode: 'insensitive' } } : {}) }, total = await prisma.invoice.count({ where }), pages = Math.max(1, Math.ceil(total / 10)), page = Math.min(q.page, pages), items = await prisma.invoice.findMany({ where, select: { id: true, invoiceNumber: true, period: true, updatedAt: true, receivable: { select: { outstandingAmount: true } } }, orderBy: [{ period: 'desc' }, { invoiceNumber: 'asc' }, { id: 'asc' }], skip: (page - 1) * 10, take: 10 });
        return { partners, items: items.map(i => ({ ...i, outstanding: i.receivable.outstandingAmount.toFixed(2), receivable: undefined })), total, page, pages };
    });
    app.get('/api/v1/invoice-receipt-groups', { preHandler: read }, async (req) => {
        dgc(req.auth);
        const q = parse(z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict(), req.query), where = { companyId: req.auth.companyId }, total = await prisma.invoiceReceiptGroup.count({ where }), pages = Math.max(1, Math.ceil(total / 10)), page = Math.min(q.page, pages);
        return { items: await prisma.invoiceReceiptGroup.findMany({ where, select: { id: true, receiptCode: true, bankReference: true, paymentDate: true, grossUsd: true, bankFeeUsd: true, cashCurrency: true, cashAmount: true, partner: { select: { partnerKey: true } } }, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 10, take: 10 }), total, page, pages };
    });
    app.get('/api/v1/invoice-receipt-groups/:id', { preHandler: read }, async (req) => { dgc(req.auth); const id = parse(z.object({ id: uuid }), req.params).id; return prisma.$transaction(tx => view(tx, req.auth.companyId, id)); });
    app.post('/api/v1/invoice-receipt-groups/preview', { bodyLimit: 8 * 1024 * 1024, onRequest: writeGuard('PAYMENT_POST', config) }, async (req) => {
        writable(req.auth);
        const b = normalized(parse(input, req.body)), file = await evidence(b.swiftFile), p = await prisma.$transaction(tx => plan(tx, req.auth, b), { isolationLevel: 'RepeatableRead', timeout: 30000 });
        return { ...p, digest: sha(JSON.stringify(b)), evidence: file ? { filename: file.filename, checksum: file.checksum, size: file.bytes.length } : null };
    });
    app.post('/api/v1/invoice-receipt-groups', { bodyLimit: 8 * 1024 * 1024, onRequest: writeGuard('PAYMENT_POST', config) }, async (req) => {
        const u = req.auth;
        writable(u);
        const { digest, confirmed, ...raw } = parse(input.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(), req.body), b = normalized(raw), hash = sha(JSON.stringify(b));
        if (hash !== digest)
            throw new CommandError(409, 'Nội dung đã thay đổi; mở kiểm tra phân bổ lại.');
        const file = await evidence(b.swiftFile), files = [];
        try {
            return await prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${u.companyId + '|RECEIPT|' + b.requestId},0))`;
                const prior = await tx.invoiceReceiptGroup.findUnique({ where: { companyId_requestId: { companyId: u.companyId, requestId: b.requestId } } });
                if (prior) {
                    if (prior.requestDigest !== hash)
                        throw new CommandError(409, 'Mã yêu cầu đã dùng cho khoản thu khác.');
                    return { id: prior.id, replayed: true, message: 'Khoản thu đã ghi nhận; không ghi trùng.' };
                }
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${u.companyId + '|BANKREF|' + b.bankReference},0))`;
                if (await tx.invoiceReceiptGroup.findUnique({ where: { companyId_bankReference: { companyId: u.companyId, bankReference: b.bankReference } } }))
                    throw new CommandError(409, 'Mã giao dịch ngân hàng đã có khoản thu. Kiểm tra lịch sử trước khi nhập lại.');
                const before = await tx.invoice.findMany({ where: { companyId: u.companyId, id: { in: b.items.map(i => i.invoiceId) } }, select: { id: true, partnerId: true, period: true } });
                for (const period of [...new Set(before.map(i => i.partnerId + '|' + i.period))].sort()) {
                    const [partner, month] = period.split('|');
                    await financialPeriodLock(tx, u.companyId, partner, month);
                }
                for (const i of b.items)
                    await tx.$queryRaw `SELECT id FROM invoices WHERE id=${i.invoiceId}::uuid AND company_id=${u.companyId}::uuid FOR UPDATE`;
                const p = await plan(tx, u, b), id = randomUUID(), receiptCode = await code(tx, u.companyId, 'INVOICE_RECEIPT_GROUP', 'THU');
                const snapshot = { ...p, paymentDate: b.paymentDate, bankReference: b.bankReference, evidence: file ? { filename: file.filename, checksum: file.checksum, size: file.bytes.length } : null };
                await tx.invoiceReceiptGroup.create({ data: { id, companyId: u.companyId, partnerId: b.partnerId, receiptCode, requestId: b.requestId, requestDigest: hash, bankReference: b.bankReference, paymentDate: new Date(b.paymentDate), grossUsd: p.grossUsd, bankFeeUsd: p.bankFeeUsd, cashCurrency: b.cashCurrency, cashAmount: p.cashAmount, fxRate: p.fxRate, bankAccount: b.bankAccount, note: b.note, snapshot, createdById: u.userId } });
                for (const i of p.items) {
                    const payment = await tx.invoicePayment.create({ data: { companyId: u.companyId, invoiceId: i.invoiceId, receiptGroupId: id, paymentCode: await code(tx, u.companyId, 'INVOICE_PAYMENT', 'PAY'), requestId: randomUUID(), requestDigest: hash, paymentDate: new Date(b.paymentDate), allocationCurrency: 'USD', allocationAmount: i.amount, paidUsd: i.amount, cashCurrency: b.cashCurrency, cashAmount: i.cashShare, paidVnd: b.cashCurrency === 'VND' ? i.cashShare : null, fxRate: p.fxRate, swiftNo: b.bankReference, bankAccount: b.bankAccount, paymentMethod: 'Other', note: b.note, approvedById: u.userId, historicalSource: { sourceKind: 'DGC_GROUP_RECEIPT_ALLOCATION_V1', groupId: id, receiptCode, reference: b.bankReference, dateBasis: 'SOURCE', rateKind: 'GROUP_PROPORTIONAL', feeShareUsd: i.feeShareUsd } } });
                    await tx.invoice.update({ where: { id: i.invoiceId }, data: { paidAmount: i.paidAfter, status: i.status } });
                    await tx.accountReceivable.update({ where: { id: i.arId }, data: { paidAmount: i.paidAfter, outstandingAmount: i.afterOutstanding, status: i.status } });
                    await tx.revenue.updateMany({ where: { companyId: u.companyId, id: { in: i.revenueIds } }, data: { status: i.status } });
                    await audit(tx, u, 'INVOICE_PAYMENT_POST', 'InvoicePayment', payment.id, { outstanding: i.beforeOutstanding }, { ...payment, outstanding: i.afterOutstanding, receiptGroupId: id }, 'Phân bổ khoản thu chung ' + receiptCode + '; không ghi thêm tiền ngân hàng.');
                }
                if (file) {
                    const filename = 'Chung-tu-ngan-hang_' + receiptCode + '.' + file.ext, doc = file.ext === 'pdf' ? await persistPdf(tx, u, 'InvoiceReceiptGroup', id, 'PAYMENT_SWIFT', filename, file.bytes, 1, files) : await persistPaymentImage(tx, u, id, filename, file.bytes, file.ext, files, false, 'InvoiceReceiptGroup');
                    await tx.invoiceReceiptGroup.update({ where: { id }, data: { documentId: doc.id } });
                }
                await audit(tx, u, 'INVOICE_RECEIPT_GROUP_POST', 'InvoiceReceiptGroup', id, null, { ...snapshot, receiptCode, invoiceCount: p.items.length }, 'Nhận một khoản thu; phí và chứng từ chung, không cộng số dư tiền.');
                return { id, replayed: false, message: 'Đã ghi nhận một khoản thu cho ' + p.items.length + ' Invoice.' };
            }, { timeout: 30000 });
        }
        catch (e) {
            await rollbackFiles(files);
            throw e;
        }
    });
    app.get('/api/v1/invoice-receipt-groups/:id/document', { preHandler: read }, async (req, reply) => {
        const u = req.auth;
        dgc(u);
        const id = parse(z.object({ id: uuid }), req.params).id, g = await prisma.invoiceReceiptGroup.findFirst({ where: { companyId: u.companyId, id } });
        const doc = g?.documentId ? await prisma.document.findFirst({ where: { companyId: u.companyId, id: g.documentId, entityType: 'InvoiceReceiptGroup', entityId: id, documentType: 'PAYMENT_SWIFT', status: 'ACTIVE' }, include: { attachment: true } }) : null;
        if (!doc || doc.attachment.companyId !== u.companyId)
            throw new CommandError(404, 'Không có chứng từ khoản thu chung.');
        const ext = doc.attachment.storedFilename.split('.').at(-1);
        if (!['pdf', 'png', 'jpg'].includes(ext ?? ''))
            throw new CommandError(409, 'Chứng từ không hợp lệ.');
        const bytes = await checkedFile(doc.attachment, `payments/${u.companyId}/${doc.attachment.id}.${ext}`, 5 * 1024 * 1024);
        return reply.type(doc.attachment.mimeType).header('Content-Disposition', `inline; filename="${doc.attachment.originalFilename.replace(/[^A-Za-z0-9_.-]/g, '_')}"`).send(bytes);
    });
}
