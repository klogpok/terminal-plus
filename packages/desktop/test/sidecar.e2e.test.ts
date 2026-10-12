/**
 * The real sidecar (`dist/sidecar.cjs`, built by the `test` script) run with the test's Node, a
 * temporary app data directory and a random port (never 7777). The test plays the shell: it writes
 * shell messages to stdin and reads sidecar messages from stdout, where every line must be a
 * protocol line. Real Services and Sessions run through node-pty. Every process killed here was
 * spawned by this test.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelCore, PID_FILE } from '@devpanel/core';
import { HOST_STRINGS } from '@devpanel/shared';
import { formatLine, parseSidecarMessage, type ShellMessage, type SidecarMessage } from '../src/protocol.js';
import { freePort, isAlive, waitUntil } from './processes.js';

const sidecarBundle = fileURLToPath(new URL('../dist/sidecar.cjs', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

let root: string;
let appDataDir: string;
let repoDir: string;
let port: number;
const shells: FakeShell[] = [];
const sockets: WebSocket[] = [];
const servers: Server[] = [];
const extraPids: number[] = [];

type Of<T extends SidecarMessage['type']> = Extract<SidecarMessage, { type: T }>;

/** Plays the Tauri shell: owns the sidecar process and speaks the protocol with it. */
class FakeShell {
  readonly process: ChildProcess;
  /** Every sidecar message so far, in order. */
  readonly received: SidecarMessage[] = [];
  /** stdout lines that are not protocol lines (must stay empty). */
  readonly strayLines: string[] = [];
  stderr = '';
  private waiters: (() => void)[] = [];

  constructor() {
    const env: NodeJS.ProcessEnv = { ...process.env, DEVPANEL_APP_DATA: appDataDir, DEVPANEL_PORT: String(port) };
    this.process = spawn(process.execPath, [sidecarBundle], { env, stdio: 'pipe' });
    createInterface({ input: this.process.stdout! }).on('line', (line) => {
      const parsed = parseSidecarMessage(line);
      if (parsed.ok) this.received.push(parsed.message);
      else this.strayLines.push(line);
      for (const wake of this.waiters.splice(0)) wake();
    });
    this.process.stderr!.on('data', (chunk) => (this.stderr += String(chunk)));
    shells.push(this);
  }

  send(message: ShellMessage): void {
    this.process.stdin!.write(formatLine(message));
  }

  sendRaw(line: string): void {
    this.process.stdin!.write(`${line}\n`);
  }

  /** Waits for the first message of `type` received after the `from`-th message. */
  async next<T extends SidecarMessage['type']>(type: T, from = 0, timeoutMs = 30_000): Promise<Of<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.received.slice(from).find((m) => m.type === type);
      if (found) return found as Of<T>;
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${type}; got ${JSON.stringify(this.received)}; stderr: ${this.stderr}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 200);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  types(): string[] {
    return this.received.map((m) => m.type);
  }

  exited(): Promise<number | null> {
    const child = this.process;
    return child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise((resolve) => child.once('exit', resolve));
  }

  get running(): boolean {
    return this.process.exitCode === null && this.process.signalCode === null;
  }
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

/** Starts the sidecar (hidden, like Start with Windows) and waits for its window. */
async function startSidecar() {
  const shell = new FakeShell();
  shell.send({ type: 'start', startHidden: true, autostartEnabled: false });
  const openWindow = await shell.next('openWindow');
  return { shell, openWindow };
}

