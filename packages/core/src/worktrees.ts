/**
 * Worktrees: the git worktrees of a Repo's folder, found with `git worktree list --porcelain`.
 * DevPanel only reads them; creating and removing them stays with git.
 */
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { WorktreeView } from '@devpanel/shared';

const run = promisify(execFile);

/** How long `git worktree list` may take before the Repo is treated as having no Worktrees. */
const GIT_TIMEOUT_MS = 10_000;

/** One entry of `git worktree list --porcelain`; `branch` absent when detached or bare. */
export interface WorktreeEntry {
  path: string;
  branch?: string;
}

/** Parses `git worktree list --porcelain`: blocks separated by blank lines, `worktree` first. */
export function parseWorktreeList(text: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let entry: WorktreeEntry | undefined;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) entry = { path: path.resolve(line.slice('worktree '.length)) };
      const branch = /^branch refs\/heads\/(.+)$/.exec(line);
      if (entry && branch) entry.branch = branch[1]!;
    }
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Windows paths compare ignoring case. */
export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

async function isFolder(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

/** A folder's own branch and its Worktrees, as `readWorktrees` finds them. */
export interface FolderWorktrees {
  /** The branch of the folder itself (absent: detached, or not a git folder). */
  branch?: string;
  worktrees: WorktreeView[];
}

/**
 * The branch of the folder `repoPath` and its Worktrees that are on a branch and whose folder
 * exists, except `repoPath` itself and the `excluded` folders (other Repos of the Workspace).
 * Without git, or outside a git repository: no branch and no Worktrees.
 */
export async function readWorktrees(repoPath: string, excluded: string[] = []): Promise<FolderWorktrees> {
  let stdout: string;
  try {
    ({ stdout } = await run('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
    }));
  } catch {
    return { worktrees: [] };
  }
  const entries = parseWorktreeList(stdout);
  const branch = entries.find((e) => samePath(e.path, repoPath))?.branch;
  const candidates = entries.filter(
    (e): e is WorktreeView =>
      e.branch !== undefined && !samePath(e.path, repoPath) && !excluded.some((other) => samePath(e.path, other)),
  );
  const present = await Promise.all(candidates.map((e) => isFolder(e.path)));
  return { ...(branch !== undefined && { branch }), worktrees: candidates.filter((_, i) => present[i]) };
}
