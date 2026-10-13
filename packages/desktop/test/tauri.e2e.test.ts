/**
 * The built Tauri app (optional): runs only when DEVPANEL_DESKTOP_EXE points at a built or
 * installed DevPanel.exe (`pnpm desktop:dist`, then the installed `%LOCALAPPDATA%\DevPanel\DevPanel.exe`
 * or `src-tauri\target\release\DevPanel.exe`), and is skipped otherwise. It proves what only the
 * real shell guarantees: a second launch exits and leaves the running app alone, killing the shell
 * kills the sidecar and every Service and Session (Job Object), and Exit through the UI ends the app.
 *
 * The app runs `--hidden` with a temporary app data directory, a random port (never 7777) and a
 * PATH without Node or other developer tools, so it uses the node.exe it ships. Every process
 * killed here was spawned by this test.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PID_FILE } from '@devpanel/core';
import { freePort, isAlive, waitUntil } from './processes.js';

const exe = process.env.DEVPANEL_DESKTOP_EXE;
const fixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

let root: string;
let appDataDir: string;
let port: number;
const apps: ChildProcess[] = [];
const sockets: WebSocket[] = [];

/** Only Windows itself on PATH (PowerShell lists processes for core): no Node, no pnpm, no Git. */
function windowsOnlyPath(): string {
  const windows = process.env.SystemRoot ?? 'C:\\Windows';
  return [`${windows}\\System32`, windows, `${windows}\\System32\\WindowsPowerShell\\v1.0`].join(';');
}

function launchApp(): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: windowsOnlyPath(),
    DEVPANEL_APP_DATA: appDataDir,
    DEVPANEL_PORT: String(port),
  };
  delete env.Path;
  const child = spawn(exe!, ['--hidden'], { env, stdio: 'pipe' });
  child.stdout?.resume();
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  apps.push(child);
  return child;
}

const exited = (child: ChildProcess): Promise<number | null> =>
  child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise((resolve) => child.once('exit', resolve));

/** The PIDs of the shipped node.exe (beside the shell) that are running: the sidecars. */
function sidecarPids(): number[] {
  const nodeExe = path.join(path.dirname(exe!), 'node.exe');
  return processIds('node.exe', `$_.ExecutablePath -eq '${nodeExe.replace(/'/g, "''")}'`);
}

/** The WebView2 processes of this test's app: their profile is in the temporary app data directory. */
function webViewPids(): number[] {
  return processIds('msedgewebview2.exe', `$_.CommandLine -like '*${root.replace(/'/g, "''")}*'`);
}

function processIds(name: string, where: string): number[] {
  const script =
    `@(Get-CimInstance Win32_Process -Filter "Name='${name}'" | ` +
    `Where-Object { ${where} } | ForEach-Object { $_.ProcessId }) -join ','`;
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  return result.stdout.trim().split(',').filter(Boolean).map(Number);
}

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
  await waitUntil(hello, 'the built app to serve /api/hello');
  const send = await connect();
  const snapshot = (await send('getSnapshot', {})) as Reply & { result: { repos: { id: string }[] } };
  const repoId = snapshot.result.repos[0]!.id;
  expect(await send('startService', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
  expect(await send('openTerminal', { repoId })).toMatchObject({ ok: true });
  // node-pty in the shipped sidecar; the Service's tree (cmd, node, grandchild node) and the shell are recorded.
  await waitUntil(() => recordedPids().length >= 4, 'the Service and Session processes to be recorded');
  return { app, send, pids: recordedPids() };
}

beforeEach(async () => {
  if (!exe) return;
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-tauri-test-'));
  appDataDir = path.join(root, 'appdata');
  const repo = path.join(root, 'billing');
  mkdirSync(appDataDir);
  mkdirSync(repo);
  // The Service names the test's Node by its full path: the app itself has no Node on PATH.
  writeFileSync(
    path.join(repo, '.devpanel.yml'),
    `services:\n  - id: api\n    name: API\n    command: '"${process.execPath}" "${fixture('spawn-grandchild.mjs')}"'\n`,
  );
  writeFileSync(path.join(appDataDir, 'workspace.json'), JSON.stringify({ repos: [{ path: repo, name: 'Billing' }] }));
  port = await freePort();
});

afterEach(async () => {
  if (!exe) return;
  for (const socket of sockets.splice(0)) socket.close();
  for (const app of apps.splice(0)) {
    if (app.exitCode === null && app.signalCode === null) {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(app.pid)]);
      await exited(app);
    }
  }
  for (const pid of recordedPids()) {
    if (isAlive(pid)) spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)]);
  }
  // WebView2 outlives the shell for a few seconds and keeps its profile folder open meanwhile.
  await waitUntil(() => webViewPids().length === 0, 'WebView2 to end', 15_000).catch(() => {
    for (const pid of webViewPids()) spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)]);
  });
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

describe.skipIf(!exe)('built Tauri app (DEVPANEL_DESKTOP_EXE)', () => {
  it('runs Services and Sessions through node-pty without Node on PATH; Exit through the UI ends the app', async () => {
    const { app, send, pids } = await startAppWithProcesses();
    expect(pids.every(isAlive)).toBe(true);
    const [sidecar] = sidecarPids();
    expect(sidecar).toBeDefined();

    expect(await send('shutdown', {})).toMatchObject({ ok: true });
    expect(await exited(app)).toBe(0);
    expect(pids.filter(isAlive)).toEqual([]);
    expect(recordedPids()).toEqual([]);
    expect(isAlive(sidecar!)).toBe(false);
  });

  it('a second launch exits without a second node.exe and leaves the running app alone', async () => {
    const { app, send } = await startAppWithProcesses();
    const sidecars = sidecarPids();
    expect(sidecars).toHaveLength(1);

    const second = launchApp();
    expect(await exited(second)).toBe(0);
    expect(sidecarPids()).toEqual(sidecars);
    expect(app.exitCode).toBeNull();
    expect(await hello()).toBe(true);

    await send('shutdown', {});
    await exited(app);
  });

  it('killing the shell kills the sidecar and every recorded process', async () => {
    const { app, pids } = await startAppWithProcesses();
    const sidecars = sidecarPids();
    expect(sidecars).toHaveLength(1);

    // The shell alone, not its tree: the Job Object must take everything else down.
    spawnSync('taskkill', ['/F', '/PID', String(app.pid)]);
    await exited(app);
    await waitUntil(() => [...sidecars, ...pids].every((pid) => !isAlive(pid)), 'the sidecar and its processes to end', 10_000);
    expect(await hello()).toBe(false);
    // They are gone, but still in the PID file: keep cleanup off PIDs Windows may have reused.
    rmSync(path.join(appDataDir, PID_FILE));
  });
});
