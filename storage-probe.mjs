import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

export async function verifyStorage(directory) {
  if (!directory || !isAbsolute(directory)) throw new Error('Storage probe requires an absolute STORAGE_ROOT');
  await mkdir(directory, { recursive: true });
  const marker = join(directory, '.erp-persistence-probe.json');
  let created = false;
  try {
    await writeFile(marker, JSON.stringify({ id: randomUUID(), createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    created = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const result = JSON.parse(await readFile(marker, 'utf8'));
  if (!/^[0-9a-f-]{36}$/.test(result.id) || !Number.isFinite(Date.parse(result.createdAt))) {
    throw new Error('Storage probe marker is invalid');
  }
  console.log(`Storage probe: ${created ? 'created' : 'preserved'}; id=${result.id}; createdAt=${result.createdAt}`);
  return { ...result, created };
}
