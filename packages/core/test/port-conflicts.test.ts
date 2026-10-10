import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError, type ErrorInfo } from '@devpanel/shared';
import { findPortListeners, type DevPanelCore, type StatusChangedEvent } from '../src/index.js';
import { Harness, fixtureCommand, freePort, isAlive, waitForStatus } from './harness.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const NODE_NAME = path.basename(process.execPath).toLowerCase();

let h: Harness;
const servers: net.Server[] = [];
const children: ChildProcess[] = [];
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
});

/** Listens on `port` inside the test process itself (a foreign process from DevPanel's view). */
async function listenHere(port: number, host?: string): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, resolve);
  });
}

/** Spawns a foreign `node listen.mjs <port>` (owned by this test) and waits until it listens. */
async function spawnForeignListener(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(FIXTURES, 'listen.mjs'), String(port), 'any'], { stdio: 'pipe' });
  children.push(child);
  await new Promise<void>((resolve) => child.stdout!.on('data', () => resolve()));
  return child;
}

async function caught(promise: Promise<unknown>): Promise<ErrorInfo> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(DevPanelError);
    const e = err as DevPanelError;
    return { code: e.code, params: e.params, details: e.message } as ErrorInfo;
  }
  throw new Error('expected a rejection');
}

function serviceView(core: DevPanelCore, repoName: string, serviceId: string) {
  return core.listRepos().find((r) => r.name === repoName)!.services.find((s) => s.id === serviceId)!;
}

function repoId(core: DevPanelCore, repoName: string): string {
  return core.listRepos().find((r) => r.name === repoName)!.id;
}

describe('a Service whose port is taken', () => {
  it.each([
    ['IPv4', '127.0.0.1'],
    ['IPv6', '::1'],
    ['any-address', undefined],
  ])('is not spawned and reports a conflict (port held on %s)', async (_label, host) => {
    const port = await freePort();
    await listenHere(port, host);
    h.addRepo({ name: 'web', config: { services: [{ id: 'web', name: 'Web', command: fixtureCommand('listen.mjs', port), port }] } });
    const core = await h.createCore();
    const statuses: StatusChangedEvent[] = [];
    core.on('statusChanged', (e) => statuses.push(e));

    const error = await caught(core.startService(repoId(core, 'web'), 'web'));

    expect(error).toMatchObject({
      code: 'portTaken',
      params: {
        port,
        repoName: 'web',
        serviceName: 'Web',
        owner: { kind: 'process', pid: process.pid, processName: NODE_NAME },
      },
    });
    expect(statuses).toEqual([]);
    const view = serviceView(core, 'web', 'web');
    expect(view.status).toBe('stopped');
    expect(view.portConflict).toEqual({
      port,
      reason: 'start',
      owner: { kind: 'process', pid: process.pid, processName: NODE_NAME },
    });
  });

  it('held by a DevPanel Service of another Repo: names that Service and Repo; resolving stops it and starts ours', async () => {
    const port = await freePort();
    h.addRepo({ name: 'Billing', config: { services: [{ id: 'api', name: 'API', command: fixtureCommand('listen.mjs', port), port }] } });
    h.addRepo({ name: 'Shop', config: { services: [{ id: 'web', name: 'Web', command: fixtureCommand('listen.mjs', port), port }] } });
    const core = await h.createCore();
    const billing = repoId(core, 'Billing');
    const shop = repoId(core, 'Shop');
    await core.startService(billing, 'api');
    await waitForStatus(core, billing, 'api', 'running');

    const error = await caught(core.startService(shop, 'web'));

    expect(error.code).toBe('portTaken');
    expect(serviceView(core, 'Shop', 'web').portConflict).toMatchObject({
      port,
      reason: 'start',
      owner: { kind: 'service', repoId: billing, repoName: 'Billing', serviceId: 'api', serviceName: 'API' },
    });
    expect(serviceView(core, 'Shop', 'web').status).toBe('stopped');

    await core.resolvePortConflict(shop, 'web');

    expect(serviceView(core, 'Billing', 'api').status).toBe('stopped');
    await waitForStatus(core, shop, 'web', 'running');
    expect(serviceView(core, 'Shop', 'web').portConflict).toBeUndefined();
  });

  it('held by a foreign process: names it by process name and PID; resolving kills it and starts ours', async () => {
    const port = await freePort();
    const foreign = await spawnForeignListener(port);
    h.addRepo({ name: 'Shop', config: { services: [{ id: 'web', name: 'Web', command: fixtureCommand('listen.mjs', port), port }] } });
    const core = await h.createCore();
    const shop = repoId(core, 'Shop');

    const error = await caught(core.startService(shop, 'web'));

    expect(error).toMatchObject({
      code: 'portTaken',
      params: { port, owner: { kind: 'process', pid: foreign.pid, processName: NODE_NAME } },
    });

    await core.resolvePortConflict(shop, 'web');

    expect(isAlive(foreign.pid!)).toBe(false);
    await waitForStatus(core, shop, 'web', 'running');
    expect(serviceView(core, 'Shop', 'web').portConflict).toBeUndefined();
  });

  it('starts right away when the port was freed in the meantime', async () => {
    const port = await freePort();
    await listenHere(port);
    h.addRepo({ name: 'Shop', config: { services: [{ id: 'web', command: fixtureCommand('listen.mjs', port), port }] } });
    const core = await h.createCore();
    const shop = repoId(core, 'Shop');
    await caught(core.startService(shop, 'web'));
    await new Promise((r) => servers.pop()!.close(r));

    await core.resolvePortConflict(shop, 'web');

    await waitForStatus(core, shop, 'web', 'running');
  });
});

