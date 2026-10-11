import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { localConfigPath, type DevPanelCore, type RepoView } from '../src/index.js';
import { Harness, fixtureCommand } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
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

function localConfigOf(repo: RepoView): unknown {
  return parse(readFileSync(localConfigPath(h.appDataDir, repo.path), 'utf8'));
}

/** A pnpm Repo with a `dev` and a `build` script. */
function pnpmRepo(name: string): string {
  const repoPath = h.addRepo({ name, files: { 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" } });
  writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({ name, scripts: { dev: 'vite', build: 'vite build' } }));
  return repoPath;
}

describe('adding a Service to the Local Config', () => {
  it('writes it to the Local Config only, with an id from its name, and lists it as stopped', async () => {
    const repoPath = pnpmRepo('site');
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [{ id: 'dev', name: 'Dev server', command: 'pnpm run dev' }]);
    const before = folderState(repoPath);

    await core.addLocalService(repoId, { name: 'Docs Site', command: 'pnpm run docs', port: 4100 });

    expect(folderState(repoPath)).toEqual(before);
    const repo = repoNamed(core, 'site');
    expect(repo.services.map((s) => [s.id, s.name, s.command, s.port, s.status])).toEqual([
      ['dev', 'Dev server', 'pnpm run dev', undefined, 'stopped'],
      ['docs-site', 'Docs Site', 'pnpm run docs', 4100, 'stopped'],
    ]);
    expect(localConfigOf(repo)).toEqual({
      services: [
        { id: 'dev', name: 'Dev server', command: 'pnpm run dev' },
        { id: 'docs-site', name: 'Docs Site', command: 'pnpm run docs', port: 4100 },
      ],
    });
  });

  it('keeps generated ids unique', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [{ id: 'dev', name: 'Dev server', command: 'a' }]);

    await core.addLocalService(repoId, { name: 'dev', command: 'b' });
    await core.addLocalService(repoId, { name: 'Сервер', command: 'c' });

    expect(repoNamed(core, 'site').services.map((s) => s.id)).toEqual(['dev', 'dev-2', 'service']);
  });

  it('creates the Local Config in a Repo without any config; the Repo folder stays unchanged', async () => {
    const repoPath = h.addRepo({ name: 'npm-site', files: { 'package-lock.json': '{}' } });
    const core = await h.createCore();
    const before = folderState(repoPath);
    expect(repoNamed(core, 'npm-site').suggestions).toEqual([]);

    await core.addLocalService(repoNamed(core, 'npm-site').id, { name: 'Web', command: 'npm run dev' });

    expect(folderState(repoPath)).toEqual(before);
    const repo = repoNamed(core, 'npm-site');
    expect(repo.configSource).toBe('local');
    expect(repo.services.map((s) => [s.id, s.status])).toEqual([['web', 'stopped']]);
  });

  it('still offers the auto-detected scripts once the Local Config exists', async () => {
    pnpmRepo('site');
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [{ id: 'dev', command: 'pnpm run dev' }]);

    expect(repoNamed(core, 'site').suggestions!.map((s) => s.command)).toEqual(['pnpm run dev', 'pnpm run build']);
  });

  it.each([
    ['an empty name', { name: '  ', command: 'x' }, { field: 'name', problem: 'required' }],
    ['an empty command', { name: 'Docs', command: ' ' }, { field: 'command', problem: 'required' }],
    ['a name in use', { name: 'dev server', command: 'x' }, { field: 'name', problem: 'nameTaken', name: 'dev server' }],
    ['a port in use', { name: 'Docs', command: 'x', port: 3000 }, { field: 'port', problem: 'portUsed', port: 3000, serviceName: 'Web' }],
    ['a bad port', { name: 'Docs', command: 'x', port: 70000 }, { field: 'port', problem: 'invalid' }],
    ['a bad url', { name: 'Docs', command: 'x', url: 'localhost' }, { field: 'url', problem: 'invalid' }],
    ['a bad readyPattern', { name: 'Docs', command: 'x', readyPattern: '(' }, { field: 'readyPattern', problem: 'invalid' }],
    ['an unknown dependency', { name: 'Docs', command: 'x', dependsOn: ['db'] }, { field: 'dependsOn', problem: 'invalid' }],
  ])('rejects %s next to the field and saves nothing', async (_case, service, params) => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repo = repoNamed(core, 'site');
    await core.saveLocalConfig(repo.id, [{ id: 'dev', name: 'Dev server', command: 'a' }]);
    await core.addLocalService(repo.id, { name: 'Web', command: 'w', port: 3000 });
    const saved = localConfigOf(repo);

    await expect(core.addLocalService(repo.id, service)).rejects.toMatchObject({
      code: 'serviceInvalid',
      params: { repoName: 'site', ...params },
    });
    expect(localConfigOf(repo)).toEqual(saved);
    expect(repoNamed(core, 'site').services.map((s) => s.id)).toEqual(['dev', 'web']);
  });

  it('accepts a dependency on another Service', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [{ id: 'db', command: 'a' }]);

    await core.addLocalService(repoId, { name: 'API', command: 'b', dependsOn: ['db'] });

    expect(repoNamed(core, 'site').services.find((s) => s.id === 'api')!.dependsOn).toEqual(['db']);
  });
});

