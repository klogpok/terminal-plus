import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** File in the app data directory that holds the current Access Key (read by the launcher). */
export const ACCESS_KEY_FILE = 'access-key';

/** Generates a fresh Access Key. */
export function generateAccessKey(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Stores the Access Key in the app data directory. Called only once the Server holds its port, so
 * a second Server that fails to start never overwrites the running one's key.
 */
export async function storeAccessKey(appDataDir: string, key: string): Promise<void> {
  await mkdir(appDataDir, { recursive: true });
  await writeFile(path.join(appDataDir, ACCESS_KEY_FILE), key, 'utf8');
}

/** The Access Key stored by the running Server, or `undefined` when there is none. */
export async function readStoredAccessKey(appDataDir: string): Promise<string | undefined> {
  try {
    const key = (await readFile(path.join(appDataDir, ACCESS_KEY_FILE), 'utf8')).trim();
    return key === '' ? undefined : key;
  } catch {
    return undefined;
  }
}

/** Constant-time comparison of a presented key with the expected one. */
export function isAccessKeyValid(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
