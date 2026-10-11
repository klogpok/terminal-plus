/**
 * The `.bat` launcher's logic: is the port free, held by our Server, or held by something else,
 * and what the launcher does in each case. Uses port 0 / random ports and a fake browser opener:
 * never touches 7777 and never opens a real browser.
 */
import { createServer as createHttpServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UI_LANGUAGE_FILE, readUiLanguage } from '@devpanel/core';
import {
  ACCESS_KEY_FILE,
  launch,
  probePort,
  readStoredAccessKey,
  startDevPanel,
  type LaunchDeps,
  type RunningDevPanel,
} from '../src/index.js';

let root: string;
let appDataDir: string;
const cleanups: (() => Promise<void>)[] = [];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-launch-test-'));
  appDataDir = path.join(root, 'appdata');
  mkdirSync(appDataDir);
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function runDevPanel(): Promise<RunningDevPanel> {
  const devPanel = await startDevPanel({
    appDataDir,
    port: 0,
    environment: { isClaudeAvailable: async () => false },
  });
  cleanups.push(() => devPanel.close());
  return devPanel;
}

async function runForeignServer(): Promise<number> {
  const server: Server = createHttpServer((_req, res) => res.end('<html>someone else</html>'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

/** A port that nothing listens on (bound once, then released). */
async function freePort(): Promise<number> {
  const server = createHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Launcher dependencies over the test's app data dir; records opened URLs and printed lines. */
function launcherFor(port: number) {
  const opened: string[] = [];
  const printed: string[] = [];
  let started = 0;
  const deps: LaunchDeps = {
    port,
    readAccessKey: () => readStoredAccessKey(appDataDir),
    readUiLanguage: () => readUiLanguage(appDataDir),
    startServer: async () => {
      started++;
      const devPanel = await startDevPanel({
        appDataDir,
        port,
        environment: { isClaudeAvailable: async () => false },
      });
      cleanups.push(() => devPanel.close());
      return devPanel;
    },
    openBrowser: async (url) => {
      opened.push(url);
    },
    print: (line) => printed.push(line),
  };
  return { deps, opened, printed, started: () => started };
}

const CYRILLIC = /[а-яё]/i;

/** Stores a UI Language the way the Server does. */
function storeUiLanguage(language: string): void {
  writeFileSync(path.join(appDataDir, UI_LANGUAGE_FILE), JSON.stringify({ language }));
}

describe('launch', () => {
  it('starts the Server on a free port and opens the browser with the Access Key in the fragment', async () => {
    const port = await freePort();
    const launcher = launcherFor(port);

    expect(await launch(launcher.deps)).toBe('started');

    expect(launcher.started()).toBe(1);
    expect(launcher.opened).toHaveLength(1);
    const url = new URL(launcher.opened[0]!);
    expect(url.origin).toBe(`http://127.0.0.1:${port}`);
    const key = new URLSearchParams(url.hash.slice(1)).get('key');
    // The key in the URL is the one the running Server accepts.
    expect(await probePort(port, key!)).toEqual({ kind: 'devpanel', keyValid: true });
  });

  it('only opens another tab with the stored Access Key when DevPanel already runs', async () => {
    const port = await freePort();
    await launch(launcherFor(port).deps);
    const second = launcherFor(port);

    expect(await launch(second.deps)).toBe('openedExisting');

    expect(second.started()).toBe(0);
    const key = await readStoredAccessKey(appDataDir);
    expect(second.opened).toEqual([`http://127.0.0.1:${port}/#key=${key}`]);
    expect(second.printed).toEqual(['DevPanel is already running. Opening another browser tab.']);
  });

  it('explains when another program holds the port, and starts nothing', async () => {
    const port = await runForeignServer();
    const launcher = launcherFor(port);

    expect(await launch(launcher.deps)).toBe('portTaken');

    expect(launcher.started()).toBe(0);
    expect(launcher.opened).toEqual([]);
    const message = launcher.printed.join('\n');
    expect(message).toContain(`Could not start DevPanel: port ${port} is used by another program`);
  });

  it('explains when the running DevPanel does not accept the stored Access Key', async () => {
    const port = await freePort();
    await launch(launcherFor(port).deps);
    const launcher = launcherFor(port);
    launcher.deps.readAccessKey = async () => 'stale-key';

    expect(await launch(launcher.deps)).toBe('keyMismatch');

    expect(launcher.started()).toBe(0);
    expect(launcher.opened).toEqual([]);
    expect(launcher.printed.join('\n')).toContain('DevPanel is already running, but with a different data folder');
  });

  it('opens a tab when another launcher won the race for the port between the probe and the start', async () => {
    const port = await freePort();
    const launcher = launcherFor(port);
    const realStart = launcher.deps.startServer;
    // Another launcher starts DevPanel right after our probe saw the port free.
    launcher.deps.startServer = async () => {
      await launch(launcherFor(port).deps);
      return realStart();
    };

    expect(await launch(launcher.deps)).toBe('openedExisting');
    const key = await readStoredAccessKey(appDataDir);
    expect(launcher.opened).toEqual([`http://127.0.0.1:${port}/#key=${key}`]);
  });
});

describe('launcher console lines follow the stored UI Language', () => {
  it('are in English when no UI Language is stored', async () => {
    const launcher = launcherFor(await freePort());

    await launch(launcher.deps);

    expect(launcher.printed[0]).toBe('DevPanel is starting...');
    expect(launcher.printed.join('\n')).not.toMatch(CYRILLIC);
  });

  it('are in Russian when ru is stored: starting, started, already running', async () => {
    storeUiLanguage('ru');
    const port = await freePort();
    const first = launcherFor(port);
    await launch(first.deps);
    const second = launcherFor(port);
    await launch(second.deps);

    expect(first.printed[0]).toBe('DevPanel запускается...');
    expect(first.printed[1]).toMatch(/^DevPanel работает: /);
    expect(second.printed).toEqual(['DevPanel уже работает. Открываю ещё одну вкладку браузера.']);
  });

  it('are in Russian when ru is stored: port taken', async () => {
    storeUiLanguage('ru');
    const port = await runForeignServer();
    const launcher = launcherFor(port);

    await launch(launcher.deps);

    expect(launcher.printed.join('\n')).toContain(`Не удалось запустить DevPanel: порт ${port} занят`);
  });
});

describe('a second Server on a taken port', () => {
  it('fails with EADDRINUSE and leaves the running Server\'s stored Access Key alone', async () => {
    const devPanel = await runDevPanel();
    const port = Number(new URL(devPanel.url).port);
    await expect(
      startDevPanel({ appDataDir, port, environment: { isClaudeAvailable: async () => false } }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(readFileSync(path.join(appDataDir, ACCESS_KEY_FILE), 'utf8')).toBe(devPanel.accessKey);
  });
});

describe('probePort', () => {
  it('reports a free port', async () => {
    expect(await probePort(await freePort(), 'any-key')).toEqual({ kind: 'free' });
  });

  it('recognizes a running DevPanel and checks the stored Access Key against it', async () => {
    const devPanel = await runDevPanel();
    const port = Number(new URL(devPanel.url).port);
    expect(await probePort(port, devPanel.accessKey)).toEqual({ kind: 'devpanel', keyValid: true });
    expect(await probePort(port, 'stale-key')).toEqual({ kind: 'devpanel', keyValid: false });
    expect(await probePort(port, undefined)).toEqual({ kind: 'devpanel', keyValid: false });
  });

  it('reports a port held by something other than DevPanel as foreign', async () => {
    expect(await probePort(await runForeignServer(), 'any-key')).toEqual({ kind: 'foreign' });
  });
});
