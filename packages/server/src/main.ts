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
import { startDevPanel } from './start.js';

const appDataDir =
  process.env.DEVPANEL_APP_DATA ?? path.join(process.env.APPDATA ?? os.homedir(), 'DevPanel');
const port = process.env.DEVPANEL_PORT ? Number(process.env.DEVPANEL_PORT) : undefined;
const extraOrigins = (process.env.DEVPANEL_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const webRoot = fileURLToPath(new URL('../../web/dist/browser', import.meta.url));

const devPanel = await startDevPanel({ appDataDir, port, extraOrigins, webRoot });
console.log(`DevPanel: ${devPanel.openUrl}`);
console.log(`App data: ${appDataDir}`);

// Basic Exit; ticket 07 adds console-close handling and Orphans.
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log('DevPanel: stopping all Services...');
    void devPanel.close().finally(() => process.exit(0));
  });
}
