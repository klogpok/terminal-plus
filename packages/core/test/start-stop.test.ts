import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DevPanelCore, StatusChangedEvent } from '../src/index.js';
import { Harness, fixtureCommand, isAlive } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

function recordStatuses(core: DevPanelCore): string[] {
  const statuses: string[] = [];
  core.on('statusChanged', (e: StatusChangedEvent) => statuses.push(`${e.serviceId}:${e.status}`));
  return statuses;
}

async function waitUntil(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('startService', () => {
  it('runs the command in cwd resolved against the Repo path, with FORCE_COLOR=1', async () => {
    h.addRepo({
      name: 'billing',
      dirs: ['packages/api'],
      config: { services: [{ id: 'api', command: fixtureCommand('print-env.mjs'), cwd: 'packages/api' }] },
    });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const statuses = recordStatuses(core);

    const output = h.waitForOutput(core, repo.id, 'api', /CWD_NAME=(\S+) FORCE_COLOR=(\S*)/);
    await core.startService(repo.id, 'api');
    const [, cwdName, forceColor] = await output;

    expect(cwdName).toBe('api');
    expect(forceColor).toBe('1');
    expect(statuses).toEqual(['api:starting']);
  });

  it('runs the command through cmd.exe, so shell syntax works', async () => {
    h.addRepo({
      name: 'billing',
      config: { services: [{ id: 'api', command: `echo FIRST && ${fixtureCommand('ready-after.mjs', 0, 'SECOND')}` }] },
    });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    const output = h.waitForOutput(core, repo.id, 'api', /FIRST[\s\S]*SECOND/);
    await core.startService(repo.id, 'api');
    await output;
  });
});

describe('stopService', () => {
  it('stops a Service that honours Ctrl+C within the graceful period', async () => {
    h.addRepo({
      name: 'billing',
      config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs') }] },
    });
    const core = await h.createCore({ gracefulStopMs: 10_000 });
    const repo = core.listRepos()[0]!;
    const statuses = recordStatuses(core);

    const pids = h.waitForOutput(core, repo.id, 'api', /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
    await core.startService(repo.id, 'api');
    const [, child, grandchild] = (await pids).map(Number);

    const started = Date.now();
    await core.stopService(repo.id, 'api');

    expect(Date.now() - started).toBeLessThan(10_000);
    await waitUntil(() => !isAlive(child!) && !isAlive(grandchild!));
    expect(statuses).toEqual(['api:starting', 'api:stopping', 'api:stopped']);
    expect(core.listRepos()[0]!.services[0]!.status).toBe('stopped');
  });

  it('answers the "Terminate batch job" prompt of .cmd shims (like pnpm.cmd) instead of waiting', async () => {
    h.addRepo({
      name: 'billing',
      config: {
        services: [{ id: 'api', command: `${fixtureCommand('run-batch.cmd')} ${fixtureCommand('spawn-grandchild.mjs')}` }],
      },
    });
    const core = await h.createCore({ gracefulStopMs: 10_000 });
    const repo = core.listRepos()[0]!;

    const pids = h.waitForOutput(core, repo.id, 'api', /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
    await core.startService(repo.id, 'api');
    const [, child, grandchild] = (await pids).map(Number);

    const started = Date.now();
    await core.stopService(repo.id, 'api');

    expect(Date.now() - started).toBeLessThan(5_000);
    await waitUntil(() => !isAlive(child!) && !isAlive(grandchild!));
    expect(core.listRepos()[0]!.services[0]!.status).toBe('stopped');
  });

  it('kills the whole process tree when the Service ignores Ctrl+C', async () => {
    h.addRepo({
      name: 'billing',
      config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs', '--ignore-sigint') }] },
    });
    const gracefulStopMs = 1500;
    const core = await h.createCore({ gracefulStopMs });
    const repo = core.listRepos()[0]!;
    const statuses = recordStatuses(core);

    const pids = h.waitForOutput(core, repo.id, 'api', /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
    await core.startService(repo.id, 'api');
    const [, child, grandchild] = (await pids).map(Number);

    const ignored = h.waitForOutput(core, repo.id, 'api', /CHILD_IGNORED_SIGINT/);
    const started = Date.now();
    await core.stopService(repo.id, 'api');
    const elapsed = Date.now() - started;
    await ignored;

    expect(elapsed).toBeGreaterThanOrEqual(gracefulStopMs - 50);
    expect(isAlive(child!)).toBe(false);
    expect(isAlive(grandchild!)).toBe(false);
    expect(statuses).toEqual(['api:starting', 'api:stopping', 'api:stopped']);
  });
});
