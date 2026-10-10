import { createHash } from 'node:crypto';
import path from 'node:path';

/** Repo id: stable hash of the normalized Repo path (a Repo is identified by its path). */
export function repoIdFor(repoPath: string): string {
  const normalized = path.resolve(repoPath).toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}
