import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DevPanelCore, ExitEvent, StatusChangedEvent } from '../src/index.js';
import { Harness, TEST_TIMINGS, fixtureCommand, freePort, waitForStatus } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

function recordStatuses(core: DevPanelCore): string[] {
  const statuses: string[] = [];
  core.on('statusChanged', (e: StatusChangedEvent) => statuses.push(e.status));
  return statuses;
}

function nextExit(core: DevPanelCore): Promise<ExitEvent> {
  return new Promise((resolve) => core.once('exit', resolve));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Starts the single Service `api` of a fresh Repo and returns the core and the Repo id. */
async function startApi(
  service: Record<string, unknown>,
  timings = TEST_TIMINGS,
): Promise<{ core: DevPanelCore; repoId: string; statuses: string[] }> {
  h.addRepo({ name: 'billing', config: { services: [{ id: 'api', ...service }] } });
  const core = await h.createCore(timings);
  const repoId = core.listRepos()[0]!.id;
  const statuses = recordStatuses(core);
  await core.startService(repoId, 'api');
  return { core, repoId, statuses };
}

function statusOf(core: DevPanelCore): string {
  return core.listRepos()[0]!.services[0]!.status;
}

describe('Readiness moves a Service from starting to running', () => {
  it('when readyPattern appears in the output', async () => {
    const { core, repoId, statuses } = await startApi({
      command: fixtureCommand('ready-after.mjs', 800, 'Server_is_up_on_3000'),
      readyPattern: 'is_up_on_\\d+',
    });
    await delay(400);
    expect(statusOf(core)).toBe('starting');

    await waitForStatus(core, repoId, 'api', 'running');
    expect(statuses).toEqual(['starting', 'running']);
  });

  it('readyPattern matches across ANSI color codes', async () => {
    const { core, repoId } = await startApi({
      command: `echo \x1b[32mready\x1b[0m && ${fixtureCommand('ready-after.mjs', 60_000)}`,
      readyPattern: '^ready',
    });
    await waitForStatus(core, repoId, 'api', 'running');
  });

  it('when healthUrl answers', async () => {
    const port = await freePort();
    const { core, repoId, statuses } = await startApi({
      command: fixtureCommand('serve-health.mjs', port, 800),
      healthUrl: `http://127.0.0.1:${port}/health`,
    });
    await delay(400);
    expect(statusOf(core)).toBe('starting');

    await waitForStatus(core, repoId, 'api', 'running');
    expect(statuses).toEqual(['starting', 'running']);
  });

  it.each(['ipv4', 'ipv6', 'any'])('when its port is listening (%s)', async (mode) => {
    const port = await freePort();
    const { core, repoId, statuses } = await startApi({
      command: fixtureCommand('listen.mjs', port, mode, 600),
      port,
    });
    await waitForStatus(core, repoId, 'api', 'running');
    expect(statuses).toEqual(['starting', 'running']);
  });

  it('does not count as ready while its port is not listening', async () => {
    const port = await freePort();
    const { core } = await startApi({
      command: fixtureCommand('ready-after.mjs', 60_000),
      port,
    });
    await delay(1000);
    expect(statusOf(core)).toBe('starting');
  });
});

describe('a Service without readiness criteria', () => {
  it('becomes running after staying alive for the liveness period', async () => {
    const { core, repoId, statuses } = await startApi(
      { command: fixtureCommand('ready-after.mjs', 60_000) },
      { ...TEST_TIMINGS, livenessMs: 1000 },
    );
    await delay(500);
    expect(statusOf(core)).toBe('starting');

    await waitForStatus(core, repoId, 'api', 'running');
    expect(statuses).toEqual(['starting', 'running']);
  });

  it.each([
    [3, 'crashed'],
    [0, 'exited'],
  ])('that exits with %i before the liveness period ends is %s, never running', async (code, status) => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('exit-after.mjs', 200, code) }] } });
    const core = await h.createCore({ ...TEST_TIMINGS, livenessMs: 1500 });
    const repoId = core.listRepos()[0]!.id;
    const statuses = recordStatuses(core);
    const exit = nextExit(core);

    await core.startService(repoId, 'api');
    await exit;
    await delay(2000);

    expect(statuses).toEqual(['starting', status]);
  });
});