describe('after a Stop', () => {
  it('a released port leaves no conflict', async () => {
    const port = await freePort();
    h.addRepo({ name: 'Shop', config: { services: [{ id: 'web', command: fixtureCommand('listen.mjs', port), port }] } });
    const core = await h.createCore();
    const shop = repoId(core, 'Shop');
    await core.startService(shop, 'web');
    await waitForStatus(core, shop, 'web', 'running');

    await core.stopService(shop, 'web');

    expect(serviceView(core, 'Shop', 'web').portConflict).toBeUndefined();
    expect(await findPortListeners(port)).toEqual([]);
  });

  it('a port still held is reported with its owner; resolving kills the owner and does not start the Service', async () => {
    const port = await freePort();
    h.addRepo({ name: 'Shop', config: { services: [{ id: 'web', command: fixtureCommand('leave-listener.mjs', port), port }] } });
    const core = await h.createCore();
    const shop = repoId(core, 'Shop');
    const leftOver = h.waitForOutput(core, shop, 'web', /PID=(\d+) LEFT/);
    await core.startService(shop, 'web');
    const leftPid = Number((await leftOver)[1]);
    await waitForStatus(core, shop, 'web', 'running');
    const conflicts: unknown[] = [];
    core.on('portConflictChanged', (e) => conflicts.push(e));

    await core.stopService(shop, 'web');

    const expected = { port, reason: 'stop', owner: { kind: 'process', pid: leftPid, processName: NODE_NAME } };
    expect(serviceView(core, 'Shop', 'web').status).toBe('stopped');
    expect(serviceView(core, 'Shop', 'web').portConflict).toEqual(expected);
    expect(conflicts).toEqual([{ repoId: shop, serviceId: 'web', portConflict: expected }]);

    await core.resolvePortConflict(shop, 'web');

    expect(isAlive(leftPid)).toBe(false);
    expect(await findPortListeners(port)).toEqual([]);
    expect(serviceView(core, 'Shop', 'web').status).toBe('stopped');
    expect(serviceView(core, 'Shop', 'web').portConflict).toBeUndefined();
  });
});
