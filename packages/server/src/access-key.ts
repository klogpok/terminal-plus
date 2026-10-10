import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** File in the app data directory that holds the current Access Key (read by the launcher). */
export const ACCESS_KEY_FILE = 'access-key';

/** Generates a fresh Access Key and stores it in the app data directory. */
export async function createAccessKey(appDataDir: string): Promise<string> {
  const key = randomBytes(32).toString('base64url');
  await mkdir(appDataDir, { recursive: true });
  await writeFile(path.join(appDataDir, ACCESS_KEY_FILE), key, 'utf8');
  return key;
}

/** Constant-time comparison of a presented key with the expected one. */
export function isAccessKeyValid(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
