import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import { SERVICE_SETS_FILE } from '../src/index.js';
import { Harness, fixtureCommand } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
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
