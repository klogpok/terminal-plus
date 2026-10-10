import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Current git branch of a Repo, read from `.git/HEAD` (no `git` process: cheap enough to poll every
 * few seconds for every Repo, and works without git installed). Supports `.git` files of worktrees
 * and submodules (`gitdir: <path>`). Detached HEAD yields the short commit hash. Resolves with
 * `undefined` for a folder that is not a git repository.
 */
export async function readGitBranch(repoPath: string): Promise<string | undefined> {
  try {
    const dotGit = path.join(repoPath, '.git');
    let gitDir = dotGit;
    if ((await stat(dotGit)).isFile()) {
      const match = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, 'utf8'));
      if (!match) return undefined;
      gitDir = path.resolve(repoPath, match[1]!.trim());
    }
    const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    if (ref) return ref[1]!;
    if (/^[0-9a-f]{7,64}$/i.test(head)) return head.slice(0, 7);
    return undefined;
  } catch {
    return undefined;
  }
}