/** Starts the sidecar, a Service (a node process with a grandchild) and a shell Session through it. */
async function startSidecarWithProcesses() {
  const { shell } = await startSidecar();
  const send = await connect();
  const snapshot = (await send('getSnapshot', {})) as Reply & { result: { repos: { id: string }[] } };
  const repoId = snapshot.result.repos[0]!.id;
  expect(await send('startService', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
  expect(await send('openTerminal', { repoId })).toMatchObject({ ok: true });
  // node-pty spawned by the sidecar; the Service's tree (cmd, node, grandchild node) and the shell are recorded.
  await waitUntil(() => recordedPids().length >= 4, 'the Service and Session processes to be recorded');
  return { shell, send, repoId, pids: recordedPids() };
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-sidecar-test-'));
  appDataDir = path.join(root, 'appdata');
  repoDir = path.join(root, 'billing');
  mkdirSync(appDataDir);
  mkdirSync(repoDir);
  writeFileSync(
    path.join(repoDir, '.devpanel.yml'),
    `services:\n  - id: api\n    name: API\n    command: '"${process.execPath}" "${fixture('spawn-grandchild.mjs')}"'\n` +
      `    url: http://localhost:3000/\n`,
  );
  writeFileSync(path.join(appDataDir, 'workspace.json'), JSON.stringify({ repos: [{ path: repoDir, name: 'Billing' }] }));
  port = await freePort();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
  const all = shells.splice(0);
  for (const shell of all) {
    if (shell.running) {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(shell.process.pid)]);
      await shell.exited();
    }
  }
  for (const pid of [...recordedPids(), ...extraPids.splice(0)]) {
    if (isAlive(pid)) spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)]);
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  // Service and Session output never leaks onto the protocol channel.
  for (const shell of all) expect(shell.strayLines).toEqual([]);
});

