import { revenueAmounts, nativeAmount } from './revenue-money.js';
// Owner override: bill and print parent TOTAL only, never expand CHILD on Invoice.
export function invoiceParentLines(rows, period) {
    return rows.filter(v => { const j = v.calculationJson; return j?.rowType === 'TOTAL' && j?.includeInMonthlyTotal === true; }).map(v => {
        const j = v.calculationJson, a = revenueAmounts(v), amount = (s) => nativeAmount(s, a.currency);
        return { revenueId: v.id, serviceId: v.serviceId, serviceName: v.service.serviceName, groupServiceId: v.serviceId, contractId: v.contractId, description: v.service.serviceName + ' · ' + period, revenue: amount(a.revenue), wht: amount(a.wht), payable: amount(a.payable), uploadId: j.uploadId, lineNo: j.lineNo };
    });
}
