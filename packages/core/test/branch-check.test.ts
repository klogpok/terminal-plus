/**
 * Worktrees and Branch Check through the `core` interface, with real git repositories and
 * worktrees in the temp folder.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { DevPanelError, type BranchCheckChangedEvent, type ServiceConfig } from '@devpanel/shared';
import type { DevPanelCore } from '../src/index.js';
import { Harness, fixtureCommand, stripAnsi, waitForStatus } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'ignore' });
}

/** Makes `repoPath` a git repository on `main` with one commit of what is in it now. */
function gitInit(repoPath: string): void {
  git(repoPath, 'init', '-q', '-b', 'main');
  git(repoPath, 'add', '-A');
  git(repoPath, 'commit', '-q', '--allow-empty', '-m', 'init');
}

/** Adds a Worktree of `repoPath` at `<temp>/wt/<name>` on a new `branch` (detached without one). */
function addWorktree(repoPath: string, name: string, branch?: string): string {
  const folder = path.join(h.root, 'wt', name);
  if (branch) git(repoPath, 'worktree', 'add', '-q', '-b', branch, folder);
  else git(repoPath, 'worktree', 'add', '-q', '--detach', folder);
  return folder;
}

/** A Service that prints the folder it runs in, then stays alive. */
function printsCwd(id: string): ServiceConfig {
  return { id, command: `echo CWD=[%CD%] & ${fixtureCommand('ready-after.mjs', 0)}` };
}

/** The folder the last run of a Service printed. */
function lastCwd(core: DevPanelCore, repoId: string, serviceId: string): string | undefined {
  const runs = [...stripAnsi(core.getServiceOutput(repoId, serviceId)).matchAll(/CWD=\[([^\]%]+)\]/g)];
  return runs.at(-1)?.[1]?.toLowerCase();
}

function repoOf(core: DevPanelCore, repoId: string) {
  return core.listRepos().find((r) => r.id === repoId)!;
}

function statusOf(core: DevPanelCore, repoId: string, serviceId: string) {
  return repoOf(core, repoId).services.find((s) => s.id === serviceId)?.status;
}

/** A git Repo `name` with a Local Config of `services`, and the core over it. */
async function gitRepo(name: string, services: ServiceConfig[] = [printsCwd('api'), printsCwd('worker')]) {
  const repoPath = h.addRepo({ name });
  gitInit(repoPath);
  const core = await h.createCore();
  const repoId = core.listRepos().find((r) => r.name === name)!.id;
  await core.saveLocalConfig(repoId, services);
  // Wide enough that ConPTY never wraps the printed folder.
  for (const s of services) core.resizePty(repoId, s.id, 300, 30);
  return { core, repoId, repoPath };
}

describe('listWorktrees', () => {
  it('lists Worktrees on a branch whose folder exists, with the branch of the Repo folder', async () => {
    const clientPath = h.addRepo({ name: 'client' });
    gitInit(clientPath);
    const feature = addWorktree(clientPath, 'client-x', 'feat/x');
    addWorktree(clientPath, 'client-detached');
    rmSync(addWorktree(clientPath, 'client-gone', 'feat/gone'), { recursive: true, force: true });
    h.addRepo({ name: 'notes' });
    const core = await h.createCore();
    const [client, notes] = core.listRepos();

    const listed = await core.listWorktrees();

    expect(listed.map((r) => ({ ...r, worktrees: r.worktrees.map((w) => ({ ...w, path: w.path.toLowerCase() })) }))).toEqual([
      { repoId: client!.id, branch: 'main', worktrees: [{ path: feature.toLowerCase(), branch: 'feat/x' }] },
      { repoId: notes!.id, worktrees: [] },
    ]);
  });

  it('leaves out a Worktree that is itself a Repo of the Workspace', async () => {
    const clientPath = h.addRepo({ name: 'client' });
    gitInit(clientPath);
    const feature = addWorktree(clientPath, 'client-x', 'feat/x');
    const core = await h.createCore();
    const added = await core.addRepo({ path: feature });

    const listed = await core.listWorktrees();

    expect(listed.find((r) => r.repoId !== added!.id)!.worktrees).toEqual([]);
    expect(listed.find((r) => r.repoId === added!.id)).toMatchObject({ branch: 'feat/x' });
  });
});

