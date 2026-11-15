import { z } from 'zod';
import { csrfToken, projectAccessWhere, requireOrigin, requirePermission, sameSecret, SESSION_COOKIE } from '../auth/access.js';
export class CommandError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
export const text = z.string().trim().min(1).max(500);
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const money = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,4})?$/);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(v + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});
export const timestamp = z.string().datetime();
export function parse(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new CommandError(400, 'Thông tin chưa hợp lệ. Kiểm tra số tiền, ngày và các trường bắt buộc.');
    return result.data;
}
export function writeGuard(permission, config) {
    return async (request, reply) => {
        await requirePermission(permission)(request, reply);
        if (reply.sent || !requireOrigin(config, request, reply))
            return;
        const supplied = request.headers['x-csrf-token'];
        if (typeof supplied !== 'string' || !sameSecret(supplied, csrfToken(request.cookies[SESSION_COOKIE], config.secret))) {
            return reply.code(403).send({ message: 'Phiên thao tác không hợp lệ. Vui lòng tải lại trang.' });
        }
    };
}
export async function project(tx, user, id, lock = false) {
    if (lock)
        await tx.$queryRaw `SELECT id FROM projects WHERE id=${id}::uuid AND company_id=${user.companyId}::uuid FOR UPDATE`;
    const found = await tx.project.findFirst({ where: { id, ...projectAccessWhere(user) } });
    if (!found)
        throw new CommandError(404, 'Không tìm thấy dự án trong phạm vi của bạn.');
    if (lock && ['CLOSED', 'ARCHIVED', 'LOST', 'NO_BID', 'CANCELLED', 'TERMINATED'].includes(found.status))
        throw new CommandError(409, 'Dự án đã kết thúc; không thể ghi thêm dữ liệu.');
    return found;
}
export async function code(tx, companyId, sequenceName, prefix) {
    const s = await tx.sequence.upsert({ where: { companyId_sequenceName: { companyId, sequenceName } },
        create: { companyId, sequenceName, prefix, padding: 4, currentValue: 1 }, update: { currentValue: { increment: 1 } } });
    return s.prefix + '-' + s.currentValue.toString().padStart(s.padding, '0');
}
export async function audit(tx, user, action, entityType, entityId, oldValue, newValue, reason) {
    return tx.auditLog.create({ data: { companyId: user.companyId, userId: user.userId, action, entityType, entityId,
            ...(oldValue == null ? {} : { oldValue: JSON.parse(JSON.stringify(oldValue)) }),
            ...(newValue == null ? {} : { newValue: JSON.parse(JSON.stringify(newValue)) }), reason } });
}
export function unchanged(old, expected) {
    if (old.updatedAt.toISOString() !== expected)
        throw new CommandError(409, 'Dữ liệu đã thay đổi. Tải lại trước khi thao tác.');
}
