import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import { SERVICE_SETS_FILE, type DevPanelCore } from '../src/index.js';
import { Harness, fixtureCommand, freePort, waitForStatus } from './harness.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

let h: Harness;
const children: ChildProcess[] = [];
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
});

function idle(id: string, name?: string) {
  return { id, ...(name && { name }), command: fixtureCommand('ready-after.mjs', 0) };
}

/** Two Repos: billing (api "Billing API", worker) and shop (web). */
async function setup() {
  h.addRepo({ name: 'billing', config: { services: [idle('api', 'Billing API'), idle('worker')] } });
  h.addRepo({ name: 'shop', config: { services: [idle('web')] } });
  const core = await h.createCore();
  const [billing, shop] = core.listRepos().map((r) => r.id) as [string, string];
  return { core, billing, shop };
}

describe('createServiceSet', () => {
  it('creates a Service Set from Services of several Repos, lists it, and keeps it across a Server restart', async () => {
    const { core, billing, shop } = await setup();

    const set = await core.createServiceSet({
      name: '  Project X ',
      services: [
        { repoId: billing, serviceId: 'api' },
        { repoId: shop, serviceId: 'web' },
      ],
    });

    const expected = {
      id: set.id,
      name: 'Project X',
      services: [
        { ref: { repoId: billing, serviceId: 'api' }, repoName: 'billing', serviceName: 'Billing API', found: true },
        { ref: { repoId: shop, serviceId: 'web' }, repoName: 'shop', serviceName: 'web', found: true },
      ],
    };
    expect(set).toEqual(expected);
    expect(set.id).toMatch(/\S/);
    expect(core.snapshot().serviceSets).toEqual([expected]);

    const restarted = await h.createCore();
    expect(restarted.snapshot().serviceSets).toEqual([expected]);
  });

  it('lists several Service Sets in creation order', async () => {
    const { core, billing, shop } = await setup();

    await core.createServiceSet({ name: 'Support', services: [{ repoId: shop, serviceId: 'web' }] });
    await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    expect(core.snapshot().serviceSets.map((s) => s.name)).toEqual(['Support', 'Project X']);
  });

  it('tells every client the new list', async () => {
    const { core, billing } = await setup();
    const events: unknown[] = [];
    core.on('serviceSetsChanged', (e) => events.push(e));

    const set = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    expect(events).toEqual([{ serviceSets: [set] }]);
  });

  it('refuses an empty name', async () => {
    const { core, billing } = await setup();

    const code = await codeOf(core.createServiceSet({ name: '   ', services: [{ repoId: billing, serviceId: 'api' }] }));

    expect(code).toBe('serviceSetNameEmpty');
    expect(core.snapshot().serviceSets).toEqual([]);
  });

  it('refuses a name another Service Set already has, ignoring case', async () => {
    const { core, billing } = await setup();
    await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    const error = await errorOf(core.createServiceSet({ name: ' project x', services: [{ repoId: billing, serviceId: 'worker' }] }));

    expect(error).toMatchObject({ code: 'serviceSetNameTaken', params: { name: 'project x' } });
    expect(core.snapshot().serviceSets).toHaveLength(1);
  });

  it('refuses the same name twice even when both arrive at once', async () => {
    const { core, billing } = await setup();
    const services = [{ repoId: billing, serviceId: 'api' }];

    const results = await Promise.allSettled([
      core.createServiceSet({ name: 'Project X', services }),
      core.createServiceSet({ name: 'PROJECT X', services }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(core.snapshot().serviceSets).toHaveLength(1);
  });

  it('refuses a Service Set without Services', async () => {
    const { core } = await setup();

    expect(await codeOf(core.createServiceSet({ name: 'Project X', services: [] }))).toBe('serviceSetEmpty');
    expect(core.snapshot().serviceSets).toEqual([]);
  });

  it('keeps each Service once when it is chosen twice', async () => {
    const { core, billing } = await setup();
    const api = { repoId: billing, serviceId: 'api' };

    const set = await core.createServiceSet({ name: 'Project X', services: [api, api] });

    expect(set.services.map((e) => e.ref)).toEqual([api]);
  });

  it('accepts a Service that is not found, marked as such', async () => {
    const { core, billing } = await setup();

    const set = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'gone' }] });

    expect(set.services).toEqual([
      { ref: { repoId: billing, serviceId: 'gone' }, repoName: billing, serviceName: 'gone', found: false },
    ]);
  });

  it('stores Service Sets in the app data folder, never in a Repo', async () => {
    const { core, billing } = await setup();
    const before = filesUnder(path.join(h.root, 'repos'));

    await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    expect(existsSync(path.join(h.appDataDir, SERVICE_SETS_FILE))).toBe(true);
    expect(filesUnder(path.join(h.root, 'repos'))).toEqual(before);
  });

  it('starts with no Service Sets when the stored file is garbled, and saves over it', async () => {
    writeFileSync(path.join(h.appDataDir, SERVICE_SETS_FILE), '{ "serviceSets": [ { "id": 3 } ] }');
    const { core, billing } = await setup();

    expect(core.snapshot().serviceSets).toEqual([]);
    await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });
    expect((await h.createCore()).snapshot().serviceSets.map((s) => s.name)).toEqual(['Project X']);
  });
});

