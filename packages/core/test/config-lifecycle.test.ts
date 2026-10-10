import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { localConfigPath, type DevPanelCore, type RepoView } from '../src/index.js';
import { Harness, fixtureCommand } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

function pkg(dir: string, name: string, scripts: Record<string, string>): void {
  writeJson(path.join(dir, 'package.json'), { name, scripts });
}

describe('auto-detection', () => {
  it('suggests dev/start/serve scripts of pnpm workspace packages as pnpm --filter commands', async () => {
    const repoPath = h.addRepo({ name: 'shop' });
    writeFileSync(path.join(repoPath, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'libs/ui'\n");
    pkg(repoPath, 'shop-root', { dev: 'pnpm -r dev', lint: 'eslint .' });
    pkg(path.join(repoPath, 'apps', 'api'), '@shop/api', { dev: 'tsx watch', build: 'tsc', start: 'node dist' });
    pkg(path.join(repoPath, 'apps', 'web'), '@shop/web', { serve: 'ng serve', test: 'vitest' });
    pkg(path.join(repoPath, 'libs', 'ui'), '@shop/ui', { build: 'tsc' });

    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    expect(repo.configSource).toBe('none');
    expect(repo.services).toEqual([]);
    expect(repo.suggestions!.map((s) => s.command).sort()).toEqual([
      'pnpm --filter @shop/api dev',
      'pnpm --filter @shop/api start',
      'pnpm --filter @shop/web serve',
    ]);
    const ids = repo.suggestions!.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('suggests root package.json scripts when there is no pnpm-workspace.yaml', async () => {
    const repoPath = h.addRepo({ name: 'site' });
    pkg(repoPath, 'site', { dev: 'vite', build: 'vite build' });

    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    expect(repo.suggestions!.map((s) => [s.id, s.command, s.preselected])).toEqual([
      ['dev', 'pnpm run dev', true],
      ['build', 'pnpm run build', false],
    ]);
  });

  it('suggests nothing for a Repo with a Repo Config', async () => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'a' }] } });
    pkg(repoPath, 'billing', { dev: 'vite' });

    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    expect(repo.configSource).toBe('repo');
    expect(repo.suggestions).toBeUndefined();
  });
});

/** Every file in a folder (recursively) with its size and mtime, to prove nothing changed. */
function folderState(dir: string): Record<string, string> {
  const state: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true }) as string[]) {
    const s = statSync(path.join(dir, name));
    state[name] = `${s.isDirectory() ? 'dir' : s.size}:${s.mtimeMs}`;
  }
  return state;
}

function repoNamed(core: DevPanelCore, name: string): RepoView {
  return core.listRepos().find((r) => r.name === name)!;
}

/** Resolves with the first `configChanged` Repo view of `name` that satisfies `predicate`. */
function configChange(
  core: DevPanelCore,
  name: string,
  predicate: (repo: RepoView) => boolean = () => true,
  timeoutMs = 10_000,
): Promise<RepoView> {
  return new Promise((resolve, reject) => {
    const seen: RepoView[] = [];
    const onChange = ({ repo }: { repo: RepoView }) => {
      if (repo.name !== name) return;
      seen.push(repo);
      if (predicate(repo)) {
        cleanup();
        resolve(repo);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No matching configChanged for ${name}; saw:\n${JSON.stringify(seen, null, 2)}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      core.off('configChanged', onChange);
    };
    core.on('configChanged', onChange);
  });
}

describe('Local Config', () => {
  it('saveLocalConfig stores the chosen Services in the app data directory and leaves the Repo folder unchanged', async () => {
    const repoPath = h.addRepo({ name: 'site' });
    pkg(repoPath, 'site', { dev: 'vite', build: 'vite build' });
    const core = await h.createCore();
    const before = folderState(repoPath);
    const repoId = repoNamed(core, 'site').id;

    await core.saveLocalConfig(repoId, [{ id: 'dev', name: 'Dev server', command: 'pnpm run dev' }]);

    expect(folderState(repoPath)).toEqual(before);
    const repo = repoNamed(core, 'site');
    expect(repo.configSource).toBe('local');
    expect(repo.suggestions).toBeUndefined();
    expect(repo.services.map((s) => [s.id, s.name, s.command, s.status])).toEqual([
      ['dev', 'Dev server', 'pnpm run dev', 'stopped'],
    ]);

    // A fresh core (next DevPanel start) finds the Local Config again.
    const next = await h.createCore();
    expect(repoNamed(next, 'site').services.map((s) => s.id)).toEqual(['dev']);
  });

  it('rejects a Local Config with duplicate Service ids', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    await expect(
      core.saveLocalConfig(repoNamed(core, 'site').id, [
        { id: 'dev', command: 'a' },
        { id: 'dev', command: 'b' },
      ]),
    ).rejects.toMatchObject({ code: 'configInvalid' });
  });

  it('uses only the Repo Config once one appears, and offers to delete the Local Config', async () => {
    const repoPath = h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [
      { id: 'dev', command: 'pnpm run dev' },
      { id: 'docs', command: 'pnpm run docs' },
    ]);

    const changed = configChange(core, 'site', (r) => r.configSource === 'repo');
    writeFileSync(path.join(repoPath, '.devpanel.yml'), 'services:\n  - id: dev\n    command: pnpm dev --open\n');
    const repo = await changed;

    expect(repo.services.map((s) => [s.id, s.command])).toEqual([['dev', 'pnpm dev --open']]);
    expect(repo.unusedLocalConfig).toBe(true);

    await core.deleteLocalConfig(repoId);
    expect(repoNamed(core, 'site').unusedLocalConfig).toBeUndefined();
    expect(repoNamed(core, 'site').services.map((s) => s.id)).toEqual(['dev']);
  });
});

