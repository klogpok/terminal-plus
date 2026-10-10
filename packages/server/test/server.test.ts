/**
 * End-to-end Server tests over a real WebSocket: the `shared` command/event contract round-trip,
 * and rejection of connections without the Access Key or with a foreign Origin.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import type { CommandType, CommandPayload, ServerMessage, EventMessage, ReplyMessage } from '@devpanel/shared';
import type { DesktopShell } from '@devpanel/core';
import { ACCESS_KEY_FILE, startDevPanel, type RunningDevPanel } from '../src/index.js';

/** Never opens a real dialog, Explorer or browser. */
class FakeShell implements DesktopShell {
  nextPick: string | undefined;
  readonly openedFolders: string[] = [];
  readonly openedUrls: string[] = [];
  async pickFolder() {
    return this.nextPick;
  }
  async openFolder(folder: string) {
    this.openedFolders.push(folder);
  }
  async openUrl(url: string) {
    this.openedUrls.push(url);
  }
}

const IDLE =path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'idle.mjs');

let root: string;
let devPanel: RunningDevPanel;
let shell: FakeShell;
const sockets: WebSocket[] = [];
/** How often the Server asked its host process to exit (`StartOptions.onExit`). */
let exits = 0;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-server-test-'));
  const appDataDir = path.join(root, 'appdata');
  const repoPath = path.join(root, 'billing');
  mkdirSync(appDataDir);
  mkdirSync(repoPath);
  writeFileSync(
    path.join(repoPath, '.devpanel.yml'),
    `services:\n  - id: api\n    command: '"${process.execPath}" "${IDLE}"'\n`,
  );
  writeFileSync(
    path.join(appDataDir, 'workspace.json'),
    JSON.stringify({ repos: [{ path: repoPath, name: 'billing' }] }),
  );
  shell = new FakeShell();
  exits = 0;
  devPanel = await startDevPanel({
    appDataDir,
    port: 0,
    timings: { gracefulStopMs: 1000 },
    shell,
    onExit: () => {
      exits++;
    },
    // Never the real Claude Code.
    environment: { isClaudeAvailable: async () => false },
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await devPanel.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

/** A test client speaking the `shared` contract. */
class Client {
  readonly messages: ServerMessage[] = [];
  private nextId = 1;
  private waiters: (() => void)[] = [];

  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  async send<K extends CommandType>(type: K, payload: CommandPayload<K>): Promise<ReplyMessage> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ kind: 'command', id, type, payload }));
    return this.waitFor((m): m is ReplyMessage => m.kind === 'reply' && m.id === id);
  }

  async waitFor<M extends ServerMessage>(match: (m: ServerMessage) => m is M, timeoutMs = 10_000): Promise<M> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(match);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`No matching message in ${JSON.stringify(this.messages)}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }
}

function connect(options: { key?: string; origin?: string } = {}): Promise<WebSocket> {
  const key = options.key ?? devPanel.accessKey;
  const socket = new WebSocket(`${devPanel.url.replace('http', 'ws')}/ws?key=${encodeURIComponent(key)}`, {
    origin: options.origin ?? devPanel.url,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.once('error', reject);
  });
}

const statusEvent =
  (status: string) =>
  (m: ServerMessage): m is EventMessage =>
    m.kind === 'event' && m.type === 'statusChanged' && m.payload.status === status;

describe('DevPanel Server', () => {
  it('listens on 127.0.0.1 only and stores the Access Key in the app data directory', () => {
    expect(devPanel.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(devPanel.accessKey.length).toBeGreaterThanOrEqual(32);
    const stored = readFileSync(path.join(root, 'appdata', ACCESS_KEY_FILE), 'utf8').trim();
    expect(stored).toBe(devPanel.accessKey);
  });

  it('round-trips commands over a real WebSocket and broadcasts events to every client', async () => {
    const tab1 = new Client(await connect());
    const tab2 = new Client(await connect({ origin: devPanel.url.replace('127.0.0.1', 'localhost') }));

    const snapshot = await tab1.send('getSnapshot', {});
    expect(snapshot).toMatchObject({ ok: true, result: { repos: [{ name: 'billing', services: [{ id: 'api', status: 'stopped' }] }] } });
    const repoId = (snapshot as { result: { repos: { id: string }[] } }).result.repos[0]!.id;

    expect(await tab1.send('startService', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
    await tab1.waitFor(statusEvent('running'));
    await tab2.waitFor(statusEvent('running'));

    // The second tab controls the same Service.
    expect(await tab2.send('stopService', { repoId, serviceId: 'api' })).toMatchObject({ ok: true });
    await tab1.waitFor(statusEvent('stopped'));

    // A fresh client (page reload) rebuilds the state from a snapshot.
    const reloaded = new Client(await connect());
    expect(await reloaded.send('getSnapshot', {})).toMatchObject({
      result: { repos: [{ services: [{ id: 'api', status: 'stopped' }] }] },
    });
  });

  it('streams Service output to every client and replays the buffer to a client that connects later', async () => {
    const tab1 = new Client(await connect());
    const snapshot = await tab1.send('getSnapshot', {});
    const repoId = (snapshot as { result: { repos: { id: string }[] } }).result.repos[0]!.id;
    const ref = { repoId, serviceId: 'api' };

    await tab1.send('startService', ref);
    await tab1.waitFor(
      (m): m is EventMessage => m.kind === 'event' && m.type === 'log' && m.payload.data.includes('IDLE_STARTED'),
    );

    const tab2 = new Client(await connect());
    const replay = await tab2.send('getServiceOutput', ref);
    expect(replay).toMatchObject({ ok: true });
    expect((replay as { result: string }).result).toContain('IDLE_STARTED');

    expect(await tab2.send('writeToPty', { ...ref, data: 'x' })).toMatchObject({ ok: true });
    expect(await tab2.send('resizePty', { ...ref, cols: 100, rows: 30 })).toMatchObject({ ok: true });
    expect(await tab2.send('resizePty', { ...ref, cols: 0, rows: 30 })).toMatchObject({ ok: false, error: { code: 'badCommand' } });
  });

  it('opens, streams, restores and closes Sessions for every client', async () => {
    const tab1 = new Client(await connect());
    const tab2 = new Client(await connect());
    const repoId = ((await tab1.send('getSnapshot', {})) as { result: { repos: { id: string }[] } }).result.repos[0]!.id;

    expect(await tab1.send('openClaude', { repoId })).toMatchObject({ ok: false, error: { code: 'claudeMissing' } });

    const opened = await tab1.send('openTerminal', { repoId });
    expect(opened).toMatchObject({ ok: true, result: { repoId, kind: 'shell', state: 'running' } });
    const sessionId = (opened as { result: { id: string } }).result.id;
    await tab2.waitFor((m): m is EventMessage => m.kind === 'event' && m.type === 'sessionChanged' && m.payload.session.id === sessionId);

    expect(await tab2.send('writeToSession', { sessionId, data: 'echo HI_^FROM_TAB2\r' })).toMatchObject({ ok: true });
    await tab1.waitFor(
      (m): m is EventMessage => m.kind === 'event' && m.type === 'sessionOutput' && m.payload.data.includes('HI_FROM_TAB2'),
    );
    expect(await tab2.send('resizeSession', { sessionId, cols: 100, rows: 30 })).toMatchObject({ ok: true });

    // A page reload gets the Session from the snapshot and its output from the buffer.
    const reloaded = new Client(await connect());
    expect(await reloaded.send('getSnapshot', {})).toMatchObject({ result: { sessions: [{ id: sessionId }] } });
    expect(((await reloaded.send('getSessionOutput', { sessionId })) as { result: string }).result).toContain('HI_FROM_TAB2');

    expect(await reloaded.send('closeSession', { sessionId })).toMatchObject({ ok: true });
    await tab1.waitFor((m): m is EventMessage => m.kind === 'event' && m.type === 'sessionClosed' && m.payload.sessionId === sessionId);
    expect(await tab1.send('getSessionOutput', { sessionId })).toMatchObject({ ok: false, error: { code: 'sessionNotFound' } });
  });

  it('replies with a coded error for failing or malformed commands', async () => {
    const client = new Client(await connect());

    expect(await client.send('startService', { repoId: 'nope', serviceId: 'api' })).toMatchObject({
      ok: false,
      error: { code: 'repoNotFound', params: { repoId: 'nope' } },
    });
    expect(await client.send('startService', { repoId: 42 } as never)).toMatchObject({
      ok: false,
      error: { code: 'badCommand' },
    });
    expect(await client.send('formatDisk' as never, {} as never)).toMatchObject({
      ok: false,
      error: { code: 'badCommand' },
    });
  });

  it('adds a Repo picked by the Server-side folder picker and tells every client', async () => {
    const tab1 = new Client(await connect());
    const tab2 = new Client(await connect());
    const folder = path.join(root, 'Docs');
    mkdirSync(folder);
    shell.nextPick = folder;

    const reply = await tab1.send('addRepo', {});

    expect(reply).toMatchObject({ ok: true, result: { name: 'Docs', path: folder } });
    const event = await tab2.waitFor(
      (m): m is EventMessage => m.kind === 'event' && m.type === 'repoChanged',
    );
    expect(event.payload).toMatchObject({ repo: { name: 'Docs', path: folder } });
  });

  it('opens folders and Service URLs through the Server', async () => {
    const client = new Client(await connect());
    const snapshot = (await client.send('getSnapshot', {})) as { result: { repos: { id: string; path: string }[] } };
    const repo = snapshot.result.repos[0]!;

    expect(await client.send('openFolder', { repoId: repo.id })).toMatchObject({ ok: true, result: null });
    expect(shell.openedFolders).toEqual([repo.path]);
    expect(await client.send('openUrl', { repoId: repo.id, serviceId: 'api' })).toMatchObject({
      ok: false,
      error: { code: 'serviceHasNoUrl' },
    });
  });

  it('rejects connections without the correct Access Key', async () => {
    await expect(connect({ key: '' })).rejects.toThrow('HTTP 401');
    await expect(connect({ key: 'wrong-key' })).rejects.toThrow('HTTP 401');
  });

  it('Exit DevPanel: `shutdown` stops every Service, replies, then the Server closes and exits', async () => {
    const client = new Client(await connect());
    const snapshot = await client.send('getSnapshot', {});
    const repoId = (snapshot as { result: { repos: { id: string }[] } }).result.repos[0]!.id;
    await client.send('startService', { repoId, serviceId: 'api' });
    await client.waitFor(statusEvent('running'));

    expect(await client.send('shutdown', {})).toMatchObject({ ok: true });

    expect(devPanel.core.listRepos()[0]!.services[0]!.status).toBe('stopped');
    await vi.waitFor(() => expect(exits).toBe(1));
    await expect(connect()).rejects.toThrow();
  });

  it('accepts `killOrphans` (nothing to kill on a clean start)', async () => {
    const client = new Client(await connect());
    expect(await client.send('getSnapshot', {})).not.toMatchObject({ result: { orphans: expect.anything() } });
    expect(await client.send('killOrphans', {})).toMatchObject({ ok: true, result: null });
  });

  it('rejects connections from a foreign Origin', async () => {
    await expect(connect({ origin: 'https://evil.example' })).rejects.toThrow('HTTP 403');
    await expect(connect({ origin: 'http://127.0.0.1:1' })).rejects.toThrow('HTTP 403');
  });
});
