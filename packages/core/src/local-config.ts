import { createHash } from 'node:crypto';
import path from 'node:path';

/** Directory (inside the app data directory) holding Local Configs. */
export const LOCAL_CONFIG_DIR = 'local-configs';

/** Stable hash of the normalized Repo path; used as the Repo id and the Local Config key. */
export function repoIdFor(repoPath: string): string {
  const normalized = path.resolve(repoPath).toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

/**
 * Where the Local Config of a Repo lives: `<appData>/local-configs/<repo id>.yml`, keyed by a hash
 * of the Repo path (spec), never inside the Repo folder.
 */
export function localConfigPath(appDataDir: string, repoPath: string): string {
  return path.join(appDataDir, LOCAL_CONFIG_DIR, `${repoIdFor(repoPath)}.yml`);
}