describe('updateServiceSet', () => {
  it('renames a Service Set and replaces its Services, keeping its id, across a Server restart', async () => {
    const { core, billing, shop } = await setup();
    const created = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    const updated = await core.updateServiceSet({
      id: created.id,
      name: ' Project Y ',
      services: [{ repoId: shop, serviceId: 'web' }],
    });

    const expected = {
      id: created.id,
      name: 'Project Y',
      services: [{ ref: { repoId: shop, serviceId: 'web' }, repoName: 'shop', serviceName: 'web', found: true }],
    };
    expect(updated).toEqual(expected);
    expect(core.snapshot().serviceSets).toEqual([expected]);
    expect((await h.createCore()).snapshot().serviceSets).toEqual([expected]);
  });

  it('tells every client the new list', async () => {
    const { core, billing } = await setup();
    const created = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });
    const events: unknown[] = [];
    core.on('serviceSetsChanged', (e) => events.push(e));

    const updated = await core.updateServiceSet({ id: created.id, name: 'Project Y', services: [{ repoId: billing, serviceId: 'api' }] });

    expect(events).toEqual([{ serviceSets: [updated] }]);
  });

  it('allows its own name, in another case', async () => {
    const { core, billing } = await setup();
    const created = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    const updated = await core.updateServiceSet({ id: created.id, name: 'PROJECT X', services: [{ repoId: billing, serviceId: 'worker' }] });

    expect(updated.name).toBe('PROJECT X');
  });

  it('refuses an empty name, a name another Service Set has, and no Services, changing nothing', async () => {
    const { core, billing } = await setup();
    const api = [{ repoId: billing, serviceId: 'api' }];
    const x = await core.createServiceSet({ name: 'Project X', services: api });
    await core.createServiceSet({ name: 'Support', services: api });
    const before = core.snapshot().serviceSets;
    const events: unknown[] = [];
    core.on('serviceSetsChanged', (e) => events.push(e));

    expect(await codeOf(core.updateServiceSet({ id: x.id, name: ' ', services: api }))).toBe('serviceSetNameEmpty');
    expect(await errorOf(core.updateServiceSet({ id: x.id, name: 'support ', services: api }))).toMatchObject({
      code: 'serviceSetNameTaken',
      params: { name: 'support' },
    });
    expect(await codeOf(core.updateServiceSet({ id: x.id, name: 'Project Y', services: [] }))).toBe('serviceSetEmpty');

    expect(core.snapshot().serviceSets).toEqual(before);
    expect(events).toEqual([]);
  });

  it('refuses an unknown Service Set', async () => {
    const { core, billing } = await setup();

    const code = await codeOf(core.updateServiceSet({ id: 'nope', name: 'X', services: [{ repoId: billing, serviceId: 'api' }] }));

    expect(code).toBe('serviceSetNotFound');
    expect(core.snapshot().serviceSets).toEqual([]);
  });

  it('keeps the remembered names of an entry that is not found when the Set is saved again', async () => {
    const { core, billing } = await setup();
    const api = { repoId: billing, serviceId: 'api' };
    const created = await core.createServiceSet({ name: 'Project X', services: [api] });
    await core.removeRepo(billing);

    const updated = await core.updateServiceSet({ id: created.id, name: 'Project Y', services: [api] });

    expect(updated.services).toEqual([{ ref: api, repoName: 'billing', serviceName: 'Billing API', found: false }]);
  });
});

describe('deleteServiceSet', () => {
  it('deletes a Service Set, tells every client, and it stays deleted across a Server restart', async () => {
    const { core, billing, shop } = await setup();
    const x = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });
    const support = await core.createServiceSet({ name: 'Support', services: [{ repoId: shop, serviceId: 'web' }] });
    const events: unknown[] = [];
    core.on('serviceSetsChanged', (e) => events.push(e));

    await core.deleteServiceSet(x.id);

    expect(core.snapshot().serviceSets).toEqual([support]);
    expect(events).toEqual([{ serviceSets: [support] }]);
    expect((await h.createCore()).snapshot().serviceSets).toEqual([support]);
  });

  it('frees the name for a new Service Set', async () => {
    const { core, billing } = await setup();
    const services = [{ repoId: billing, serviceId: 'api' }];
    const x = await core.createServiceSet({ name: 'Project X', services });

    await core.deleteServiceSet(x.id);

    expect((await core.createServiceSet({ name: 'Project X', services })).name).toBe('Project X');
  });

  it('refuses an unknown Service Set, also when it was just deleted', async () => {
    const { core, billing } = await setup();
    const x = await core.createServiceSet({ name: 'Project X', services: [{ repoId: billing, serviceId: 'api' }] });

    const results = await Promise.allSettled([core.deleteServiceSet(x.id), core.deleteServiceSet(x.id)]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'serviceSetNotFound' } });
    expect(await codeOf(core.updateServiceSet({ id: x.id, name: 'X', services: [{ repoId: billing, serviceId: 'api' }] }))).toBe(
      'serviceSetNotFound',
    );
  });
});

