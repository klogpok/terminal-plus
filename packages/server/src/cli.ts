/**
 * What both command-line entry points share: settings from the environment, and running the
 * Server in this process until Exit (UI button, Ctrl+C, or closing the console window).
 *
 * Environment:
 * - DEVPANEL_APP_DATA: app data directory (default %APPDATA%\DevPanel)
 * - DEVPANEL_PORT: port (default 7777)
 * - DEVPANEL_DEV_ORIGINS: comma-separated extra allowed Origins, e.g. http://localhost:4200 for `ng serve`
 */
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@devpanel/shared';
import { appDataDirFrom } from './app-data.js';
import { onExitSignals } from './exit-signals.js';
import { startDevPanel, type RunningDevPanel } from './start.js';

export interface CliSettings {
  appDataDir: string;
  port: number;
  extraOrigins: string[];
  /** The built web UI (`pnpm build`). */
  webRoot: string;
}

export function cliSettings(env: NodeJS.ProcessEnv = process.env): CliSettings {
  return {
    appDataDir: appDataDirFrom(env),
    port: env.DEVPANEL_PORT ? Number(env.DEVPANEL_PORT) : DEFAULT_PORT,
    extraOrigins: (env.DEVPANEL_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    webRoot: fileURLToPath(new URL('../../web/dist/browser', import.meta.url)),
  };
}

/** On console close Windows kills the process ~10 s later: keep the Ctrl+C grace short then. */
const CONSOLE_CLOSE_GRACEFUL_STOP_MS = 2_000;

/** Starts the Server and wires every Exit path to stopping all Services and Sessions, then exiting. */
export async function runServer(settings: CliSettings): Promise<RunningDevPanel> {
  const devPanel = await startDevPanel({
    appDataDir: settings.appDataDir,
    port: settings.port,
    extraOrigins: settings.extraOrigins,
    webRoot: settings.webRoot,
    // "Exit DevPanel" from the UI: everything is stopped and the Server closed by now.
    onExit: () => process.exit(0),
  });
  onExitSignals(process, (signal) => {
    console.log('DevPanel: stopping all Services and Sessions...');
    const gracefulStopMs = signal === 'SIGHUP' ? CONSOLE_CLOSE_GRACEFUL_STOP_MS : undefined;
    void devPanel.close({ gracefulStopMs }).finally(() => process.exit(0));
  });
  return devPanel;
}
