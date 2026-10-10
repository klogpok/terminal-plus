import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import { localConfigPath, windowsShell } from '../src/index.js';
import { Harness, fixtureCommand, isAlive } from './harness.js';

async function waitUntil(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DevPanelError) return err.code;
    throw err;
  }
  throw new Error('Expected a DevPanelError');
}

describe('addRepo', () => {
  it('adds the picked folder with its folder name and a color, and persists it in the Workspace', async () => {
    const folder = h.makeFolder('code/Billing');
    const core = await h.createCore();
    h.shell.nextPick = folder;

    const repo = await core.addRepo({});

    expect(h.shell.picks).toBe(1);
    expect(repo).toMatchObject({ name: 'Billing', path: folder });
    expect(repo!.color).toMatch(/^#[0-9a-f]{6}$/i);

    const reloaded = await h.createCore();
    expect(reloaded.listRepos()).toEqual([expect.objectContaining({ name: 'Billing', path: folder, color: repo!.color })]);
  });

  it('resolves with null and adds nothing when the user cancels the picker', async () => {
    const core = await h.createCore();
    h.shell.nextPick = undefined;

    expect(await core.addRepo({})).toBeNull();
    expect(core.listRepos()).toEqual([]);
  });

  it('gives each new Repo a different color', async () => {
    const core = await h.createCore();
    const a = await core.addRepo({ path: h.makeFolder('a') });
    const b = await core.addRepo({ path: h.makeFolder('b') });
    const c = await core.addRepo({ path: h.makeFolder('c') });

    expect(new Set([a!.color, b!.color, c!.color]).size).toBe(3);
  });

  it('refuses a folder already in the Workspace, even spelled differently', async () => {
    const folder = h.makeFolder('code/Billing');
    const core = await h.createCore();
    await core.addRepo({ path: folder });

    expect(await codeOf(core.addRepo({ path: `${folder.toUpperCase()}\\`, name: 'Other' }))).toBe('repoAlreadyAdded');
    expect(core.listRepos()).toHaveLength(1);
  });

  it('refuses a taken name (case-insensitively) and accepts the folder under another name', async () => {
    const core = await h.createCore();
    await core.addRepo({ path: h.makeFolder('one/api') });
    const second = h.makeFolder('two/API');

    const error = await core.addRepo({ path: second }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DevPanelError);
    expect(error).toMatchObject({ code: 'repoNameTaken', params: { name: 'API', path: second } });

    const added = await core.addRepo({ path: second, name: 'API 2' });
    expect(added).toMatchObject({ name: 'API 2', path: second });
  });

  it('refuses a path that is not an existing folder', async () => {
    const core = await h.createCore();
    expect(await codeOf(core.addRepo({ path: `${h.root}\\nope` }))).toBe('folderNotFound');
  });

  it('announces the new Repo with repoChanged', async () => {
    const core = await h.createCore();
    const events: unknown[] = [];
    core.on('repoChanged', (e) => events.push(e));

    const repo = await core.addRepo({ path: h.makeFolder('billing') });

    expect(events).toEqual([{ repoId: repo!.id, repo }]);
  });
});

describe('removeRepo', () => {
  it('stops every running Service, removes the Repo and its Local Config, and leaves the folder alone', async () => {
    const repoPath = h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', command: fixtureCommand('spawn-grandchild.mjs') },
          { id: 'web', command: fixtureCommand('spawn-grandchild.mjs') },
          { id: 'idle', command: fixtureCommand('spawn-grandchild.mjs') },
        ],
      },
    });
    h.addRepo({ name: 'docs' });
    writeFileSync(path.join(repoPath, 'keep.txt'), 'mine');
    const localConfig = localConfigPath(h.appDataDir, repoPath);
    mkdirSync(path.dirname(localConfig), { recursive: true });
    writeFileSync(localConfig, 'services: []\n');
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const pids: number[] = [];
    for (const id of ['api', 'web']) {
      const output = h.waitForOutput(core, repo.id, id, /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
      await core.startService(repo.id, id);
      const [, child, grandchild] = (await output).map(Number);
      pids.push(child!, grandchild!);
    }
    const events: unknown[] = [];
    core.on('repoChanged', (e) => events.push(e));

    await core.removeRepo(repo.id);

    await waitUntil(() => pids.every((pid) => !isAlive(pid)));
    expect(core.listRepos().map((r) => r.name)).toEqual(['docs']);
    expect(events).toEqual([{ repoId: repo.id, repo: null }]);
    expect(existsSync(localConfig)).toBe(false);
    expect(readdirSync(repoPath).sort()).toEqual(['.devpanel.yml', 'keep.txt']);
    const reloaded = await h.createCore();
    expect(reloaded.listRepos().map((r) => r.name)).toEqual(['docs']);
  });

  it('also stops a running dependency install of the Repo', async () => {
    const repoPath = h.addRepo({ name: 'shop' });
    writeFileSync(path.join(repoPath, 'pnpm-lock.yaml'), '');
    const core = await h.createCore(undefined, {
      environment: { installCommand: fixtureCommand('spawn-grandchild.mjs'), isPnpmAvailable: async () => true },
    });
    const repo = core.listRepos()[0]!;
    let output = '';
    core.on('installOutput', (e) => (output += e.data));
    const install = core.installDependencies(repo.id);
    await waitUntil(() => /GRANDCHILD_PID=(\d+)/.test(output));
    const [, child, grandchild] = output.match(/CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/)!.map(Number);

    await core.removeRepo(repo.id);
    await install;

    await waitUntil(() => !isAlive(child!) && !isAlive(grandchild!));
    expect(core.listRepos()).toEqual([]);
  });

  it('rejects an unknown Repo', async () => {
    const core = await h.createCore();
    expect(await codeOf(core.removeRepo('nope'))).toBe('repoNotFound');
  });
});