describe('switchRepoFolder', () => {
  it('restarts the Services that ran in the Worktree, and back in the Repo folder', async () => {
    const { core, repoId, repoPath } = await gitRepo('client');
    const feature = addWorktree(repoPath, 'client-x', 'feat/x');
    await core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'api', 'running');
    expect(lastCwd(core, repoId, 'api')).toBe(repoPath.toLowerCase());

    const result = await core.switchRepoFolder(repoId, feature);

    expect(result).toEqual({ notFound: [], notRunning: [] });
    expect(statusOf(core, repoId, 'api')).toBe('running');
    expect(statusOf(core, repoId, 'worker')).toBe('stopped');
    expect(lastCwd(core, repoId, 'api')).toBe(feature.toLowerCase());
    expect(repoOf(core, repoId).worktree).toEqual({ path: expect.stringMatching(/client-x$/), branch: 'feat/x' });

    await core.switchRepoFolder(repoId, null);

    expect(statusOf(core, repoId, 'api')).toBe('running');
    expect(lastCwd(core, repoId, 'api')).toBe(repoPath.toLowerCase());
    expect(repoOf(core, repoId).worktree).toBeUndefined();
  });

  it('starts every Service when none was running', async () => {
    const { core, repoId, repoPath } = await gitRepo('client');
    const feature = addWorktree(repoPath, 'client-x', 'feat/x');

    await core.switchRepoFolder(repoId, feature);

    expect(statusOf(core, repoId, 'api')).toBe('running');
    expect(statusOf(core, repoId, 'worker')).toBe('running');
    expect(lastCwd(core, repoId, 'worker')).toBe(feature.toLowerCase());
  });

  it("uses the Worktree's .devpanel.yml over the Local Config and reports a Service it lacks", async () => {
    const { core, repoId, repoPath } = await gitRepo('client');
    const feature = addWorktree(repoPath, 'client-x', 'feat/x');
    writeFileSync(path.join(feature, '.devpanel.yml'), stringify({ services: [printsCwd('api')] }));
    await Promise.all([core.startService(repoId, 'api'), core.startService(repoId, 'worker')]);
    await waitForStatus(core, repoId, 'worker', 'running');

    const result = await core.switchRepoFolder(repoId, feature);

    expect(result).toEqual({
      notFound: [{ ref: { repoId, serviceId: 'worker' }, repoName: 'client', serviceName: 'worker' }],
      notRunning: [],
    });
    expect(repoOf(core, repoId).configSource).toBe('repo');
    expect(repoOf(core, repoId).services.map((s) => [s.id, s.status])).toEqual([['api', 'running']]);

    await core.switchRepoFolder(repoId, null);

    expect(repoOf(core, repoId).configSource).toBe('local');
    expect(repoOf(core, repoId).services.map((s) => s.id)).toEqual(['api', 'worker']);
  });

  it('refuses a folder that is not a Worktree of the Repo on a branch', async () => {
    const { core, repoId, repoPath } = await gitRepo('client');
    const detached = addWorktree(repoPath, 'client-detached');

    for (const folder of [detached, h.makeFolder('elsewhere')]) {
      await expect(core.switchRepoFolder(repoId, folder)).rejects.toMatchObject({ code: 'worktreeNotFound' });
    }
    expect(repoOf(core, repoId).worktree).toBeUndefined();
  });

  it('opens new Sessions and the folder in the Worktree', async () => {
    const { core, repoId, repoPath } = await gitRepo('client', [printsCwd('api')]);
    const feature = addWorktree(repoPath, 'client-x', 'feat/x');
    await core.switchRepoFolder(repoId, feature);
    await core.stopAll(repoId);

    await core.openFolder(repoId);
    const session = await core.openTerminal(repoId);

    expect(h.shell.openedFolders.map((f) => f.toLowerCase())).toEqual([feature.toLowerCase()]);
    const cwd = new Promise<string>((resolve) => {
      let buffer = '';
      core.on('sessionOutput', (e) => {
        if (e.sessionId !== session.id) return;
        buffer += stripAnsi(e.data);
        const match = /CWD=\[([^%\]]+)\]/.exec(buffer);
        if (match) resolve(match[1]!);
      });
    });
    core.writeToSession(session.id, 'echo CWD=[%CD%]\r');
    expect((await cwd).toLowerCase()).toBe(feature.toLowerCase());
  });

  it('refuses to start a Service once the Worktree folder is gone', async () => {
    const { core, repoId, repoPath } = await gitRepo('client', [printsCwd('api')]);
    const feature = addWorktree(repoPath, 'client-x', 'feat/x');
    await core.switchRepoFolder(repoId, feature);
    await core.stopAll(repoId);
    rmSync(feature, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    const start = core.startService(repoId, 'api');

    await expect(start).rejects.toBeInstanceOf(DevPanelError);
    await expect(start).rejects.toMatchObject({ code: 'worktreeFolderMissing', params: { repoName: 'client' } });
    await core.switchRepoFolder(repoId, null);
    await core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'api', 'running');
  });

  it('runs every Repo from its own folder after a Server restart', async () => {
    const { core, repoId, repoPath } = await gitRepo('client', [printsCwd('api')]);
    await core.switchRepoFolder(repoId, addWorktree(repoPath, 'client-x', 'feat/x'));
    await core.stopAll(repoId);

    const restarted = await h.createCore();

    expect(repoOf(restarted, repoId).worktree).toBeUndefined();
  });
});

