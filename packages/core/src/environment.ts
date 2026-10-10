import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** The lock file that marks a pnpm Repo. Repos without it skip every pnpm check. */
export const PNPM_LOCK_FILE = 'pnpm-lock.yaml';

/**
 * The machine's tool environment as seen by `core`. Injectable so tests do not depend on whether
 * pnpm is installed and do not run a real `pnpm install`.
 */
export interface Environment {
  /** Is `pnpm` callable (`where pnpm` succeeds)? Asked on every start in a pnpm Repo. */
  isPnpmAvailable(): Promise<boolean>;
  /** The shell command `installDependencies` runs in the Repo folder. */
  installCommand: string;
  /** Is Claude Code callable (`where claude` succeeds)? Asked on every `openClaude`. */
  isClaudeAvailable(): Promise<boolean>;
  /** The command a Claude Code Session runs (through `cmd.exe`) in the Repo folder. */
  claudeCommand: string;
  /** The command a shell Session runs (through `cmd.exe`) in the Repo folder. */
  shellCommand: string;
}

/** `where <tool>` exits 0 when the tool (or a shim of it) is on PATH. Never rejects. */
function where(tool: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('where', [tool], { windowsHide: true }, (error) => resolve(!error));
  });
}

export const DEFAULT_ENVIRONMENT: Environment = {
  isPnpmAvailable: () => where('pnpm'),
  installCommand: 'pnpm install',
  isClaudeAvailable: () => where('claude'),
  claudeCommand: 'claude',
  shellCommand: 'cmd.exe',
};

export function isPnpmRepo(repoPath: string): boolean {
  return existsSync(path.join(repoPath, PNPM_LOCK_FILE));
}

/** A pnpm Repo needs an install while it has no `node_modules` folder. */
export function needsInstall(repoPath: string): boolean {
  return isPnpmRepo(repoPath) && !existsSync(path.join(repoPath, 'node_modules'));
}