describe('startServiceSet', () => {
  it("starts only the Set's Services that are not running, leaves every other Service alone, and reports nothing when all run", async () => {
    const { core, billing, shop } = await setup();
    await core.startService(billing, 'worker');
    await waitForStatus(core, billing, 'worker', 'running');
    const set = await core.createServiceSet({
      name: 'Project X',
      services: [
        { repoId: billing, serviceId: 'api' },
        { repoId: billing, serviceId: 'worker' },
      ],
    });
    const statuses = recordStatuses(core);
    const reports: unknown[] = [];
    core.on('serviceSetStartReported', (e) => reports.push(e));

    const result = await core.startServiceSet(set.id);

    expect(result).toEqual({ notFound: [], notRunning: [] });
    expect(statusOf(core, billing, 'api')).toBe('running');
    expect(statusOf(core, shop, 'web')).toBe('stopped');
    expect(statuses).toEqual(['api:starting', 'api:running']);
    expect(reports).toEqual([]);
  });

  it('starts the dependencies of its Services, as Start does', async () => {
    h.addRepo({ name: 'billing', config: { services: [idle('db'), { ...idle('api'), dependsOn: ['db'] }] } });
    const core = await h.createCore();
    const billing = core.listRepos()[0]!.id;
    const set = await core.createServiceSet({ name: 'API', services: [{ repoId: billing, serviceId: 'api' }] });

    expect(await core.startServiceSet(set.id)).toEqual({ notFound: [], notRunning: [] });
    expect(statusOf(core, billing, 'db')).toBe('running');
    expect(statusOf(core, billing, 'api')).toBe('running');
  });

  it('reports a Service that crashes and one whose port is taken, and still starts the rest', async () => {
    const port = await freePort();
    await spawnListener(port);
    h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', name: 'Billing API', command: fixtureCommand('exit-after.mjs', 100, 3) },
          { id: 'web', port, command: fixtureCommand('listen.mjs', port) },
          idle('worker'),
        ],
      },
    });
    const core = await h.createCore();
    const billing = core.listRepos()[0]!.id;
    const refs = ['api', 'web', 'worker'].map((serviceId) => ({ repoId: billing, serviceId }));
    const set = await core.createServiceSet({ name: 'Project X', services: refs });
    const reports: unknown[] = [];
    core.on('serviceSetStartReported', (e) => reports.push(e));

    const result = await core.startServiceSet(set.id);

    expect(result).toEqual({ notFound: [], notRunning: [refs[0], refs[1]] });
    expect(statusOf(core, billing, 'api')).toBe('crashed');
    expect(statusOf(core, billing, 'web')).toBe('stopped');
    expect(statusOf(core, billing, 'worker')).toBe('running');
    expect(reports).toEqual([
      {
        id: set.id,
        name: 'Project X',
        notFound: [],
        notRunning: [
          { ref: refs[0], repoName: 'billing', serviceName: 'Billing API' },
          { ref: refs[1], repoName: 'billing', serviceName: 'web' },
        ],
      },
    ]);
  });

  it('skips an entry whose Service is not found and starts the rest', async () => {
    const { core, billing } = await setup();
    const set = await core.createServiceSet({
      name: 'Project X',
      services: [
        { repoId: billing, serviceId: 'gone' },
        { repoId: billing, serviceId: 'api' },
      ],
    });

    const result = await core.startServiceSet(set.id);

    expect(result.notRunning).toEqual([]);
    expect(statusOf(core, billing, 'api')).toBe('running');
  });

  it('refuses a Service Set that does not exist', async () => {
    const { core } = await setup();

    expect(await codeOf(core.startServiceSet('no-such-set'))).toBe('serviceSetNotFound');
  });
});

/** Spawns a `node listen.mjs <port>` outside DevPanel (owned by this test) and waits until it listens. */
async function spawnListener(port: number): Promise<void> {
  const child = spawn(process.execPath, [path.join(FIXTURES, 'listen.mjs'), String(port), 'any'], { stdio: 'pipe' });
  children.push(child);
  await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
}

/** Records `<serviceId>:<status>` for every status change, in order. */
function recordStatuses(core: DevPanelCore): string[] {
  const log: string[] = [];
  core.on('statusChanged', (e) => log.push(`${e.serviceId}:${e.status}`));
  return log;
}

function statusOf(core: DevPanelCore, repoId: string, serviceId: string): string | undefined {
  return core.listRepos().find((r) => r.id === repoId)?.services.find((s) => s.id === serviceId)?.status;
}

async function errorOf(promise: Promise<unknown>): Promise<DevPanelError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DevPanelError) return err;
    throw err;
  }
  throw new Error('Expected a DevPanelError');
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  return (await errorOf(promise)).code;
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' }).sort();
}
