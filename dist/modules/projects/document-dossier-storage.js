import { randomUUID } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { code, CommandError } from './commands.js';
import { checkedFile, sha, storageRoot } from './financial-documents.js';
export const dossierLabels = { OUTPUT_RECON_ORIGINAL: 'Đối soát đầu ra · Gốc đối tác', OUTPUT_RECON_SIGNED: 'Đối soát đầu ra · Có dấu/chữ ký', OUTPUT_INVOICE_ORIGINAL: 'Invoice đầu ra · Chưa chèn dấu/chữ ký', OUTPUT_INVOICE_SIGNED: 'Invoice đầu ra · Có dấu/chữ ký', INPUT_RECON_ORIGINAL: 'Đối soát đầu vào · Bản gốc', INPUT_RECON_SIGNED: 'Đối soát đầu vào · Đã ký hai bên', INPUT_INVOICE_SIGNED: 'Invoice đầu vào · Có dấu/chữ ký đối tác' };
const folders = { OUTPUT_RECON_ORIGINAL: '01-DoiSoatDauRa/Goc', OUTPUT_RECON_SIGNED: '01-DoiSoatDauRa/DaKy', OUTPUT_INVOICE_ORIGINAL: '02-InvoiceDauRa/Goc', OUTPUT_INVOICE_SIGNED: '02-InvoiceDauRa/DaKy', INPUT_RECON_ORIGINAL: '03-DoiSoatDauVao/Goc', INPUT_RECON_SIGNED: '03-DoiSoatDauVao/DaKyHaiBen', INPUT_INVOICE_SIGNED: '04-InvoiceDauVao/DaKyDoiTac' };
const slug = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 65) || 'HoSo';
export function dossierDisplay(kind, period, partner, contract, reference, version, checksum) {
    const folder = `${period.slice(0, 4)}/${period}/${slug(partner)}/${slug(contract)}/${folders[kind]}`;
    return { folder, filename: `Digicom_${period}_${slug(partner)}_${slug(contract)}_${folders[kind].replace('/', '_')}_${slug(reference)}_v${String(version).padStart(2, '0')}_${checksum.slice(0, 8)}.pdf` };
}
export function dossierPath(companyId, period, partnerId, contractId, kind, id) { return `dossiers/${companyId}/${period.slice(0, 4)}/${period}/${partnerId}/${contractId ?? 'all'}/${kind}/${id}.pdf`; }
export async function persistDossierPdf(tx, user, scope, bytes, rollback) {
    if (!bytes.length || bytes.length > 16 * 1024 * 1024)
        throw new CommandError(422, 'PDF tối đa 16 MB.');
    const id = randomUUID(), relative = dossierPath(user.companyId, scope.period, scope.partnerId, scope.contractId, scope.kind, id), path = resolve(storageRoot(), relative), temp = path + '.pending';
    await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
    rollback.push(temp);
    const h = await open(temp, 'wx', 0o600);
    try {
        await h.writeFile(bytes);
        await h.sync();
    }
    finally {
        await h.close();
    }
    await rename(temp, path);
    rollback.push(path);
    const attachment = await tx.attachment.create({ data: { id, companyId: user.companyId, originalFilename: scope.filename, storedFilename: id + '.pdf', storageProvider: 'local', storagePath: relative, mimeType: 'application/pdf', fileSize: BigInt(bytes.length), checksumSha256: sha(bytes), uploadedById: user.userId } });
    return tx.document.create({ data: { companyId: user.companyId, documentCode: await code(tx, user.companyId, 'DOSSIER', 'DFILE'), documentType: scope.kind, entityType: scope.kind === 'OUTPUT_INVOICE_ORIGINAL' ? 'Invoice' : 'InputReconStatement', entityId: scope.entityId, documentNumber: scope.reference, attachmentId: attachment.id, versionNo: scope.version, createdById: user.userId } });
}
export async function dossierBytes(d, period, partnerId, contractId, kind) { return checkedFile(d.attachment, dossierPath(d.companyId, period, partnerId, contractId, kind, d.attachment.id)); }
