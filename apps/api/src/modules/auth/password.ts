import { z } from 'zod';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const newPasswordSchema = z.string().min(8).max(128);

const params = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let active = 0;
export class PasswordBusyError extends Error {}
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Bound concurrent memory-intensive work in the 512 MB staging container.
  if (active >= 2) throw new PasswordBusyError('Password service busy');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      scrypt(password, salt, 64, params, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { active--; }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored?: string) {
  const valid = stored?.match(/^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  // Unknown accounts do the same expensive operation as existing accounts.
  const actual = await derive(password, Buffer.from(valid?.[1] ?? '0'.repeat(32), 'hex'));
  const expected = Buffer.from(valid?.[2] ?? '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
