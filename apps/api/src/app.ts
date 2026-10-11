import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/auth/users.routes.js';
import { loadAuthConfig, type AuthConfig } from './modules/auth/access.js';
import { PasswordBusyError } from './modules/auth/password.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { serviceRoutes } from './modules/services/service.routes.js';
import { companyAssetRoutes } from './modules/company-assets/company-assets.js';
export async function buildApp(options: { auth?: AuthConfig; logger?: boolean } = {}) {
  const auth = options.auth ?? loadAuthConfig();
  const app = Fastify({ bodyLimit: 32768, logger: options.logger === false ? false : {
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'req.body.password', 'req.body.setupToken']
  } });
  app.decorateRequest('auth', null);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof PasswordBusyError) return reply.code(429).send({ message: 'Vui lòng thử lại sau vài giây.' });
    const candidate = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
    if (status === 500) request.log.error({ err: error }, 'Request failed');
    reply.code(status).send({ message: status === 429 ? 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.' : status === 500 ? 'Có lỗi khi xử lý yêu cầu.' : 'Yêu cầu không hợp lệ.' });
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(healthRoutes);
  await app.register(authRoutes, auth);
  await app.register(userRoutes, auth);
  await app.register(projectRoutes, auth);
  await app.register(serviceRoutes, auth);
  await app.register(companyAssetRoutes, auth);
  return app;
}
