import { CommandError } from './commands.js';
// Source admission has already happened during the pinned book transfer. Future
// actions verify that relation, rather than re-auditing old PDF arithmetic.
export async function assertCapturedRevenue(tx, companyId, row) {
    const j = row.calculationJson, s = j?.source;
    if (j?.sourceKind !== 'DGC_CAPTURED_BOOK_V1' || !s || j.sourceStatus !== 'Approved')
        throw new CommandError(409, 'Nguồn doanh thu chưa được ghi nhận đã duyệt trong sổ chuyển.');
    const link = await tx.dgcImportLink.findFirst({ where: { companyId, targetModel: 'revenue', targetId: row.id, snapshotHash: j.snapshotHash, sheetId: s.sheetId, sourceRow: s.sourceRow, rowHash: s.rowHash } });
    const receipt = await tx.auditLog.findFirst({ where: { companyId, action: 'DGC_CAPTURED_BOOK_TRANSFER' } });
    if (!link || !receipt || ![receipt.newValue?.sourceSnapshotHash, receipt.newValue?.sourceAppendixHash].includes(j.snapshotHash))
        throw new CommandError(409, 'Chưa có biên nhận chuyển doanh thu nguyên trạng.');
    return { sourceKind: j.sourceKind, source: s, snapshotHash: j.snapshotHash, bookHash: receipt.traceId };
}
