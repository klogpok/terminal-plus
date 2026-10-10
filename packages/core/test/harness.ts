/**
 * Test harness for `core`: a temporary app data directory, temporary Repo folders,
 * short timings, and Node fixture scripts as Service commands.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { DevPanelCore, type CoreTimings, type DesktopShell } from '../src/index.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Short timings so tests run fast. */
export const TEST_TIMINGS: Partial<CoreTimings> = {
  gracefulStopMs: 1500,
};

/** A shell command that runs a fixture script (`.mjs` with the current Node binary, `.cmd` directly). */
export function fixtureCommand(fixture: string, ...args: (string | number)[]): string {
  const runner = fixture.endsWith('.cmd') ? [] : [`"${process.execPath}"`];
  const parts = [...runner, `"${path.join(FIXTURES, fixture)}"`, ...args.map(String)];
  return parts.join(' ');
}

/** Is a process with this PID alive? */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Removes ANSI escape sequences that ConPTY adds to output. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\][^\u0007]*\u0007|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g, '');
}

export interface RepoSpec {
  name: string;
  /** Repo Config object written as `.devpanel.yml`; omit to create a Repo without one. */
  config?: unknown;
  /** Raw `.devpanel.yml` text, overrides `config`. */
  configText?: string;
  /** Repo color stored in the Workspace file. */
  color?: string;
  /** Sub-directories to create inside the Repo folder. */
  dirs?: string[];
}

/**
 * Test double for the desktop shell: never opens a real dialog, Explorer or browser.
 * Set `nextPick` to the folder the "user" picks (`undefined` = cancelled).
 */
export class FakeShell implements DesktopShell {
  nextPick: string | undefined;
  picks = 0;
  readonly openedFolders: string[] = [];
  readonly openedUrls: string[] = [];

  async pickFolder(): Promise<string | undefined> {
    this.picks++;
    return this.nextPick;
  }

  async openFolder(folder: string): Promise<void> {
    this.openedFolders.push(folder);
  }

  async openUrl(url: string): Promise<void> {
    this.openedUrls.push(url);
  }
}

export class Harness {
  readonly root = mkdtempSync(path.join(tmpdir(), 'devpanel-test-'));
  readonly shell = new FakeShell();
  readonly appDataDir = path.join(this.root, 'appdata');
  private readonly repos: { path: string; name: string; color?: string }[] = [];
  private readonly cores: DevPanelCore[] = [];
  private readonly pids = new Set<number>();

  constructor() {
    mkdirSync(this.appDataDir, { recursive: true });
  }

  /** Creates a Repo folder and lists it in the Workspace file. Returns the Repo path. */
  addRepo(spec: RepoSpec): string {
    const repoPath = path.join(this.root, 'repos', spec.name);
    mkdirSync(repoPath, { recursive: true });
    for (const dir of spec.dirs ?? []) mkdirSync(path.join(repoPath, dir), { recursive: true });
    const text = spec.configText ?? (spec.config === undefined ? undefined : stringify(spec.config));
    if (text !== undefined) writeFileSync(path.join(repoPath, '.devpanel.yml'), text);
    this.repos.push({ path: repoPath, name: spec.name, ...(spec.color && { color: spec.color }) });
    writeFileSync(
      path.join(this.appDataDir, 'workspace.json'),
      JSON.stringify({ repos: this.repos }, null, 2),
    );
    return repoPath;
  }

  /** Creates a folder under the temp root without adding it to the Workspace. Returns its path. */
  makeFolder(relative: string): string {
    const folder = path.join(this.root, relative);
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  /** Constructs `core` over the temporary app data directory with short timings and the fake shell. */
  async createCore(timings: Partial<CoreTimings> = TEST_TIMINGS): Promise<DevPanelCore> {
    const core = new DevPanelCore({ appDataDir: this.appDataDir, timings, shell: this.shell });
    this.cores.push(core);
    core.on('log', (e) => {
      for (const m of stripAnsi(e.data).matchAll(/PID=(\d+)/g)) this.pids.add(Number(m[1]));
    });
    await core.load();
    return core;
  }

  /** Waits until a Service's accumulated output matches `pattern`; returns the match. */
  waitForOutput(
    core: DevPanelCore,
    repoId: string,
    serviceId: string,
    pattern: RegExp,
    timeoutMs = 10_000,
  ): Promise<RegExpMatchArray> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const onLog = (e: { repoId: string; serviceId: string; data: string }) => {
        if (e.repoId !== repoId || e.serviceId !== serviceId) return;
        buffer += stripAnsi(e.data);
        const match = buffer.match(pattern);
        if (match) {
          cleanup();
          resolve(match);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${pattern} in output:\n${buffer}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        core.off('log', onLog);
      };
      core.on('log', onLog);
    });
  }

  /** Shuts down every `core`, kills any fixture process still alive, removes temp files. */
  async dispose(): Promise<void> {
    for (const core of this.cores) await core.shutdown();
    for (const pid of this.pids) {
      if (isAlive(pid)) {
        try {
          process.kill(pid);
        } catch {
          /* already gone */
        }
      }
    }
    rmSync(this.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