describe('watching the config', () => {
  function writeConfig(repoPath: string, services: unknown[]): void {
    writeFileSync(path.join(repoPath, '.devpanel.yml'), stringify({ services }));
  }

  it('gives stopped Services the new definition and flags running ones until they are restarted', async () => {
    const idle = fixtureCommand('echo-stdin.mjs');
    const repoPath = h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', command: idle },
          { id: 'web', command: 'old web' },
        ],
      },
    });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'billing').id;
    await core.startService(repoId, 'api');
    await h.waitForOutput(core, repoId, 'api', /ECHO_READY/);

    const changed = configChange(core, 'billing', (r) => r.services.some((s) => s.command === 'new web'));
    writeConfig(repoPath, [
      { id: 'api', command: `${idle} --changed` },
      { id: 'web', command: 'new web' },
    ]);
    const repo = await changed;

    const api = repo.services.find((s) => s.id === 'api')!;
    expect(api.command).toBe(idle);
    expect(api.configChanged).toBe(true);
    expect(repo.services.find((s) => s.id === 'web')!.configChanged).toBeUndefined();

    const settled = configChange(core, 'billing', (r) => r.services.find((s) => s.id === 'api')!.configChanged !== true);
    await core.stopService(repoId, 'api');
    const after = (await settled).services.find((s) => s.id === 'api')!;
    expect(after.command).toBe(`${idle} --changed`);
    expect(after.status).toBe('stopped');
  });

  it('keeps a running Service removed from the config listed until it is stopped', async () => {
    const idle = fixtureCommand('echo-stdin.mjs');
    const repoPath = h.addRepo({
      name: 'billing',
      config: {
        services: [
          { id: 'api', command: idle },
          { id: 'job', command: 'job' },
          { id: 'web', command: 'web' },
        ],
      },
    });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'billing').id;
    await core.startService(repoId, 'api');
    await h.waitForOutput(core, repoId, 'api', /ECHO_READY/);

    const changed = configChange(core, 'billing', (r) => !r.services.some((s) => s.id === 'job'));
    writeConfig(repoPath, [{ id: 'web', command: 'web' }]);
    const repo = await changed;

    expect(repo.services.map((s) => [s.id, s.removedFromConfig])).toEqual([
      ['web', undefined],
      ['api', true],
    ]);

    const gone = configChange(core, 'billing', (r) => !r.services.some((s) => s.id === 'api'));
    await core.stopService(repoId, 'api');
    expect((await gone).services.map((s) => s.id)).toEqual(['web']);
  });

  it('shows an error for an invalid config while the last valid config stays active', async () => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'a' }] } });
    const core = await h.createCore();

    const broken = configChange(core, 'billing', (r) => r.configError !== undefined);
    writeFileSync(path.join(repoPath, '.devpanel.yml'), 'services:\n  - id: api\n    command: [unclosed\n');
    const repo = await broken;
    expect(repo.configError).toMatch(/YAML/);
    expect(repo.services.map((s) => [s.id, s.command])).toEqual([['api', 'a']]);

    const fixed = configChange(core, 'billing', (r) => r.configError === undefined);
    writeConfig(repoPath, [{ id: 'api', command: 'b' }]);
    expect((await fixed).services.map((s) => s.command)).toEqual(['b']);
  });

  it.each([
    ['duplicate ids', [{ id: 'api', command: 'a' }, { id: 'api', command: 'b' }], /Duplicate Service id "api"/],
    ['duplicate ports', [{ id: 'api', command: 'a', port: 3000 }, { id: 'web', command: 'b', port: 3000 }], /Port 3000/],
    ['unknown dependsOn', [{ id: 'api', command: 'a', dependsOn: ['db'] }], /depends on "db"/],
  ])('reports %s on the Repo', async (_case, services, error) => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'a' }] } });
    const core = await h.createCore();

    const broken = configChange(core, 'billing', (r) => r.configError !== undefined);
    writeConfig(repoPath, services);
    expect((await broken).configError).toMatch(error);
    expect(repoNamed(core, 'billing').services.map((s) => s.command)).toEqual(['a']);
  });

  it('notices edits of the Local Config file', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repo = repoNamed(core, 'site');
    await core.saveLocalConfig(repo.id, [{ id: 'dev', command: 'one' }]);

    const changed = configChange(core, 'site', (r) => r.services[0]?.command === 'two');
    writeFileSync(localConfigPath(h.appDataDir, repo.path), stringify({ services: [{ id: 'dev', command: 'two' }] }));
    await changed;
  });
});
