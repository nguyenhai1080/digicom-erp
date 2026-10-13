import { randomBytes } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../plugins/prisma.js';
import { hashPassword, verifyPassword, newPasswordSchema } from './password.js';
import { authenticate, csrfToken, requireOrigin, sameSecret, SESSION_COOKIE, SESSION_SECONDS, tokenHash, type AuthConfig } from './access.js';

const loginSchema = z.object({
  companyCode: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();
const setupSchema = loginSchema.extend({
  password: newPasswordSchema, fullName: z.string().trim().min(1).max(120),
  setupToken: z.string().min(32).max(512)
}).strict();
class BootstrapClosedError extends Error {}

export async function authRoutes(app: FastifyInstance, config: AuthConfig) {
  await app.register(rateLimit, { global: false, hook: 'preHandler', keyGenerator: request => {
    const body = request.body as { companyCode?: unknown; email?: unknown } | null;
    const account = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    const company = typeof body?.companyCode === 'string' ? body.companyCode.slice(0, 50) : '';
    return tokenHash(`${request.ip}:${company}:${account}`);
  } });
  const limits = { rateLimit: { max: 10, timeWindow: '5 minutes' } };
  const cookieOptions = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const, maxAge: SESSION_SECONDS };
  app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); return payload; });

  app.post('/api/v1/auth/login', { config: limits }, async (request, reply) => {
    if (!requireOrigin(config, request, reply)) return;
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Vui lòng kiểm tra công ty, email và mật khẩu.' });
    const { companyCode, email, password } = parsed.data;
    const user = await prisma.user.findFirst({ where: { email, company: { companyCode } }, include: { company: true } });
    const verified = await verifyPassword(password, user?.passwordHash);
    if (!verified || !user || user.status !== 'ACTIVE' || user.company.status !== 'ACTIVE') {
      return reply.code(401).send({ message: 'Thông tin đăng nhập không hợp lệ.' });
    }
    const token = randomBytes(32).toString('hex');
    const previous = request.cookies[SESSION_COOKIE];
    await prisma.$transaction(async tx => {
      if (previous && /^[a-f0-9]{64}$/.test(previous)) await tx.authSession.deleteMany({ where: { tokenHash: tokenHash(previous) } });
      await tx.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
      await tx.authSession.create({ data: { tokenHash: tokenHash(token), companyId: user.companyId, userId: user.id, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: user.id } });
    });
    reply.setCookie(SESSION_COOKIE, token, cookieOptions);
    return { ok: true };
  });

  app.get('/api/v1/auth/me', { preHandler: authenticate }, async request => ({
    user: request.auth, csrfToken: csrfToken(request.cookies[SESSION_COOKIE]!, config.secret)
  }));

  app.post('/api/v1/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    if (!requireOrigin(config, request, reply)) return;
    const token = request.cookies[SESSION_COOKIE]!;
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || !sameSecret(supplied, csrfToken(token, config.secret))) {
      return reply.code(403).send({ message: 'Mã xác nhận phiên không hợp lệ.' });
    }
    await prisma.$transaction(async tx => {
      await tx.authSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
      await tx.auditLog.create({ data: { companyId: request.auth!.companyId, userId: request.auth!.userId, action: 'AUTH_LOGOUT', entityType: 'User', entityId: request.auth!.userId } });
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/', secure: config.secureCookies, httpOnly: true, sameSite: 'lax' });
    return { ok: true };
  });

  // No public signup: disabled by default and closed forever once a tenant has users.
  app.post('/api/v1/auth/bootstrap', { config: limits }, async (request, reply) => {
    if (!config.bootstrapEnabled || config.bootstrapToken.length < 32) return reply.code(404).send({ message: 'Thiết lập quản trị chưa được bật.' });
    if (!requireOrigin(config, request, reply)) return;
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Kiểm tra thông tin; mật khẩu cần từ 8 đến 128 ký tự.' });
    const { companyCode, email, password, fullName, setupToken } = parsed.data;
    if (companyCode !== config.defaultCompanyCode || !sameSecret(setupToken, config.bootstrapToken)) {
      return reply.code(403).send({ message: 'Thiết lập quản trị không được phép.' });
    }
    const passwordHash = await hashPassword(password);
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bootstrap:${companyCode}`}, 0))`;
        const company = await tx.company.findUnique({ where: { companyCode } });
        if (!company || company.status !== 'ACTIVE' || await tx.user.count({ where: { companyId: company.id } })) throw new BootstrapClosedError();
        const role = await tx.role.findUnique({ where: { companyId_code: { companyId: company.id, code: 'ADMIN' } } });
        if (!role || role.status !== 'ACTIVE') throw new BootstrapClosedError();
        const user = await tx.user.create({ data: { companyId: company.id, email, fullName, passwordHash } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await tx.auditLog.create({ data: { companyId: company.id, userId: user.id, action: 'AUTH_BOOTSTRAP_ADMIN', entityType: 'User', entityId: user.id } });
      });
    } catch (error) {
      if (error instanceof BootstrapClosedError) return reply.code(409).send({ message: 'Thiết lập đã hoàn tất hoặc công ty chưa sẵn sàng.' });
      throw error;
    }
    return reply.code(201).send({ ok: true });
  });
}
