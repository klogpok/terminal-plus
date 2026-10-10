import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import type { DevPanelCore, ExitEvent, StatusChangedEvent } from '../src/index.js';
import { Harness, fixtureCommand } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

function nextExit(core: DevPanelCore): Promise<ExitEvent> {
  return new Promise((resolve) => core.once('exit', resolve));
}

function recordStatuses(core: DevPanelCore): string[] {
  const statuses: string[] = [];
  core.on('statusChanged', (e: StatusChangedEvent) => statuses.push(`${e.serviceId}:${e.status}`));
  return statuses;
}

describe('a Service that ends without Stop', () => {
  it('is crashed after a non-zero exit code', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('exit-after.mjs', 100, 3) }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    const exit = nextExit(core);
    await core.startService(repo.id, 'api');

    expect(await exit).toMatchObject({ exitCode: 3, stoppedByUser: false });
    expect(core.listRepos()[0]!.services[0]!.status).toBe('crashed');
  });

  it('is exited (not stopped) after exit code 0', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('exit-after.mjs', 100, 0) }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    const exit = nextExit(core);
    await core.startService(repo.id, 'api');

    expect(await exit).toMatchObject({ exitCode: 0, stoppedByUser: false });
    expect(core.listRepos()[0]!.services[0]!.status).toBe('exited');
  });
});

describe('restartService', () => {
  it('stops a running Service and starts it again', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const first = h.waitForOutput(core, repo.id, 'api', /CHILD_PID=(\d+)/);
    await core.startService(repo.id, 'api');
    const [, firstPid] = await first;
    const statuses = recordStatuses(core);

    const second = h.waitForOutput(core, repo.id, 'api', /CHILD_PID=(\d+)/);
    await core.restartService(repo.id, 'api');
    const [, secondPid] = await second;

    expect(secondPid).not.toBe(firstPid);
    expect(statuses).toEqual(['api:stopping', 'api:stopped', 'api:starting', 'api:running']);
  });

  it('starts a Service that is not running', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    await core.restartService(repo.id, 'api');

    expect(core.listRepos()[0]!.services[0]!.status).toBe('running');
  });
});

describe('snapshot', () => {
  it('returns the full state: Repos with their Services and current Statuses', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    h.addRepo({ name: 'docs', config: { services: [{ id: 'watch', command: 'echo hi' }] } });
    const core = await h.createCore();
    const billing = core.listRepos()[0]!;
    await core.startService(billing.id, 'api');

    const snapshot = core.snapshot();

    expect(snapshot.repos.map((r) => r.name)).toEqual(['billing', 'docs']);
    expect(snapshot.repos[0]!.services.map((s) => [s.id, s.status])).toEqual([['api', 'running']]);
    expect(snapshot.repos[1]!.services.map((s) => [s.id, s.status])).toEqual([['watch', 'stopped']]);
  });
});

describe('commands on unknown targets', () => {
  it('fail with a DevPanelError carrying a stable code', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'echo hi' }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    await expect(core.startService('nope', 'api')).rejects.toMatchObject({ code: 'repoNotFound' });
    const error = await core.startService(repo.id, 'nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DevPanelError);
    expect(error).toMatchObject({ code: 'serviceNotFound', params: { repoName: 'billing', serviceId: 'nope' } });
  });
});