describe('Branch Check', () => {
  /**
   * client: Worktree on feat/x, api running. server: no such branch, api running. portal: its own
   * folder on feat/x. other: running from a Worktree on feat/y.
   */
  async function workspace() {
    const paths = Object.fromEntries(['client', 'server', 'portal', 'other'].map((n) => [n, h.addRepo({ name: n })]));
    for (const p of Object.values(paths)) gitInit(p);
    git(paths.portal!, 'checkout', '-q', '-b', 'feat/x');
    const clientX = addWorktree(paths.client!, 'client-x', 'feat/x');
    const otherY = addWorktree(paths.other!, 'other-y', 'feat/y');
    const core = await h.createCore();
    const ids = Object.fromEntries(core.listRepos().map((r) => [r.name, r.id])) as Record<string, string>;
    for (const name of ['client', 'server', 'other']) {
      await core.saveLocalConfig(ids[name]!, [printsCwd('api')]);
      core.resizePty(ids[name]!, 'api', 300, 30);
    }
    await core.startService(ids.client!, 'api');
    await core.startService(ids.server!, 'api');
    await core.switchRepoFolder(ids.other!, otherY);
    for (const name of ['client', 'server', 'other']) await waitForStatus(core, ids[name]!, 'api', 'running');
    const events: BranchCheckChangedEvent[] = [];
    core.on('branchCheckChanged', (e) => events.push(e));
    return { core, ids, paths, clientX, events };
  }

  it('switches the Repos that have the branch, leaves the others, and returns Repos of another branch', async () => {
    const { core, ids, paths, clientX, events } = await workspace();
    const serverStatuses: string[] = [];
    core.on('statusChanged', (e) => {
      if (e.repoId === ids.server) serverStatuses.push(e.status);
    });

    const result = await core.startBranchCheck('feat/x');

    expect(result).toEqual({ notFound: [], notRunning: [] });
    expect(lastCwd(core, ids.client!, 'api')).toBe(clientX.toLowerCase());
    expect(repoOf(core, ids.client!).worktree?.branch).toBe('feat/x');
    expect(repoOf(core, ids.portal!).worktree).toBeUndefined();
    expect(serverStatuses).toEqual([]);
    expect(statusOf(core, ids.server!, 'api')).toBe('running');
    expect(repoOf(core, ids.other!).worktree).toBeUndefined();
    expect(lastCwd(core, ids.other!, 'api')).toBe(paths.other!.toLowerCase());
    expect(events).toEqual([{ branch: 'feat/x' }]);
    expect(core.snapshot().branchCheck).toBe('feat/x');
  });

  it('refuses a branch no Repo has', async () => {
    const { core, events } = await workspace();

    await expect(core.startBranchCheck('feat/nope')).rejects.toMatchObject({
      code: 'branchNotFound',
      params: { branch: 'feat/nope' },
    });
    expect(events).toEqual([]);
  });

  it('ends: every Repo goes back to its own folder', async () => {
    const { core, ids, paths } = await workspace();
    await core.startBranchCheck('feat/x');

    const result = await core.endBranchCheck();

    expect(result).toEqual({ notFound: [], notRunning: [] });
    expect(core.listRepos().every((r) => r.worktree === undefined)).toBe(true);
    expect(lastCwd(core, ids.client!, 'api')).toBe(paths.client!.toLowerCase());
    expect(core.snapshot().branchCheck).toBeUndefined();
  });

  it('ends when one Repo is switched by hand', async () => {
    const { core, ids, events } = await workspace();
    await core.startBranchCheck('feat/x');

    await core.switchRepoFolder(ids.client!, null);

    expect(events).toEqual([{ branch: 'feat/x' }, {}]);
    expect(core.snapshot().branchCheck).toBeUndefined();
  });
});
