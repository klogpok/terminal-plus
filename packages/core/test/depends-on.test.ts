import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import type { DevPanelCore, StatusChangedEvent } from '../src/index.js';
import { Harness, TEST_TIMINGS, fixtureCommand, waitForStatus } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

/** Records `<serviceId>:<status>` for every status change, in order. */
function recordStatuses(core: DevPanelCore): string[] {
  const log: string[] = [];
  core.on('statusChanged', (e: StatusChangedEvent) => log.push(`${e.serviceId}:${e.status}`));
  return log;
}

function statusOf(core: DevPanelCore, serviceId: string, repoIndex = 0): string | undefined {
  return core.listRepos()[repoIndex]!.services.find((s) => s.id === serviceId)?.status;
}

/** A Service that prints READY after `delayMs` and becomes running on it. */
function readyAfter(id: string, delayMs: number, dependsOn: string[] = []) {
  return { id, command: fixtureCommand('ready-after.mjs', delayMs), readyPattern: 'READY', dependsOn };
}

async function setup(services: unknown[], timings = TEST_TIMINGS) {
  h.addRepo({ name: 'billing', config: { services } });
  const core = await h.createCore(timings);
  const repoId = core.listRepos()[0]!.id;
  return { core, repoId, log: recordStatuses(core) };
}

describe('dependsOn: starting a Service starts its dependencies first', () => {
  it('starts dependencies transitively and spawns the dependent only once they are running', async () => {
    const { core, repoId, log } = await setup([
      readyAfter('db', 300),
      readyAfter('cache', 300, ['db']),
      readyAfter('api', 100, ['cache']),
    ]);

    await core.startService(repoId, 'api');

    expect(statusOf(core, 'db')).toBe('running');
    expect(statusOf(core, 'cache')).toBe('running');
    expect(log.indexOf('db:running')).toBeLessThan(log.indexOf('cache:starting'));
    expect(log.indexOf('cache:running')).toBeLessThan(log.indexOf('api:starting'));
    await waitForStatus(core, repoId, 'api', 'running');
  });

  it('does not restart a dependency that is already running', async () => {
    const { core, repoId, log } = await setup([readyAfter('db', 0), readyAfter('api', 0, ['db'])]);
    await core.startService(repoId, 'db');
    await waitForStatus(core, repoId, 'db', 'running');
    log.length = 0;

    await core.startService(repoId, 'api');

    expect(log.filter((e) => e.startsWith('db:'))).toEqual([]);
    await waitForStatus(core, repoId, 'api', 'running');
  });

  it.each([
    ['crashed', { id: 'db', command: fixtureCommand('exit-after.mjs', 200, 3) }],
    ['exited', { id: 'db', command: fixtureCommand('exit-after.mjs', 200, 0) }],
  ])('a dependency that ends up %s keeps the dependent stopped and names the dependency', async (status, db) => {
    // db has no readiness criteria: its exit must land far inside the liveness period, or a slow
    // node start (or a late exit report) lets it count as running first.
    const { core, repoId } = await setup([db, readyAfter('api', 0, ['db'])], { ...TEST_TIMINGS, livenessMs: 3000 });

    const error = await core.startService(repoId, 'api').then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(DevPanelError);
    expect(error).toMatchObject({
      code: 'dependencyFailed',
      params: { repoName: 'billing', serviceName: 'api', dependencyName: 'db', dependencyStatus: status },
    });
    expect(statusOf(core, 'api')).toBe('stopped');
  });

  it('a dependency that becomes unhealthy keeps the dependent stopped', async () => {
    const { core, repoId } = await setup(
      [
        { id: 'db', command: fixtureCommand('ready-after.mjs', 60_000), readyPattern: 'READY' },
        readyAfter('api', 0, ['db']),
      ],
      { ...TEST_TIMINGS, readinessTimeoutMs: 500 },
    );

    await expect(core.startService(repoId, 'api')).rejects.toMatchObject({
      code: 'dependencyFailed',
      params: { dependencyName: 'db', dependencyStatus: 'unhealthy' },
    });
    expect(statusOf(core, 'api')).toBe('stopped');
    expect(statusOf(core, 'db')).toBe('unhealthy');
  });

  it('stopping a dependent while it waits for its dependency cancels its start quietly', async () => {
    const { core, repoId } = await setup([readyAfter('db', 800), readyAfter('api', 0, ['db'])]);

    const start = core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'db', 'starting');
    await core.stopService(repoId, 'api');
    await waitForStatus(core, repoId, 'db', 'running');

    await expect(start).resolves.toBeUndefined();
    expect(statusOf(core, 'api')).toBe('stopped');
    expect(core.listRepos()[0]!.services.find((s) => s.id === 'api')!.waitingFor).toBeUndefined();
  });

  it('a dependent waiting for its dependencies shows which ones it waits for until it spawns', async () => {
    const { core, repoId } = await setup([
      { ...readyAfter('db', 300), name: 'DB' },
      { ...readyAfter('cache', 600), name: 'Cache' },
      readyAfter('api', 0, ['db', 'cache']),
    ]);
    const waits: (string[] | undefined)[] = [];
    core.on('waitingChanged', (e) => {
      if (e.serviceId === 'api') waits.push(e.waitingFor);
    });

    const start = core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'db', 'starting');
    const api = core.listRepos()[0]!.services.find((s) => s.id === 'api')!;
    expect([api.status, api.waitingFor]).toEqual(['stopped', ['DB', 'Cache']]);
    await start;

    expect(statusOf(core, 'api')).toBe('starting');
    expect(core.listRepos()[0]!.services.find((s) => s.id === 'api')!.waitingFor).toBeUndefined();
    expect(waits).toEqual([['DB', 'Cache'], ['Cache'], undefined]);
  });
});

