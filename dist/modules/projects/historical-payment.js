import { Prisma } from '@erp/db';
import { z } from 'zod';
import { CommandError, date, timestamp } from './commands.js';
export const paymentFileSchema = z.object({ filename: z.string().trim().min(1).max(200), base64: z.string().max(7 * 1024 * 1024) }).strict();
const amount = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/);
export const historicalPaymentSchema = z.object({
    mode: z.literal('HISTORICAL'), requestId: z.uuid(), expectedUpdatedAt: timestamp, paymentDate: date,
    allocationAmount: amount, cashCurrency: z.enum(['USD', 'VND']), cashAmount: amount,
    conversionRate: z.string().regex(/^[1-9]\d{0,11}(\.\d{1,4})?$/).optional(),
    sourceReference: z.string().trim().min(10).max(1000), dateBasis: z.enum(['SOURCE', 'PERIOD_END_PLUS_60']),
    bankAccount: z.string().trim().max(200).default(''), note: z.string().trim().max(2000).default(''), confirmed: z.literal(true),
}).strict();
export const ledgerOnlyPaymentSchema = historicalPaymentSchema.omit({ mode: true, sourceReference: true, dateBasis: true }).extend({ mode: z.literal('LEDGER_ONLY'), swiftFile: paymentFileSchema.optional(), bankFeeUsd: amount.optional(), sourceReference: z.string().trim().max(1000).default('Ghi nhận thu tiền vào sổ công nợ'), dateBasis: z.literal('SOURCE').default('SOURCE') }).strict();
const D = (v) => new Prisma.Decimal(v);
export function historicalPaymentDate(period, paymentDate, basis) {
    if (basis === 'PERIOD_END_PLUS_60') {
        const [year, month] = period.split('-').map(Number), expected = new Date(Date.UTC(year, month, 0) + 60 * 86400000).toISOString().slice(0, 10);
        if (paymentDate !== expected)
            throw new CommandError(409, 'Ngày thanh toán lịch sử phải là ngày cuối kỳ doanh thu cộng 60 ngày: ' + expected + '.');
    }
}
export function historicalPaymentAmounts(total, paid, next, currency, cash, cashCurrency, rate) {
    const original = D(total), old = D(paid), allocation = D(next), receipt = D(cash);
    if (!['USD', 'VND'].includes(currency) || !['USD', 'VND'].includes(cashCurrency) || !original.gt(0) || old.lt(0) || old.gt(original) || !allocation.gt(0) || allocation.gt(original.minus(old)) || !receipt.gt(0))
        throw new CommandError(409, 'Số thanh toán lịch sử vượt số còn phải thu hoặc không hợp lệ.');
    if (currency === 'VND' && !allocation.isInteger() || cashCurrency === 'VND' && !receipt.isInteger())
        throw new CommandError(400, 'Số VND phải là số nguyên.');
    const fx = rate ? D(rate) : null;
    if (currency === cashCurrency) {
        if (!allocation.eq(receipt))
            throw new CommandError(409, 'Tiền đã nhận và số giảm công nợ cùng tiền tệ phải khớp.');
    }
    else {
        if (!fx?.gt(0))
            throw new CommandError(400, 'Cần tỷ giá quy đổi để phân bổ thanh toán khác tiền tệ.');
        const converted = currency === 'VND' ? receipt.mul(fx).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : receipt.div(fx).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        if (!converted.eq(allocation))
            throw new CommandError(409, 'Số phân bổ không khớp tiền gốc và tỷ giá quy đổi lịch sử.');
    }
    const paidAfter = old.plus(allocation), outstanding = original.minus(paidAfter);
    return { paidAfter, outstanding, status: outstanding.isZero() ? 'PAID' : 'PARTIALLY_PAID', rate: fx };
}
// New DGC ledger-only USD receipts: gross settles AR; fees reduce cash only.
// Keep legacy/historical no-fee conversion semantics and saved records unchanged.
export function ledgerOnlyPaymentAmounts(total, paid, next, currency, cash, cashCurrency, rate, bankFeeUsd) {
    const fee = D(bankFeeUsd ?? '0');
    if (!fee.isFinite() || fee.lt(0) || fee.decimalPlaces() > 2)
        throw new CommandError(400, 'Phí ngân hàng USD không hợp lệ.');
    if (fee.isZero())
        return { ...historicalPaymentAmounts(total, paid, next, currency, cash, cashCurrency, rate), bankFee: undefined };
    const gross = D(next), net = gross.minus(fee);
    if (currency !== 'USD' || !net.gt(0))
        throw new CommandError(409, 'Phí USD chỉ áp dụng cho Invoice USD và phải nhỏ hơn số tiền đối tác thanh toán.');
    if (!['USD', 'VND'].includes(cashCurrency))
        throw new CommandError(400, 'Tiền tệ thực nhận không hợp lệ.');
    const fx = rate ? D(rate) : null;
    if (cashCurrency === 'VND' && !fx?.gt(0))
        throw new CommandError(400, 'Cần tỷ giá VND / USD để quy đổi tiền sau phí.');
    const expected = cashCurrency === 'USD' ? net : net.mul(fx).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    if (!expected.gt(0) || !D(cash).eq(expected))
        throw new CommandError(409, 'Tiền thực nhận không khớp sau phí ngân hàng. Cần ' + expected.toFixed(cashCurrency === 'USD' ? 2 : 0) + ' ' + cashCurrency + '.');
    const result = historicalPaymentAmounts(total, paid, next, currency, next, currency);
    return { ...result, rate: cashCurrency === 'VND' ? fx : null, bankFee: { currency: 'USD', amount: fee.toFixed(2), grossUsd: gross.toFixed(2), netUsd: net.toFixed(2), netCashAmount: expected.toFixed(cashCurrency === 'USD' ? 2 : 0), cashCurrency, formula: 'NET_AFTER_BANK_FEE_V1' } };
}
