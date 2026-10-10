/**
 * The real desktop app: Electron runs the bundled main process (`dist/main.cjs`, built by the
 * `test` script) with a temporary app data directory and a random port (never 7777), started
 * `--hidden` so no window pops up. Proves that node-pty works under the Electron ABI, that Exit
 * stops every process, that a second launch does not start a second Server, and that a forced kill
 * leaves nothing undetected. Every process killed here was spawned by this test.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelCore, PID_FILE } from '@devpanel/core';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

let root: string;
let appDataDir: string;
let port: number;
const apps: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const extraPids: number[] = [];

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port: p } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return p;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

function launchApp(): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env, DEVPANEL_APP_DATA: appDataDir, DEVPANEL_PORT: String(port) };
  // Set when the tests run inside an Electron-based host (VS Code): Electron would run as plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  // DEVPANEL_DESKTOP_EXE=<...\release\win-unpacked\DevPanel.exe> runs these tests against the packaged app.
  const packaged = process.env.DEVPANEL_DESKTOP_EXE;
  const child = packaged
    ? spawn(packaged, ['--hidden'], { env, stdio: 'pipe' })
    : spawn(electronPath as unknown as string, [desktopDir, '--hidden'], { env, stdio: 'pipe' });
  child.stdout?.resume();
  child.stderr?.resume();
  apps.push(child);
  return child;
}

const exited = (child: ChildProcess): Promise<number | null> =>
  child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise((resolve) => child.once('exit', resolve));

async function hello(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/hello`);
    return response.ok;
  } catch {
    return false;
  }
}

interface Reply {
  kind: 'reply';
  id: number;
  ok: boolean;
  result?: unknown;
}

async function connect(): Promise<(type: string, payload: object) => Promise<Reply>> {
  const key = readFileSync(path.join(appDataDir, 'access-key'), 'utf8').trim();
  // The Server accepts only its own page's Origin, as the app window sends it.
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?key=${encodeURIComponent(key)}`, {
    origin: `http://127.0.0.1:${port}`,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const replies = new Map<number, (reply: Reply) => void>();
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as { kind: string; id?: number };
    if (message.kind === 'reply') replies.get(message.id!)?.(message as Reply);
  });
  let nextId = 1;
  return (type, payload) =>
    new Promise((resolve) => {
      const id = nextId++;
      replies.set(id, resolve);
      socket.send(JSON.stringify({ kind: 'command', id, type, payload }));
    });
}

function recordedPids(): number[] {
  const file = path.join(appDataDir, PID_FILE);
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as { processes: { pid: number }[] }).processes.map((p) => p.pid);
}

/** Starts the app, a Service (a node process with a grandchild) and a shell Session through it. */
async function startAppWithProcesses() {
  const app = launchApp();
  await waitUntil(hello, 'the desktop app to serve /api/hello');
  const send = await connect();
  const snapshot = (await send('getSnapshot', {})) as Reply & { result: { repos: { id: string }[] } };
  const repoId = snapshot.result.repos[0]!.id;
  expect(await send('startService', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
  expect(await send('openTerminal', { repoId })).toMatchObject({ ok: true });
  // node-pty spawned inside Electron; the Service's tree (cmd, node, grandchild node) and the shell are recorded.
  await waitUntil(() => recordedPids().length >= 4, 'the Service and Session processes to be recorded');
  return { app, send, pids: recordedPids() };
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-desktop-test-'));
  appDataDir = path.join(root, 'appdata');
  const repo = path.join(root, 'billing');
  mkdirSync(appDataDir);
  mkdirSync(repo);
  writeFileSync(
    path.join(repo, '.devpanel.yml'),
    `services:\n  - id: api\n    name: API\n    command: '"${process.execPath}" "${fixture('spawn-grandchild.mjs')}"'\n`,
  );
  writeFileSync(path.join(appDataDir, 'workspace.json'), JSON.stringify({ repos: [{ path: repo, name: 'Billing' }] }));
  port = await freePort();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const app of apps.splice(0)) {
    if (app.exitCode === null && app.signalCode === null) {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(app.pid)]);
      await exited(app);
    }
  }
  for (const pid of [...recordedPids(), ...extraPids.splice(0)]) {
    if (isAlive(pid)) spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)]);
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

describe('Electron desktop app', () => {
  it('runs Services and Sessions through node-pty, and Exit stops them all and ends the app', async () => {
    const { app, send, pids } = await startAppWithProcesses();
    expect(pids.every(isAlive)).toBe(true);

    expect(await send('shutdown', {})).toMatchObject({ ok: true });
    expect(await exited(app)).toBe(0);
    expect(pids.filter(isAlive)).toEqual([]);
    expect(recordedPids()).toEqual([]);
  });

  it('a second launch exits at once and leaves the running app alone', async () => {
    const { app, send } = await startAppWithProcesses();
    const second = launchApp();
    expect(await exited(second)).toBe(0);
    expect(app.exitCode).toBeNull();
    expect(await hello()).toBe(true);
    await send('shutdown', {});
    await exited(app);
  });

  it('after a forced kill, every recorded process still alive is found as an Orphan on the next start', async () => {
    const { app, pids } = await startAppWithProcesses();
    spawnSync('taskkill', ['/F', '/PID', String(app.pid)]);
    await exited(app);
    await new Promise((r) => setTimeout(r, 3_000));

    const core = new DevPanelCore({ appDataDir });
    await core.load();
    const survivors = pids.filter(isAlive);
    extraPids.push(...survivors);
    const orphanPids = core.listOrphans().flatMap((o) => o.pids);
    for (const pid of survivors) expect(orphanPids).toContain(pid);
    await core.killOrphans();
    expect(pids.filter(isAlive)).toEqual([]);
    await core.shutdown();
  });
});
