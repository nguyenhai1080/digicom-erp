import {resolve} from 'node:path';
process.env.ERP_WEB_ROOT ||= resolve('public');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyStorage } from './storage-probe.mjs';

if (process.env.ERP_STORAGE_PROBE === 'true') await verifyStorage(process.env.STORAGE_ROOT);

if (process.env.ERP_SEED_ON_START === 'true') {
  const cli = createRequire(new URL('./database/package.json', import.meta.url)).resolve('tsx/cli');
  const seed = fileURLToPath(new URL('./database/prisma/seed.ts', import.meta.url));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, seed], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Seed failed (${code ?? signal})`)));
  });
}
await import(process.env.ERP_API_ENTRY || './dist/server.js');