const FAST_REFRESH = { gracefulStopMs: 1500, branchRefreshMs: 100 };

describe('missing Repo folder', () => {
  it('keeps the Repo listed as missing and refuses to start its Services', async () => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'echo hi' }] } });
    const core = await h.createCore();
    rmSync(repoPath, { recursive: true, force: true });
    const reloaded = await h.createCore();
    const repo = reloaded.listRepos()[0]!;

    expect(repo).toMatchObject({ name: 'billing', folderMissing: true });
    expect(await codeOf(core.startService(repo.id, 'api'))).toBe('repoFolderMissing');
  });

  it('reports a folder that disappears and comes back via repoChanged', async () => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'echo hi' }] } });
    const core = await h.createCore(FAST_REFRESH);
    const repo = core.listRepos()[0]!;
    expect(repo.folderMissing).toBeUndefined();
    const events: { repoId: string; repo: { folderMissing?: boolean } | null }[] = [];
    core.on('repoChanged', (e) => events.push(e));

    rmSync(repoPath, { recursive: true, force: true });
    await waitUntil(() => events.some((e) => e.repo?.folderMissing === true));
    expect(events.at(-1)).toMatchObject({ repoId: repo.id, repo: { id: repo.id, name: 'billing', folderMissing: true } });
    expect(await codeOf(core.startService(repo.id, 'api'))).toBe('repoFolderMissing');

    mkdirSync(repoPath);
    await waitUntil(() => events.at(-1)?.repo?.folderMissing === undefined);
    expect(core.listRepos()[0]!.folderMissing).toBeUndefined();
  });
});

