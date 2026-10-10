import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError, type InstallState } from '@devpanel/shared';
import { DEFAULT_ENVIRONMENT, type DevPanelCore } from '../src/index.js';
import { Harness, fixtureCommand, stripAnsi, waitForStatus } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

const LOCK = { 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" };
const idleService = { id: 'api', name: 'API', command: fixtureCommand('print-env.mjs') };

/** A pnpm availability probe that records how often it was asked. */
function pnpmProbe(available: boolean) {
  const probe = { calls: 0, isPnpmAvailable: async () => (probe.calls++, available) };
  return probe;
}

describe('dependencies install state on the Repo', () => {
  it('is "needed" for a pnpm Repo without node_modules', async () => {
    h.addRepo({ name: 'fresh', files: LOCK, config: { services: [idleService] } });
    const core = await h.createCore(undefined, { environment: pnpmProbe(true) });

    expect(core.listRepos()[0]!.install).toEqual({ state: 'needed' });
  });

  it('is absent when node_modules exists or the Repo is not a pnpm Repo', async () => {
    h.addRepo({ name: 'installed', files: LOCK, dirs: ['node_modules'], config: { services: [] } });
    h.addRepo({ name: 'npm', config: { services: [] } });
    const core = await h.createCore(undefined, { environment: pnpmProbe(true) });

    expect(core.listRepos().map((r) => r.install)).toEqual([undefined, undefined]);
  });
});

describe('installDependencies', () => {
  function recordInstall(core: DevPanelCore) {
    const record = { output: '', changes: [] as (InstallState | undefined)[] };
    core.on('installOutput', (e) => (record.output += stripAnsi(e.data)));
    core.on('installChanged', (e) => record.changes.push(e.install));
    return record;
  }

  it('runs the install in the Repo folder, streams output, and clears the install state on success', async () => {
    h.addRepo({ name: 'fresh', files: LOCK, config: { services: [idleService] } });
    const core = await h.createCore(undefined, {
      environment: { ...pnpmProbe(true), installCommand: fixtureCommand('fake-install.mjs', 0) },
    });
    const repo = core.listRepos()[0]!;
    const record = recordInstall(core);

    const result = await core.installDependencies(repo.id);

    expect(result).toEqual({ ok: true, exitCode: 0 });
    expect(record.output).toMatch(/INSTALL_IN=fresh/);
    expect(record.output).toMatch(/INSTALL_DONE/);
    expect(record.changes).toEqual([{ state: 'running' }, undefined]);
    expect(core.listRepos()[0]!.install).toBeUndefined();
  });

  it('reports a failed install and keeps offering it', async () => {
    h.addRepo({ name: 'fresh', files: LOCK, config: { services: [] } });
    const core = await h.createCore(undefined, {
      environment: { ...pnpmProbe(true), installCommand: fixtureCommand('fake-install.mjs', 7) },
    });
    const repo = core.listRepos()[0]!;
    const record = recordInstall(core);

    const result = await core.installDependencies(repo.id);

    expect(result).toEqual({ ok: false, exitCode: 7 });
    expect(record.output).toMatch(/INSTALL_FAILED/);
    expect(record.changes).toEqual([{ state: 'running' }, { state: 'failed', exitCode: 7 }]);
    expect(core.listRepos()[0]!.install).toEqual({ state: 'failed', exitCode: 7 });
  });

  it('shows the install as running while it runs', async () => {
    h.addRepo({ name: 'fresh', files: LOCK, config: { services: [] } });
    const core = await h.createCore(undefined, {
      environment: { ...pnpmProbe(true), installCommand: fixtureCommand('fake-install.mjs', 0) },
    });
    const repo = core.listRepos()[0]!;

    const install = core.installDependencies(repo.id);
    const again = core.installDependencies(repo.id);
    await new Promise((resolve) => core.once('installChanged', resolve));
    const whileRunning = core.listRepos()[0]!.install;
    const [first, second] = await Promise.all([install, again]);

    expect(whileRunning).toEqual({ state: 'running' });
    expect(second).toEqual(first);
  });

  it('refuses with the pnpm hint when pnpm is missing', async () => {
    h.addRepo({ name: 'fresh', files: LOCK, config: { services: [] } });
    const core = await h.createCore(undefined, {
      environment: { ...pnpmProbe(false), installCommand: fixtureCommand('fake-install.mjs', 0) },
    });
    const repo = core.listRepos()[0]!;

    await expect(core.installDependencies(repo.id)).rejects.toMatchObject({ code: 'pnpmMissing' });
    expect(core.listRepos()[0]!.install).toEqual({ state: 'needed' });
  });

  it('refuses for a Repo without pnpm-lock.yaml', async () => {
    h.addRepo({ name: 'npm', config: { services: [] } });
    const core = await h.createCore(undefined, {
      environment: { ...pnpmProbe(true), installCommand: fixtureCommand('fake-install.mjs', 0) },
    });
    const repo = core.listRepos()[0]!;

    await expect(core.installDependencies(repo.id)).rejects.toMatchObject({ code: 'notPnpmRepo' });
  });
});

describe('the default pnpm probe', () => {
  it('finds pnpm on this machine (the tests themselves run through pnpm)', async () => {
    expect(await DEFAULT_ENVIRONMENT.isPnpmAvailable()).toBe(true);
  });
});

describe('pnpm availability check on start', () => {
  it('blocks the start of a Service in a pnpm Repo when pnpm is missing', async () => {
    h.addRepo({ name: 'billing', files: LOCK, dirs: ['node_modules'], config: { services: [idleService] } });
    const probe = pnpmProbe(false);
    const core = await h.createCore(undefined, { environment: probe });
    const repo = core.listRepos()[0]!;

    const error = await core.startService(repo.id, 'api').then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(DevPanelError);
    expect(error).toMatchObject({ code: 'pnpmMissing', params: { repoName: 'billing' } });
    expect(core.listRepos()[0]!.services[0]!.status).toBe('stopped');
  });

  it('starts a Service in a pnpm Repo when pnpm is available', async () => {
    h.addRepo({ name: 'billing', files: LOCK, dirs: ['node_modules'], config: { services: [idleService] } });
    const probe = pnpmProbe(true);
    const core = await h.createCore(undefined, { environment: probe });
    const repo = core.listRepos()[0]!;

    await core.startService(repo.id, 'api');

    expect(probe.calls).toBe(1);
    expect(core.listRepos()[0]!.services[0]!.status).toBe('starting');
    await waitForStatus(core, repo.id, 'api', 'running');
  });

  it('never runs the check for a Repo without pnpm-lock.yaml', async () => {
    h.addRepo({ name: 'legacy', config: { services: [idleService] } });
    const probe = pnpmProbe(false);
    const core = await h.createCore(undefined, { environment: probe });
    const repo = core.listRepos()[0]!;

    await core.startService(repo.id, 'api');

    expect(probe.calls).toBe(0);
    expect(core.listRepos()[0]!.services[0]!.status).toBe('starting');
    await waitForStatus(core, repo.id, 'api', 'running');
  });
});
