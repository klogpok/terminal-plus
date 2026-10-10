import { DevPanelCore, type CoreTimings, type DesktopShell, type Environment } from '@devpanel/core';
import { DEFAULT_PORT } from '@devpanel/shared';
import { generateAccessKey, storeAccessKey } from './access-key.js';
import { createServer } from './server.js';

/** The only address the Server listens on. */
export const HOST = '127.0.0.1';

/** URL to open in the browser: the Access Key travels in the fragment, never sent over HTTP. */
export function browserUrl(port: number, accessKey: string): string {
  return `http://${HOST}:${port}/#key=${accessKey}`;
}

export interface StartOptions {
  appDataDir: string;
  /** Default 7777; tests pass 0 for a free port. */
  port?: number;
  timings?: Partial<CoreTimings>;
  /** Folder picker / opener; defaults to the Windows one. Tests pass a fake. */
  shell?: DesktopShell;
  /** Tool probes and commands (pnpm, Claude Code, shell); tests replace them. */
  environment?: Partial<Environment>;
  webRoot?: string;
  extraOrigins?: string[];
  logger?: boolean;
  /**
   * Called once Exit has completed after a `shutdown` command (everything stopped, Server closed);
   * `main` exits the process here.
   */
  onExit?: () => void;
}

export interface RunningDevPanel {
  core: DevPanelCore;
  /** e.g. http://127.0.0.1:7777 */
  url: string;
  accessKey: string;
  /** URL to open in the browser: the Access Key travels in the fragment, never sent over HTTP. */
  openUrl: string;
  /**
   * Exit: stops every Service and Session, then the Server. Idempotent. `gracefulStopMs` shortens
   * the grace period (closing the console window leaves only a few seconds).
   */
  close(options?: { gracefulStopMs?: number }): Promise<void>;
}

/** Loads `core`, starts the Server on 127.0.0.1, then stores a fresh Access Key. */
export async function startDevPanel(options: StartOptions): Promise<RunningDevPanel> {
  const core = new DevPanelCore({
    appDataDir: options.appDataDir,
    timings: options.timings,
    shell: options.shell,
    environment: options.environment,
  });
  await core.load();
  const accessKey = generateAccessKey();
  let closing: Promise<void> | undefined;
  const close = (closeOptions: { gracefulStopMs?: number } = {}): Promise<void> =>
    (closing ??= (async () => {
      await core.shutdown(closeOptions);
      await app.close();
    })());
  const app = createServer({
    core,
    accessKey,
    webRoot: options.webRoot,
    extraOrigins: options.extraOrigins,
    logger: options.logger,
    onExitRequested: () => {
      void close().finally(() => options.onExit?.());
    },
  });
  try {
    await app.listen({ host: HOST, port: options.port ?? DEFAULT_PORT });
  } catch (error) {
    // e.g. EADDRINUSE: another DevPanel (or program) holds the port. Nothing was started yet.
    await core.shutdown();
    await app.close().catch(() => undefined);
    throw error;
  }
  await storeAccessKey(options.appDataDir, accessKey);
  const { port } = app.server.address() as { port: number };
  const url = `http://${HOST}:${port}`;
  return {
    core,
    url,
    accessKey,
    openUrl: browserUrl(port, accessKey),
    close,
  };
}
