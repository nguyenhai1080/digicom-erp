import { buildApp } from './app.js';
const app = await buildApp();
app.log.info({ release: '0.6.76' }, 'ERP Core API startup');
const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: '0.0.0.0', port });
