/**
 * Exit and Orphans: every spawned process is recorded in the PID file of the app data directory;
 * a later Server start reports the recorded processes that are still alive (PID and creation time
 * both matching) as Orphans and can kill them; Orphans holding a port are a port-conflict owner.
 *
 * A "crash" of the DevPanel Server is simulated by abandoning a `core` without `shutdown` and
 * starting a second `core` over the same app data directory. Every process involved is spawned by
 * the test itself (through the abandoned `core` or directly).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OrphansFoundEvent } from '@devpanel/shared';
import { DevPanelError } from '@devpanel/shared';
import { PID_FILE, type DevPanelCore } from '../src/index.js';
import { Harness, fixtureCommand, freePort, isAlive, waitForStatus } from './harness.js';


let h: Harness;
const children: ChildProcess[] = [];
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
});

interface PidEntry {
  pid: number;
  createdAt: string;
  runId: string;
  repoId: string;
  repoName: string;
  owner: { kind: string; serviceId?: string; serviceName?: string; sessionKind?: string };
}

function pidEntries(): PidEntry[] {
  const file = path.join(h.appDataDir, PID_FILE);
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as { processes: PidEntry[] }).processes;
}

async function waitUntil(condition: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitDead(pids: number[], timeoutMs = 10_000): Promise<void> {
  await waitUntil(() => pids.every((pid) => !isAlive(pid)), `PIDs ${pids.join(', ')} to exit`, timeoutMs);
}

function repoId(core: DevPanelCore, repoName: string): string {
  return core.listRepos().find((r) => r.name === repoName)!.id;
}

/** Starts Billing/API (a Service with a child and a grandchild) and waits until all three are recorded. */
async function startRecordedApi(core: DevPanelCore): Promise<{ id: string; child: number; grandchild: number }> {
  const id = repoId(core, 'Billing');
  const pids = h.waitForOutput(core, id, 'api', /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
  await core.startService(id, 'api');
  const match = await pids;
  const child = Number(match[1]);
  const grandchild = Number(match[2]);
  await waitForStatus(core, id, 'api', 'running');
  await waitUntil(
    () => [child, grandchild].every((pid) => pidEntries().some((e) => e.pid === pid)),
    'the Service tree to be recorded in the PID file',
  );
  return { id, child, grandchild };
}

describe('the PID file', () => {
  it('records every process of a running Service with creation time, Repo and Service id; removes them when it ends', async () => {
    h.addRepo({ name: 'Billing', config: { services: [{ id: 'api', name: 'API', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const core = await h.createCore();
    const { id, child, grandchild } = await startRecordedApi(core);

    const entries = pidEntries();
    // The pty's cmd.exe, the Service's node, and its grandchild.
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const pid of [child, grandchild]) {
      const entry = entries.find((e) => e.pid === pid)!;
      expect(entry.createdAt).toMatch(/^\d+$/);
      expect(entry).toMatchObject({ repoId: id, repoName: 'Billing', owner: { kind: 'service', serviceId: 'api', serviceName: 'API' } });
    }

    await core.stopService(id, 'api');
    expect(pidEntries()).toEqual([]);
  });
});

describe('Exit', () => {
  it('shutdown stops every Service of every Repo (whole trees) and leaves no PID file records', async () => {
    h.addRepo({ name: 'Billing', config: { services: [{ id: 'api', name: 'API', command: fixtureCommand('spawn-grandchild.mjs', '--ignore-sigint') }] } });
    h.addRepo({ name: 'Docs', config: { services: [{ id: 'site', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const core = await h.createCore();
    const { child, grandchild } = await startRecordedApi(core);
    const docs = repoId(core, 'Docs');
    const site = h.waitForOutput(core, docs, 'site', /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
    await core.startService(docs, 'site');
    const siteMatch = await site;

    await core.shutdown({ gracefulStopMs: 300 });

    await waitDead([child, grandchild, Number(siteMatch[1]), Number(siteMatch[2])]);
    expect(core.listRepos().flatMap((r) => r.services.map((s) => s.status))).toEqual(['stopped', 'stopped']);
    expect(pidEntries()).toEqual([]);
  });
});

describe('Orphans', () => {
  it('a Service left running by a crashed Server is reported on the next start and killed with its whole tree', async () => {
    h.addRepo({ name: 'Billing', config: { services: [{ id: 'api', name: 'API', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const crashed = await h.createCore();
    const { id, child, grandchild } = await startRecordedApi(crashed);

    // The Server "crashes": no shutdown. A new Server starts over the same app data directory.
    const core = await h.createCore();
    const [orphan, ...others] = core.snapshot().orphans ?? [];
    expect(others).toEqual([]);
    expect(orphan).toMatchObject({ repoId: id, repoName: 'Billing', owner: { kind: 'service', serviceId: 'api', serviceName: 'API' } });
    expect(orphan!.pids).toEqual(expect.arrayContaining([child, grandchild]));

    const events: OrphansFoundEvent[] = [];
    core.on('orphansFound', (e) => events.push(e));
    await core.killOrphans();

    await waitDead([child, grandchild]);
    expect(core.snapshot().orphans ?? []).toEqual([]);
    expect(events).toEqual([{ orphans: [] }]);
  });

  it('a Session left running by a crashed Server is an Orphan of Session kind; killing it kills its tree', async () => {
    h.addRepo({ name: 'Billing', config: { services: [] } });
    const crashed = await h.createCore();
    const session = await crashed.openTerminal(repoId(crashed, 'Billing'));
    let output = '';
    crashed.on('sessionOutput', (e) => (output += e.data));
    crashed.writeToSession(session.id, `${fixtureCommand('spawn-grandchild.mjs')}\r`);
    await waitUntil(() => /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/.test(output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')), 'the fixture in the Session');
    const [, child, grandchild] = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').match(/CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/)!.map(Number);
    // Recorded by the follow-up recording a few seconds after the Session started.
    await waitUntil(() => [child!, grandchild!].every((pid) => pidEntries().some((e) => e.pid === pid)), 'the Session tree to be recorded');
    expect(pidEntries().find((e) => e.pid === child)).toMatchObject({ repoName: 'Billing', owner: { kind: 'session', sessionKind: 'shell' } });

    const core = await h.createCore();
    expect(core.listOrphans()).toEqual([
      expect.objectContaining({ repoName: 'Billing', owner: { kind: 'session', sessionKind: 'shell' } }),
    ]);
    await core.killOrphans();
    await waitDead([child!, grandchild!]);
  });

  it('a process that merely reused a recorded PID is not an Orphan and is never killed', async () => {
    h.addRepo({ name: 'Billing', config: { services: [] } });
    // A process unrelated to DevPanel (spawned by the test) now has a PID that was once recorded.
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    children.push(unrelated);
    const pid = unrelated.pid!;
    writeFileSync(
      path.join(h.appDataDir, PID_FILE),
      JSON.stringify({
        processes: [
          {
            pid,
            createdAt: '116444736000000000', // FILETIME of 1970-01-01: not when this process started
            runId: 'old-run',
            repoId: 'abc',
            repoName: 'Billing',
            owner: { kind: 'service', serviceId: 'api', serviceName: 'API' },
          },
        ],
      }),
    );

    const core = await h.createCore();
    expect(core.snapshot().orphans ?? []).toEqual([]);
    await core.killOrphans();
    await new Promise((r) => setTimeout(r, 300));
    expect(isAlive(pid)).toBe(true);
    // Stale entries are dropped, so they are not checked again on the next start.
    expect(pidEntries()).toEqual([]);
  });

  it('an entry whose process is gone is not an Orphan', async () => {
    h.addRepo({ name: 'Billing', config: { services: [] } });
    const gone = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((r) => gone.on('exit', r));
    writeFileSync(
      path.join(h.appDataDir, PID_FILE),
      JSON.stringify({
        processes: [
          { pid: gone.pid, createdAt: '133000000000000000', runId: 'r', repoId: 'abc', repoName: 'Billing', owner: { kind: 'session', sessionKind: 'shell' } },
        ],
      }),
    );
    const core = await h.createCore();
    expect(core.snapshot().orphans ?? []).toEqual([]);
  });

  it('an Orphan holding a port is a port-conflict owner; resolving kills it and starts our Service', async () => {
    const port = await freePort();
    h.addRepo({
      name: 'Billing',
      config: { services: [{ id: 'api', name: 'API', command: fixtureCommand('listen.mjs', port), port }] },
    });
    const crashed = await h.createCore();
    const id = repoId(crashed, 'Billing');
    await crashed.startService(id, 'api');
    await waitForStatus(crashed, id, 'api', 'running');
    await waitUntil(() => pidEntries().length >= 2, 'the Service tree to be recorded');
    const leftover = pidEntries().map((e) => e.pid);

    const core = await h.createCore();
    const orphanId = core.snapshot().orphans![0]!.id;
    let error: unknown;
    try {
      await core.startService(id, 'api');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DevPanelError);
    expect((error as DevPanelError).code).toBe('portTaken');
    const conflict = core.listRepos()[0]!.services[0]!.portConflict!;
    expect(conflict.owner).toMatchObject({
      kind: 'orphan',
      orphan: { id: orphanId, repoName: 'Billing', owner: { kind: 'service', serviceName: 'API' } },
    });

    await core.resolvePortConflict(id, 'api');
    await waitDead(leftover);
    await waitForStatus(core, id, 'api', 'running');
    expect(core.snapshot().orphans ?? []).toEqual([]);
  });
});