describe('desktop sidecar over the stdio protocol', () => {
  it('opens the window on the Server URL with the Access Key, and the Server answers', async () => {
    const { openWindow } = await startSidecar();
    const key = readFileSync(path.join(appDataDir, 'access-key'), 'utf8').trim();
    expect(openWindow).toEqual({ type: 'openWindow', url: `http://127.0.0.1:${port}/#key=${key}`, show: false });
    expect(await hello()).toBe(true);
  });

  it('publishes the tray menu and crash texts, and shows the window on a tray click', async () => {
    const { shell } = await startSidecar();
    const tray = await shell.next('setTray');
    expect(tray.tooltip).toBe('DevPanel');
    expect(tray.items.map((i) => i.id)).toEqual(['show', 'stopAllRepos', 'separator-1', 'autostart', 'separator-2', 'quit']);
    expect(tray.items.find((i) => i.id === 'autostart')).toMatchObject({ kind: 'checkbox', checked: false });
    expect(await shell.next('setCrashTexts')).toEqual({
      type: 'setCrashTexts',
      title: HOST_STRINGS.en.desktop.crashedTitle,
      message: HOST_STRINGS.en.desktop.crashed,
    });

    const before = shell.received.length;
    shell.send({ type: 'trayClicked' });
    await shell.next('showWindow', before);
  });

  it('logs malformed and unknown lines to stderr and keeps working', async () => {
    const { shell } = await startSidecar();
    shell.sendRaw('this is not json');
    shell.sendRaw('{"type":"launchRockets"}');
    const before = shell.received.length;
    shell.send({ type: 'trayClicked' });
    await shell.next('showWindow', before);
    expect(shell.running).toBe(true);
    expect(shell.stderr).toContain('this is not json');
    expect(shell.stderr).toContain('launchRockets');
  });

  it('runs Services and Sessions through node-pty; closing the window hides it and stops nothing', async () => {
    const { shell, pids } = await startSidecarWithProcesses();
    expect(pids.every(isAlive)).toBe(true);

    const before = shell.received.length;
    shell.send({ type: 'windowCloseRequested' });
    await shell.next('hideWindow', before);
    expect(pids.every(isAlive)).toBe(true);
    expect(shell.running).toBe(true);
    expect(await hello()).toBe(true);
  });

  it('quitRequested stops every recorded process before exit', async () => {
    const { shell, pids } = await startSidecarWithProcesses();
    shell.send({ type: 'quitRequested' });
    expect(await shell.next('exit')).toEqual({ type: 'exit', code: 0 });
    expect(pids.filter(isAlive)).toEqual([]);
    expect(recordedPids()).toEqual([]);
    expect(await shell.exited()).toBe(0);
    // While quitting, a window close is never answered with hideWindow.
    expect(shell.types()).not.toContain('hideWindow');
  });

  it('"Exit DevPanel" through the WebSocket stops everything and yields exit', async () => {
    const { shell, send, pids } = await startSidecarWithProcesses();
    expect(await send('shutdown', {})).toMatchObject({ ok: true });
    expect(await shell.next('exit')).toEqual({ type: 'exit', code: 0 });
    expect(pids.filter(isAlive)).toEqual([]);
    expect(await shell.exited()).toBe(0);
  });

  it('asks the shell to open URLs and folders, outside the sidecar', async () => {
    const { shell } = await startSidecar();
    const send = await connect();
    const snapshot = (await send('getSnapshot', {})) as Reply & { result: { repos: { id: string }[] } };
    const repoId = snapshot.result.repos[0]!.id;

    expect(await send('openUrl', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
    expect(await shell.next('openUrl')).toEqual({ type: 'openUrl', url: 'http://localhost:3000/' });
    expect(await send('openFolder', { repoId })).toMatchObject({ ok: true });
    expect(await shell.next('openFolder')).toEqual({ type: 'openFolder', path: repoDir });
  });

  it('after a forced kill, every recorded process still alive is found as an Orphan on the next start', async () => {
    const { shell, pids } = await startSidecarWithProcesses();
    spawnSync('taskkill', ['/F', '/PID', String(shell.process.pid)]);
    await shell.exited();
    expect(shell.types()).not.toContain('exit');
    // ConPTY takes its console's processes down within a few seconds; survivors are what is left
    // once the set of live processes has stopped shrinking for a second.
    let alive = pids.filter(isAlive).join();
    let changedAt = Date.now();
    await waitUntil(
      () => {
        const now = pids.filter(isAlive).join();
        if (now !== alive) [alive, changedAt] = [now, Date.now()];
        return Date.now() - changedAt >= 1_000;
      },
      'ConPTY to finish ending its console processes',
      20_000,
    );

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

  /** Waits for the start-failure dialog; `exit` comes only once the test dismisses it. */
  async function expectStartFailure(shell: FakeShell, message: string) {
    const error = await shell.next('showError');
    expect(error).toMatchObject({
      title: HOST_STRINGS.en.desktop.startFailedTitle,
      message,
      language: 'en',
      buttons: { ok: 'OK', details: 'Details', detailsTitle: 'Details for a developer' },
    });
    expect(error.details).toBeUndefined();
    // The dialog is still open: give a wrongly eager exit time to show up before dismissing. A
    // fixed wait, as this checks that something does NOT happen: there is no event to poll for.
    await new Promise((r) => setTimeout(r, 500));
    expect(shell.types()).not.toContain('exit');
    expect(shell.running).toBe(true);

    shell.send({ type: 'errorDismissed', dialogId: error.dialogId });
    expect(await shell.next('exit')).toEqual({ type: 'exit', code: 1 });
    expect(await shell.exited()).toBe(1);
    expect(shell.types()).not.toContain('openWindow');
  }

  it('a port held by DevPanel explains that DevPanel already runs, and exits once dismissed', async () => {
    const { shell: running } = await startSidecar();
    const second = new FakeShell();
    second.send({ type: 'start', startHidden: false, autostartEnabled: false });
    await expectStartFailure(second, HOST_STRINGS.en.desktop.alreadyRunning);
    expect(running.running).toBe(true);
    expect(await hello()).toBe(true);
  });

  it('a port held by another program explains that, and exits once dismissed', async () => {
    const blocker = createServer((socket) => socket.destroy());
    servers.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));
    const shell = new FakeShell();
    shell.send({ type: 'start', startHidden: false, autostartEnabled: false });
    await expectStartFailure(shell, HOST_STRINGS.en.portTaken(port));
  });
});