describe('relocateRepo', () => {
  it('points the Repo at the picked folder, keeping name and color, and moves its Local Config', async () => {
    const oldPath = h.addRepo({ name: 'billing', color: '#123456' });
    const oldLocal = localConfigPath(h.appDataDir, oldPath);
    mkdirSync(path.dirname(oldLocal), { recursive: true });
    writeFileSync(oldLocal, 'services: []\n');
    const core = await h.createCore();
    const before = core.listRepos()[0]!;
    rmSync(oldPath, { recursive: true, force: true });
    const newPath = h.makeFolder('moved/billing-2');
    writeFileSync(path.join(newPath, '.devpanel.yml'), 'services:\n  - id: api\n    command: echo hi\n');
    const events: unknown[] = [];
    core.on('repoChanged', (e) => events.push(e));
    h.shell.nextPick = newPath;

    const after = await core.relocateRepo(before.id, undefined);

    expect(after).toMatchObject({ name: 'billing', color: before.color, path: newPath });
    expect(after!.folderMissing).toBeUndefined();
    expect(after!.services.map((s) => s.id)).toEqual(['api']);
    expect(events).toEqual([{ repoId: before.id, repo: after }]);
    expect(existsSync(oldLocal)).toBe(false);
    expect(existsSync(localConfigPath(h.appDataDir, newPath))).toBe(true);
    const reloaded = await h.createCore();
    expect(reloaded.listRepos()).toEqual([expect.objectContaining({ name: 'billing', path: newPath, color: before.color })]);
  });

  it('does nothing when the picker is cancelled', async () => {
    h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    h.shell.nextPick = undefined;

    expect(await core.relocateRepo(repo.id, undefined)).toBeNull();
    expect(core.listRepos()).toEqual([repo]);
  });

  it('refuses a folder that is another Repo of the Workspace', async () => {
    h.addRepo({ name: 'billing' });
    const docsPath = h.addRepo({ name: 'docs' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    expect(await codeOf(core.relocateRepo(repo.id, docsPath))).toBe('repoAlreadyAdded');
  });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

describe('git branch', () => {
  it('shows the current branch and picks up a checkout at the refresh interval', async () => {
    const repoPath = h.addRepo({ name: 'billing' });
    git(repoPath, 'init', '-q', '-b', 'main');
    h.addRepo({ name: 'plain' });
    const core = await h.createCore(FAST_REFRESH);
    const [billing, plain] = core.listRepos();
    expect(billing!.branch).toBe('main');
    expect(plain!.branch).toBeUndefined();
    const events: { repoId: string; repo: { branch?: string } | null }[] = [];
    core.on('repoChanged', (e) => events.push(e));

    git(repoPath, 'checkout', '-q', '-b', 'feature/login');

    await waitUntil(() => events.some((e) => e.repo?.branch === 'feature/login'));
    expect(events.every((e) => e.repoId === billing!.id)).toBe(true);
    expect(core.listRepos()[0]!.branch).toBe('feature/login');
  });

  it('reads the branch of a git worktree folder (.git is a file)', async () => {
    const main = h.makeFolder('main-checkout');
    git(main, 'init', '-q', '-b', 'main');
    git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    const worktree = path.join(h.root, 'wt');
    git(main, 'worktree', 'add', '-q', '-b', 'side', worktree);
    const core = await h.createCore();

    const repo = await core.addRepo({ path: worktree });

    expect(repo!.branch).toBe('side');
  });
});

describe('openFolder and openUrl', () => {
  it('open the Repo folder and the Service url through the backend shell', async () => {
    const repoPath = h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'web', command: 'echo hi', url: 'http://localhost:3000/app?a=1&b=2' },
          { id: 'job', command: 'echo hi' },
        ],
      },
    });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    await core.openFolder(repo.id);
    await core.openUrl(repo.id, 'web');

    expect(h.shell.openedFolders).toEqual([repoPath]);
    expect(h.shell.openedUrls).toEqual(['http://localhost:3000/app?a=1&b=2']);
    expect(await codeOf(core.openUrl(repo.id, 'job'))).toBe('serviceHasNoUrl');
  });

  it('the Windows shell refuses to open anything but http(s) URLs', async () => {
    await expect(windowsShell.openUrl('file:///C:/Windows/System32/calc.exe')).rejects.toThrow(/non-http/);
  });

  it('refuse to open a missing folder', async () => {
    const repoPath = h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    rmSync(repoPath, { recursive: true, force: true });

    expect(await codeOf(core.openFolder(core.listRepos()[0]!.id))).toBe('repoFolderMissing');
    expect(h.shell.openedFolders).toEqual([]);
  });
});
