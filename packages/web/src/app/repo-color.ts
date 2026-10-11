import type { RepoView } from '@devpanel/shared';

/** Fallback colors for Repos without a stored color (ticket 08 assigns real ones). */
const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16'];

/** The Repo color used by its border in the left panel and by its terminal tabs. */
export function repoColor(repo: RepoView): string {
  if (repo.color) return repo.color;
  let hash = 0;
  for (const ch of repo.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
