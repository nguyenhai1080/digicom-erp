import type { FastifyInstance } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
export async function healthRoutes(app: FastifyInstance) {
  const checkHealth = async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'erp-core-api', release: '0.6.37', database: 'connected' };
  };
  app.get('/', checkHealth);
  app.get('/api/v1/health', checkHealth);
}