describe('a Service still not ready after the readiness timeout', () => {
  it('becomes unhealthy, is not killed, keeps being checked less often, and turns running when ready', async () => {
    const port = await freePort();
    let hits = 0;
    let hitsWhenUnhealthy = -1;
    const { core, repoId, statuses } = await startApi(
      {
        command: fixtureCommand('serve-health.mjs', port, 3000),
        healthUrl: `http://127.0.0.1:${port}/health`,
      },
      { ...TEST_TIMINGS, readinessTimeoutMs: 800, healthPollMs: 100, unhealthyPollMs: 1000 },
    );
    core.on('log', (e) => {
      hits += (e.data.match(/HIT \d+/g) ?? []).length;
    });
    core.on('statusChanged', (e) => {
      if (e.status === 'unhealthy') hitsWhenUnhealthy = hits;
    });

    await waitForStatus(core, repoId, 'api', 'unhealthy');
    await waitForStatus(core, repoId, 'api', 'running', 10_000);

    expect(statuses).toEqual(['starting', 'unhealthy', 'running']);
    // ~2.2 s unhealthy at a 1 s interval: a handful of polls, not the ~20 a 100 ms interval would give.
    expect(hits - hitsWhenUnhealthy).toBeGreaterThanOrEqual(1);
    expect(hits - hitsWhenUnhealthy).toBeLessThanOrEqual(5);
  });

  it('becomes running from unhealthy when readyPattern appears later', async () => {
    const { core, repoId, statuses } = await startApi(
      { command: fixtureCommand('ready-after.mjs', 1500, 'ready'), readyPattern: 'ready' },
      { ...TEST_TIMINGS, readinessTimeoutMs: 500 },
    );
    await waitForStatus(core, repoId, 'api', 'running');
    expect(statuses).toEqual(['starting', 'unhealthy', 'running']);
  });

  it('an unhealthy Service can be stopped', async () => {
    const { core, repoId } = await startApi(
      { command: fixtureCommand('ready-after.mjs', 60_000), readyPattern: 'never' },
      { ...TEST_TIMINGS, readinessTimeoutMs: 300 },
    );
    await waitForStatus(core, repoId, 'api', 'unhealthy');
    await core.stopService(repoId, 'api');
    expect(statusOf(core)).toBe('stopped');
  });
});

describe('while running', () => {
  it('no readiness checks run', async () => {
    const port = await freePort();
    let hits = 0;
    const { core, repoId } = await startApi({
      command: fixtureCommand('serve-health.mjs', port, 0),
      healthUrl: `http://127.0.0.1:${port}/health`,
    });
    core.on('log', (e) => {
      hits += (e.data.match(/HIT \d+/g) ?? []).length;
    });
    await waitForStatus(core, repoId, 'api', 'running');
    await delay(300);
    const hitsAtRunning = hits;

    await delay(1000);

    expect(hits).toBe(hitsAtRunning);
  });
});

describe('a Service that ends by itself', () => {
  it('reports its exit code and the last 30 output lines', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `echo line${i + 1}`).join(' && ');
    const { core, repoId } = await startApi({ command: `${lines} && exit /b 7` });
    const exit = await nextExit(core);

    expect(exit.exitCode).toBe(7);
    expect(exit.lastLines).toHaveLength(30);
    expect(exit.lastLines[0]).toBe('line11');
    expect(exit.lastLines[29]).toBe('line40');
    const service = core.listRepos().find((r) => r.id === repoId)!.services[0]!;
    expect(service.status).toBe('crashed');
    expect(service.lastExit).toEqual({ exitCode: 7, lastLines: exit.lastLines });
  });

  it('exited also keeps the last lines; a new start clears them', async () => {
    const { core, repoId } = await startApi({ command: 'echo bye' });
    await nextExit(core);
    const exited = core.listRepos()[0]!.services[0]!;
    expect(exited.status).toBe('exited');
    expect(exited.lastExit).toEqual({ exitCode: 0, lastLines: ['bye'] });

    await core.startService(repoId, 'api');
    expect(core.listRepos()[0]!.services[0]!.lastExit).toBeUndefined();
  });

  it('is not restarted automatically', async () => {
    const { core } = await startApi({ command: fixtureCommand('exit-after.mjs', 100, 1) });
    await nextExit(core);
    const statuses = recordStatuses(core);
    await delay(1000);
    expect(statuses).toEqual([]);
  });

  it('Dismiss moves a crashed or exited Service to stopped and drops the exit details', async () => {
    const { core, repoId, statuses } = await startApi({ command: 'echo bye && exit /b 3' });
    await nextExit(core);
    core.dismissExit(repoId, 'api');
    expect(statusOf(core)).toBe('stopped');
    expect(core.listRepos()[0]!.services[0]!.lastExit).toBeUndefined();
    expect(statuses.at(-1)).toBe('stopped');

    await core.startService(repoId, 'api');
    await nextExit(core);
    expect(statusOf(core)).toBe('crashed');
  });

  it('Dismiss leaves a Service that is not crashed or exited alone', async () => {
    const { core, repoId } = await startApi({ command: fixtureCommand('spawn-grandchild.mjs') });
    const before = statusOf(core);
    core.dismissExit(repoId, 'api');
    expect(statusOf(core)).toBe(before);
    await core.stopService(repoId, 'api');
  });

  it('a Service stopped by the user reports no exit details', async () => {
    const { core, repoId } = await startApi({ command: fixtureCommand('spawn-grandchild.mjs') });
    await core.stopService(repoId, 'api');
    expect(core.listRepos()[0]!.services[0]!.lastExit).toBeUndefined();
  });
});
