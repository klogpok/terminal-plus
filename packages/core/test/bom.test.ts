/**
 * JSON files saved with a UTF-8 byte order mark (Notepad, PowerShell 5.1 `Out-File`/`Set-Content
 * -Encoding utf8`) are read like any other: the Workspace file, a Repo's package.json for
 * auto-detection, and the PID file.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PID_FILE, WORKSPACE_FILE, listProcesses } from '../src/index.js';
import { Harness } from './harness.js';

const BOM = String.fromCharCode(0xfeff);

let h: Harness;
const children: ChildProcess[] = [];
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
});

function prependBom(file: string): void {
  writeFileSync(file, BOM + readFileSync(file, 'utf8'));
}

describe('JSON files with a UTF-8 BOM', () => {
  it('a Workspace file with a BOM loads its Repos', async () => {
    h.addRepo({ name: 'Billing', config: { services: [{ id: 'api', command: 'a' }] } });
    prependBom(path.join(h.appDataDir, WORKSPACE_FILE));

    const core = await h.createCore();

    expect(core.listRepos().map((r) => r.name)).toEqual(['Billing']);
  });

  it('a package.json with a BOM is used for auto-detection', async () => {
    const repoPath = h.addRepo({ name: 'site', files: { 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" } });
    writeFileSync(path.join(repoPath, 'package.json'), BOM + JSON.stringify({ name: 'site', scripts: { dev: 'vite' } }));

    const core = await h.createCore();

    expect(core.listRepos()[0]!.suggestions!.map((s) => s.command)).toEqual(['pnpm run dev']);
  });

  it('a PID file with a BOM still reports its Orphans', async () => {
    h.addRepo({ name: 'Billing', config: { services: [] } });
    // A process spawned by this test stands in for a Service left over from a crashed Server.
    const leftOver = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    children.push(leftOver);
    const pid = leftOver.pid!;
    const createdAt = (await listProcesses()).get(pid)!.createdAt;
    writeFileSync(
      path.join(h.appDataDir, PID_FILE),
      BOM +
        JSON.stringify({
          processes: [
            {
              pid,
              createdAt,
              runId: 'old-run',
              repoId: 'abc',
              repoName: 'Billing',
              owner: { kind: 'service', serviceId: 'api', serviceName: 'API' },
            },
          ],
        }),
    );

    const core = await h.createCore();

    expect(core.listOrphans()).toEqual([expect.objectContaining({ id: 'old-run', pids: [pid] })]);
  });
});