describe('dependsOn: stops and crashes of a dependency do not propagate', () => {
  it('stopping a dependency leaves the running dependent untouched', async () => {
    const { core, repoId } = await setup([readyAfter('db', 0), readyAfter('api', 0, ['db'])]);
    await core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'api', 'running');

    await core.stopService(repoId, 'db');

    expect(statusOf(core, 'db')).toBe('stopped');
    expect(statusOf(core, 'api')).toBe('running');
  });

  it('a crashing dependency leaves the running dependent untouched', async () => {
    const { core, repoId } = await setup([
      { id: 'db', command: `echo READY && ${fixtureCommand('exit-after.mjs', 1500, 1)}`, readyPattern: 'READY' },
      readyAfter('api', 0, ['db']),
    ]);
    await core.startService(repoId, 'api');
    await waitForStatus(core, repoId, 'api', 'running');

    await waitForStatus(core, repoId, 'db', 'crashed');

    expect(statusOf(core, 'api')).toBe('running');
  });
});

describe('Start all / Stop all', () => {
  it('Start all starts every Service of the Repo in dependency order', async () => {
    const { core, repoId, log } = await setup([
      readyAfter('api', 0, ['db']),
      readyAfter('db', 300),
      readyAfter('worker', 0),
    ]);

    await core.startAll(repoId);

    for (const id of ['api', 'db', 'worker']) await waitForStatus(core, repoId, id, 'running');
    expect(log.filter((e) => e === 'api:starting')).toHaveLength(1);
    expect(log.filter((e) => e === 'db:starting')).toHaveLength(1);
    expect(log.indexOf('db:running')).toBeLessThan(log.indexOf('api:starting'));
  });

  it('Stop all stops every Service of the Repo and only that Repo', async () => {
    h.addRepo({ name: 'billing', config: { services: [readyAfter('api', 0), readyAfter('db', 0)] } });
    h.addRepo({ name: 'docs', config: { services: [readyAfter('site', 0)] } });
    const core = await h.createCore();
    const [billing, docs] = core.listRepos().map((r) => r.id) as [string, string];
    await core.startAll(billing);
    await core.startAll(docs);
    for (const id of ['api', 'db']) await waitForStatus(core, billing, id, 'running');
    await waitForStatus(core, docs, 'site', 'running');

    await core.stopAll(billing);

    expect(statusOf(core, 'api', 0)).toBe('stopped');
    expect(statusOf(core, 'db', 0)).toBe('stopped');
    expect(statusOf(core, 'site', 1)).toBe('running');
  });

  it('Stop everything in all Repos stops every Service in the Workspace', async () => {
    h.addRepo({ name: 'billing', config: { services: [readyAfter('api', 0)] } });
    h.addRepo({ name: 'docs', config: { services: [readyAfter('site', 0)] } });
    const core = await h.createCore();
    const [billing, docs] = core.listRepos().map((r) => r.id) as [string, string];
    await core.startAll(billing);
    await core.startAll(docs);
    await waitForStatus(core, billing, 'api', 'running');
    await waitForStatus(core, docs, 'site', 'running');

    await core.stopAllRepos();

    expect(statusOf(core, 'api', 0)).toBe('stopped');
    expect(statusOf(core, 'site', 1)).toBe('stopped');
  });
});
