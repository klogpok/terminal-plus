/**
 * Server entry point: `node packages/server/dist/main.js` (after `pnpm build`).
 *
 * Environment:
 * - DEVPANEL_APP_DATA: app data directory (default %APPDATA%\DevPanel)
 * - DEVPANEL_PORT: port (default 7777)
 * - DEVPANEL_DEV_ORIGINS: comma-separated extra allowed Origins, e.g. http://localhost:4200 for `ng serve`
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onExitSignals } from './exit-signals.js';
import { startDevPanel } from './start.js';

const appDataDir =
  process.env.DEVPANEL_APP_DATA ?? path.join(process.env.APPDATA ?? os.homedir(), 'DevPanel');
const port = process.env.DEVPANEL_PORT ? Number(process.env.DEVPANEL_PORT) : undefined;
const extraOrigins = (process.env.DEVPANEL_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const webRoot = fileURLToPath(new URL('../../web/dist/browser', import.meta.url));

/** On console close Windows kills the process ~10 s later: keep the Ctrl+C grace short then. */
const CONSOLE_CLOSE_GRACEFUL_STOP_MS = 2_000;

const devPanel = await startDevPanel({
  appDataDir,
  port,
  extraOrigins,
  webRoot,
  // "Exit DevPanel" from the UI: everything is stopped and the Server closed by now.
  onExit: () => process.exit(0),
});
console.log(`DevPanel: ${devPanel.openUrl}`);
console.log(`App data: ${appDataDir}`);
const orphans = devPanel.core.listOrphans();
if (orphans.length) console.log(`DevPanel: ${orphans.length} process group(s) left over from the previous run; see the UI.`);

onExitSignals(process, (signal) => {
  console.log('DevPanel: stopping all Services and Sessions...');
  const gracefulStopMs = signal === 'SIGHUP' ? CONSOLE_CLOSE_GRACEFUL_STOP_MS : undefined;
  void devPanel.close({ gracefulStopMs }).finally(() => process.exit(0));
});
