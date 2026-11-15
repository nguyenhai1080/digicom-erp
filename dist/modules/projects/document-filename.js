import { createHash } from 'node:crypto';
// Display names are separate from the immutable UUID storage paths.
const part = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
export function financialFilename(kind, services, period, reference, version, ext = 'pdf') {
    const names = [...new Set(services.map(part).filter(Boolean))].sort().join('+') || 'DichVu';
    const label = names.length > 100 ? names.slice(0, 87) + '-' + createHash('sha256').update(names).digest('hex').slice(0, 12) : names;
    return `${kind}_${label}_${part(period)}_${part(reference).slice(0, 45)}_v${version}.${ext}`;
}
export function invoiceServices(snapshot) {
    const names = Array.isArray(snapshot?.fileServices) ? snapshot.fileServices : Array.isArray(snapshot?.lines) ? snapshot.lines.map((l) => l?.serviceName) : [];
    return names.filter((v) => typeof v === 'string');
}
