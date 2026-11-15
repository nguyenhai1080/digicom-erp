import { Prisma } from '@erp/db';
import { fields } from './recon-financial.js';
// Preserve every extracted row. This plan controls operational writes only.
export function planReconPostings(details, bindings, headerServiceId) {
    const errors = [], references = [], omit = new Set();
    const same = (a, b) => { try {
        return typeof a === 'string' && typeof b === 'string' && new Prisma.Decimal(a).eq(b);
    }
    catch {
        return false;
    } };
    if (new Set(details.map(d => d.lineNo)).size !== details.length)
        errors.push('PDF có số dòng trùng; cần đọc lại trước khi chốt.');
    const groups = new Map();
    for (const b of bindings)
        groups.set(b.serviceId, [...(groups.get(b.serviceId) ?? []), b]);
    for (const [serviceId, group] of groups) {
        if (group.length === 1)
            continue;
        const rows = group.map(b => details.find(d => d.lineNo === b.lineNo)), child = rows.find(d => d?.rowType === 'CHILD'), total = rows.find(d => d?.rowType === 'TOTAL');
        const identical = group.length === 2 && serviceId === headerServiceId && !!child && !!total && group.every(b => b.contractId === group[0].contractId && b.contractServiceId === group[0].contractServiceId) && fields.every(k => same(child[k], total[k]) && same(child.usd?.[k], total.usd?.[k])) && same(child.costDeduction, total.costDeduction);
        if (!identical) {
            errors.push('Nhiều dòng PDF đang trỏ tới cùng một dịch vụ nhưng không phải cặp chi tiết/tổng đồng nhất. Cần kiểm tra ánh xạ và số liệu trước khi chốt.');
            continue;
        }
        omit.add(child.lineNo);
        references.push({ lineNo: child.lineNo, totalLineNo: total.lineNo, serviceId });
    }
    return { postings: bindings.filter(b => !omit.has(b.lineNo)), references, errors };
}
