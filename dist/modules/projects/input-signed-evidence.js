import { CommandError } from './commands.js';
import { dossierBytes } from './document-dossier-storage.js';
import { derivedBytes } from './financial-documents.js';
import { inputContractCoverage } from './input-recon-coverage.js';
export async function requireSignedInput(tx, companyId, row) {
    if (!row.documentId)
        throw new CommandError(409, 'Cần lưu biên bản gốc và nhập bản đã ký hai bên trước khi ghi nhận AP.');
    const source = await tx.document.findFirst({ where: { companyId, id: row.documentId, documentType: 'INPUT_RECON', entityType: 'InputReconStatement', entityId: row.inputContractId, documentNumber: row.period, status: 'ACTIVE' } });
    if (!source)
        throw new CommandError(409, 'Biên bản gốc đã thay đổi; cần nhập bản ký đúng phiên bản trước khi ghi nhận AP.');
    await derivedBytes(tx, companyId, source.id, 'INPUT_RECON');
    const members = await tx.inputReconciliation.findMany({ where: { companyId, documentId: source.id }, select: { id: true, sourceDigest: true, sourceRevenueId: true }, take: 501 });
    const saved = await tx.auditLog.findFirst({ where: { companyId, action: 'INPUT_RECON_PDF', entityId: source.id }, select: { newValue: true }, orderBy: { createdAt: 'desc' } }), snapshot = saved?.newValue;
    if (members.length > 500 || !members.length || !Array.isArray(snapshot?.rowIds) || !Array.isArray(snapshot?.sourceDigests) || snapshot.rowIds.length !== members.length || members.some(r => { const i = snapshot.rowIds.indexOf(r.id); return i < 0 || snapshot.sourceDigests[i] !== r.sourceDigest; }))
        throw new CommandError(409, 'Nguồn đã thay đổi so với biên bản đã ký. Cần lưu lại bản gốc và nhận bản ký mới trước khi ghi nhận AP.');
    if (!snapshot.data?.captured) {
        const coverage = await inputContractCoverage(tx, companyId, row.inputContractId, row.period, row.outputPartnerId);
        if (coverage.sources.length !== members.length || members.some(r => !coverage.sources.some(s => s.id === r.sourceRevenueId)))
            throw new CommandError(409, 'Biên bản đã ký chưa đủ nguồn chi tiết của hợp đồng. Cần lập đủ và nhận lại bản ký trước khi ghi nhận AP.');
    }
    const receipts = await tx.inputDocumentReceipt.findMany({ where: { companyId, sourceDocumentId: source.id, inputContractId: row.inputContractId, inputPartnerId: row.inputPartnerId, outputPartnerId: row.outputPartnerId, period: row.period, kind: 'INPUT_RECON_SIGNED', document: { status: 'ACTIVE' } }, include: { document: { include: { attachment: true } } }, take: 2 });
    if (receipts.length !== 1)
        throw new CommandError(409, 'Chưa có duy nhất biên bản đã ký hai bên đúng hợp đồng/kỳ và bản gốc. Nhập bản ký trước khi ghi nhận AP.');
    const receipt = receipts[0], d = receipt.document;
    if (d.documentType !== 'INPUT_RECON_SIGNED' || d.entityType !== 'InputReconStatement' || d.entityId !== row.inputContractId || d.attachment.companyId !== companyId || d.attachment.mimeType !== 'application/pdf')
        throw new CommandError(409, 'Bản ký không khớp hồ sơ.');
    const bytes = await dossierBytes(d, row.period, row.inputPartnerId, row.inputContractId, 'INPUT_RECON_SIGNED');
    return { documentId: d.id, sourceDocumentId: source.id, version: d.versionNo, checksum: d.attachment.checksumSha256, bytes: bytes.length };
}
