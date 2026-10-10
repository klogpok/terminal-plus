import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Harness } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

describe('loading the Workspace and Repo Configs', () => {
  it('lists Repos from the Workspace file with Services from each Repo Config', async () => {
    const billingPath = h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', name: 'API', command: 'pnpm dev', port: 3000 },
          { id: 'web', command: 'pnpm start', port: 4200, dependsOn: ['api'] },
        ],
      },
    });
    h.addRepo({ name: 'docs', config: { services: [{ id: 'watch', command: 'pnpm watch' }] } });

    const core = await h.createCore();
    const repos = core.listRepos();

    expect(repos.map((r) => r.name)).toEqual(['billing', 'docs']);
    const billing = repos[0]!;
    expect(billing.path).toBe(billingPath);
    expect(billing.configError).toBeUndefined();
    expect(billing.services.map((s) => [s.id, s.name, s.port, s.status])).toEqual([
      ['api', 'API', 3000, 'stopped'],
      ['web', 'web', 4200, 'stopped'],
    ]);
    expect(repos[1]!.services.map((s) => s.id)).toEqual(['watch']);
  });

  it('starts with an empty Workspace when there is no Workspace file', async () => {
    const core = await h.createCore();
    expect(core.listRepos()).toEqual([]);
  });

  it('reports a Repo-level error for duplicate Service ids', async () => {
    h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', command: 'a' },
          { id: 'api', command: 'b' },
        ],
      },
    });
    const core = await h.createCore();
    const [repo] = core.listRepos();
    expect(repo!.configError).toMatch(/api/);
    expect(repo!.services).toEqual([]);
  });

  it('reports a Repo-level error for duplicate ports', async () => {
    h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', command: 'a', port: 3000 },
          { id: 'web', command: 'b', port: 3000 },
        ],
      },
    });
    const core = await h.createCore();
    expect(core.listRepos()[0]!.configError).toMatch(/3000/);
  });

  it('reports a Repo-level error when dependsOn names a Service not in the same Repo', async () => {
    h.addRepo({ name: 'auth', config: { services: [{ id: 'login', command: 'a' }] } });
    h.addRepo({
      name: 'billing',
      config: { services: [{ id: 'api', command: 'a', dependsOn: ['login'] }] },
    });
    const core = await h.createCore();
    const billing = core.listRepos().find((r) => r.name === 'billing')!;
    expect(billing.configError).toMatch(/login/);
    expect(core.listRepos().find((r) => r.name === 'auth')!.configError).toBeUndefined();
  });

  it('reports a Repo-level error for an invalid Repo Config', async () => {
    h.addRepo({ name: 'billing', configText: 'services:\n  - id: api\n' });
    const core = await h.createCore();
    expect(core.listRepos()[0]!.configError).toMatch(/command/);
  });

  it('reports a Repo-level error when readyPattern is not a valid regular expression', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'x', readyPattern: 'ready (' }] } });
    const core = await h.createCore();
    expect(core.listRepos()[0]!.configError).toMatch(/readyPattern/);
  });

  it('allows Services without port, healthUrl or readyPattern', async () => {
    h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'worker', command: 'a' },
          { id: 'api', command: 'b', port: 3000, readyPattern: 'ready', healthUrl: 'http://localhost:3000' },
        ],
      },
    });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    expect(repo.configError).toBeUndefined();
    expect(repo.services).toHaveLength(2);
  });
});
