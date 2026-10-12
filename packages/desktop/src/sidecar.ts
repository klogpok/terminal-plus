/**
 * The desktop sidecar: a headless Node process the Tauri shell starts (ADR-0003). It runs the
 * DevPanel Server and the desktop behaviour (`runDesktop`) and talks to the shell over the stdio
 * protocol (`protocol.ts`): shell messages on stdin, sidecar messages on stdout, nothing else on
 * stdout. Its own logging (anything written through `console` or `process.stdout`) goes to stderr.
 *
 * Environment (same names as the web version's Server):
 * - DEVPANEL_APP_DATA: app data directory (default %APPDATA%\DevPanel, shared with the web version)
 * - DEVPANEL_PORT: port (default 7777)
 * - DEVPANEL_WEB_ROOT: the built `web` UI (default: the workspace build, `../../web/dist/browser`
 *   from this bundle)
 * Starting hidden (Start with Windows) and the Start with Windows state come with the `start` message.
 */
import path from 'node:path';
import { createInterface } from 'node:readline';
import { readUiLanguage, windowsShell } from '@devpanel/core';
import { probePort, readStoredAccessKey, startDevPanel } from '@devpanel/server';
import { DEFAULT_PORT } from '@devpanel/shared';
import { runDesktop } from './desktop-app.js';
import { formatLine } from './protocol.js';
import { connectShell } from './protocol-host.js';

// stdout is the protocol channel: keep its writer, and send every other stdout write to stderr.
const writeProtocol = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;

const log = (text: string) => process.stderr.write(`[sidecar] ${text}\n`);

const appDataDir = process.env.DEVPANEL_APP_DATA ?? path.join(process.env.APPDATA ?? '', 'DevPanel');
const port = process.env.DEVPANEL_PORT ? Number(process.env.DEVPANEL_PORT) : DEFAULT_PORT;
const webRoot = process.env.DEVPANEL_WEB_ROOT ?? path.join(__dirname, '..', '..', 'web', 'dist', 'browser');

const connection = connectShell({
  send: (message) => writeProtocol(formatLine(message)),
  log,
  // Ends once everything written so far has been flushed to the shell.
  exitProcess: (code) => writeProtocol('', () => process.exit(code)),
  pickFolder: () => windowsShell.pickFolder(),
});
createInterface({ input: process.stdin }).on('line', (line) => connection.receiveLine(line));

const main = async () => {
  const start = await connection.started;
  await runDesktop({
    host: connection.host,
    port,
    startHidden: start.startHidden,
    probePort: async (p) => probePort(p, await readStoredAccessKey(appDataDir)),
    readUiLanguage: () => readUiLanguage(appDataDir),
    startServer: async (onExit) => {
      const devPanel = await startDevPanel({ appDataDir, port, webRoot, shell: connection.desktopShell, onExit });
      return {
        openUrl: devPanel.openUrl,
        close: () => devPanel.close(),
        stopAllRepos: () => devPanel.core.stopAllRepos(),
        uiLanguage: () => devPanel.core.uiLanguage,
        onUiLanguageChanged: (listener) => devPanel.core.on('uiLanguageChanged', (e) => listener(e.language)),
      };
    },
  });
};

main().catch((error: unknown) => {
  // No exit message: the shell shows the crash dialog.
  log(`The sidecar failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