describe('removing a Service from the Local Config', () => {
  it('removes a stopped Service', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [
      { id: 'dev', command: 'a' },
      { id: 'docs', command: 'b' },
    ]);

    await core.removeLocalService(repoId, 'docs');

    const repo = repoNamed(core, 'site');
    expect(repo.services.map((s) => s.id)).toEqual(['dev']);
    expect(localConfigOf(repo)).toEqual({ services: [{ id: 'dev', command: 'a' }] });
  });

  it('stops a running Service, then removes it', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [
      { id: 'api', command: fixtureCommand('echo-stdin.mjs') },
      { id: 'web', command: 'b' },
    ]);
    await core.startService(repoId, 'api');
    await h.waitForOutput(core, repoId, 'api', /ECHO_READY/);

    await core.removeLocalService(repoId, 'api');

    expect(repoNamed(core, 'site').services.map((s) => s.id)).toEqual(['web']);
  });

  it('drops the removed Service from the dependsOn of the others', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [
      { id: 'db', command: 'a' },
      { id: 'cache', command: 'b' },
    ]);
    await core.addLocalService(repoId, { name: 'api', command: 'c', dependsOn: ['db', 'cache'] });
    await core.addLocalService(repoId, { name: 'jobs', command: 'd', dependsOn: ['db'] });

    await core.removeLocalService(repoId, 'db');

    const repo = repoNamed(core, 'site');
    expect(repo.services.map((s) => [s.id, s.dependsOn])).toEqual([
      ['cache', []],
      ['api', ['cache']],
      ['jobs', []],
    ]);
    expect(localConfigOf(repo)).toEqual({
      services: [
        { id: 'cache', command: 'b' },
        { id: 'api', name: 'api', command: 'c', dependsOn: ['cache'] },
        { id: 'jobs', name: 'jobs', command: 'd' },
      ],
    });
  });

  it('deletes the Local Config with its last Service and offers the auto-detected scripts again', async () => {
    const repoPath = pnpmRepo('site');
    const core = await h.createCore();
    const repo = repoNamed(core, 'site');
    await core.saveLocalConfig(repo.id, [{ id: 'dev', command: 'pnpm run dev' }]);
    const before = folderState(repoPath);

    await core.removeLocalService(repo.id, 'dev');

    expect(existsSync(localConfigPath(h.appDataDir, repo.path))).toBe(false);
    expect(folderState(repoPath)).toEqual(before);
    const after = repoNamed(core, 'site');
    expect(after.configSource).toBe('none');
    expect(after.services).toEqual([]);
    expect(after.suggestions!.map((s) => s.command)).toEqual(['pnpm run dev', 'pnpm run build']);
  });

  it('reports an unknown Service', async () => {
    h.addRepo({ name: 'site' });
    const core = await h.createCore();
    const repoId = repoNamed(core, 'site').id;
    await core.saveLocalConfig(repoId, [{ id: 'dev', command: 'a' }]);

    await expect(core.removeLocalService(repoId, 'nope')).rejects.toMatchObject({ code: 'serviceNotFound' });
  });
});

describe('a Repo with a Repo Config', () => {
  it('refuses to add or remove Services', async () => {
    const repoPath = h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: 'a' }] } });
    const core = await h.createCore();
    const repo = repoNamed(core, 'billing');
    const before = folderState(repoPath);

    await expect(core.addLocalService(repo.id, { name: 'Web', command: 'b' })).rejects.toMatchObject({
      code: 'repoConfigInUse',
    });
    await expect(core.removeLocalService(repo.id, 'api')).rejects.toMatchObject({ code: 'repoConfigInUse' });

    expect(folderState(repoPath)).toEqual(before);
    expect(existsSync(localConfigPath(h.appDataDir, repo.path))).toBe(false);
    expect(repoNamed(core, 'billing').services.map((s) => [s.id, s.status])).toEqual([['api', 'stopped']]);
  });
});
