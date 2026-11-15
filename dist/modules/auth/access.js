import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../plugins/prisma.js';
export const SESSION_COOKIE = 'erp_session';
export const SESSION_SECONDS = 8 * 60 * 60;
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const csrfToken = (token, secret) => createHmac('sha256', secret).update('csrf:' + token).digest('hex');
export function sameSecret(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
export function loadAuthConfig() {
    const production = process.env.NODE_ENV === 'production';
    const secret = process.env.SESSION_SECRET ?? '';
    if (production && (secret.length < 32 || secret.includes('replace-with'))) {
        throw new Error('Production requires a strong SESSION_SECRET of at least 32 characters');
    }
    const origin = new URL(process.env.APP_URL ?? 'http://localhost:5173');
    if (production && origin.protocol !== 'https:')
        throw new Error('Production APP_URL must use HTTPS');
    return {
        secret: secret || 'local-development-csrf-secret-only', appOrigin: origin.origin,
        secureCookies: production, bootstrapEnabled: process.env.AUTH_BOOTSTRAP_ENABLED === 'true',
        bootstrapToken: process.env.AUTH_BOOTSTRAP_TOKEN ?? '',
        defaultCompanyCode: process.env.DEFAULT_COMPANY_CODE ?? 'DGC'
    };
}
export function requireOrigin(config, request, reply) {
    if (request.headers.origin !== config.appOrigin) {
        reply.code(403).send({ message: 'Nguồn yêu cầu không hợp lệ.' });
        return false;
    }
    return true;
}
export async function authenticate(request, reply) {
    const token = request.cookies[SESSION_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token))
        return reply.code(401).send({ message: 'Vui lòng đăng nhập.' });
    const session = await prisma.authSession.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { user: { include: { company: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } }
    });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE' || session.user.company.status !== 'ACTIVE') {
        return reply.code(401).send({ message: 'Phiên đăng nhập đã hết hiệu lực.' });
    }
    const user = session.user;
    const permissions = [...new Set(user.roles
            .filter(link => link.role.status === 'ACTIVE' && link.role.companyId === user.companyId)
            .flatMap(link => link.role.permissions.map(p => p.permission.code)))].sort();
    request.auth = { userId: user.id, companyId: user.companyId, companyCode: user.company.companyCode,
        fullName: user.fullName, email: user.email, permissions };
}
export function requirePermission(permission) {
    return async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent)
            return;
        const code = typeof permission === 'string' ? permission : permission(request.auth);
        if (!request.auth?.permissions.includes(code))
            return reply.code(403).send({ message: 'Bạn không có quyền thực hiện thao tác này.' });
    };
}
export function projectAccessWhere(identity) {
    return { companyId: identity.companyId, ...(identity.permissions.includes('PROJECT_VIEW_ALL') ? {} : { ownerUserId: identity.userId }) };
}
