import { prisma } from '@erp/db';
import { z } from 'zod';
import { requirePermission } from '../auth/access.js';
import { CommandError, parse } from './commands.js';
import { requireDgc } from './input-recon.js';
// One saved statement/PDF per row, never one row per child service or a new sum.
export async function inputStatementListRoutes(app) {
    app.get('/api/v1/input-recon/statements', { preHandler: requirePermission('INPUT_RECON_VIEW') }, async (req) => {
        const q = parse(z.object({ period: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(), inputContractId: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict(), req.query), companyId = req.auth.companyId;
        return prisma.$transaction(async (tx) => {
            await requireDgc(tx, companyId);
            const where = { companyId, documentType: 'INPUT_RECON', entityType: 'InputReconStatement', status: 'ACTIVE', ...(q.period ? { documentNumber: q.period } : {}), inputReconciliations: { some: { companyId, ...(q.period ? { period: q.period } : {}), ...(q.inputContractId ? { inputContractId: q.inputContractId } : {}) } } };
            const total = await tx.document.count({ where }), pages = Math.max(1, Math.ceil(total / 10)), page = Math.min(q.page, pages), docs = await tx.document.findMany({ where, orderBy: [{ documentNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 10, take: 10, include: { inputReconciliations: { where: { companyId }, select: { id: true, period: true, inputContractId: true, inputPartnerId: true, outputPartnerId: true, status: true, sourceSnapshot: true, inputContract: { select: { companyId: true, contractCode: true, contractNumber: true } }, inputPartner: { select: { companyId: true, partnerKey: true, legalName: true } }, outputPartner: { select: { companyId: true, partnerKey: true } } } } } });
            const items = [];
            for (const d of docs) {
                const first = d.inputReconciliations[0], rows = d.inputReconciliations;
                if (!first || rows.some(r => r.period !== d.documentNumber || r.inputContractId !== d.entityId || r.inputPartnerId !== first.inputPartnerId || [r.inputContract, r.inputPartner, r.outputPartner].some(p => p.companyId !== companyId)))
                    throw new CommandError(409, 'Liên kết biên bản không khớp hợp đồng/kỳ.');
                const networkIds = [...new Set(rows.map(r => r.outputPartnerId))], selection = { direction: 'INPUT', period: first.period, partnerId: first.inputPartnerId, contractId: first.inputContractId };
                const receipts = await tx.inputDocumentReceipt.findMany({ where: { companyId, sourceDocumentId: d.id, inputContractId: first.inputContractId, inputPartnerId: first.inputPartnerId, period: first.period, kind: 'INPUT_RECON_SIGNED', outputPartnerId: { in: networkIds }, document: { status: 'ACTIVE', documentType: 'INPUT_RECON_SIGNED', entityType: 'InputReconStatement', entityId: first.inputContractId } }, select: { documentId: true, document: { select: { versionNo: true } } }, take: 2 });
                const signed = receipts.length === 1 ? receipts[0] : null, captured = rows.some(r => r.sourceSnapshot?.sourceKind === 'DGC_CAPTURED_BOOK_V1');
                items.push({ id: d.id, period: first.period, inputContractId: first.inputContractId, inputPartnerId: first.inputPartnerId, outputPartnerId: networkIds.length === 1 ? networkIds[0] : null, partnerKey: first.inputPartner.partnerKey, partnerName: first.inputPartner.legalName, contractCode: first.inputContract.contractCode, contractNumber: first.inputContract.contractNumber, networks: [...new Set(rows.map(r => r.outputPartner.partnerKey))].sort(), version: d.versionNo, createdAt: d.createdAt, recordCount: rows.length, captured, approvedCount: rows.filter(r => r.status === 'APPROVED').length, originalPdfUrl: '/api/v1/document-dossier/pdf?' + new URLSearchParams({ ...selection, key: 'doc:' + d.id }), signedPdfUrl: signed ? '/api/v1/document-dossier/pdf?' + new URLSearchParams({ ...selection, key: 'doc:' + signed.documentId }) : null, signedVersion: signed?.document.versionNo ?? null, signatureState: receipts.length > 1 ? 'AMBIGUOUS' : signed ? 'RECEIVED' : 'MISSING' });
            }
            return { items, total, page, pages, limit: 10 };
        }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    });
}
