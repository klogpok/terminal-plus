import { DevPanelCore, type CoreTimings } from '@devpanel/core';
import { DEFAULT_PORT } from '@devpanel/shared';
import { createAccessKey } from './access-key.js';
import { createServer } from './server.js';

/** The only address the Server listens on. */
export const HOST = '127.0.0.1';

export interface StartOptions {
  appDataDir: string;
  /** Default 7777; tests pass 0 for a free port. */
  port?: number;
  timings?: Partial<CoreTimings>;
  webRoot?: string;
  extraOrigins?: string[];
  logger?: boolean;
}

export interface RunningDevPanel {
  core: DevPanelCore;
  /** e.g. http://127.0.0.1:7777 */
  url: string;
  accessKey: string;
  /** URL to open in the browser: the Access Key travels in the fragment, never sent over HTTP. */
  openUrl: string;
  /** Stops every Service, then the Server. */
  close(): Promise<void>;
}

/** Loads `core`, creates a fresh Access Key, and starts the Server on 127.0.0.1. */
export async function startDevPanel(options: StartOptions): Promise<RunningDevPanel> {
  const core = new DevPanelCore({ appDataDir: options.appDataDir, timings: options.timings });
  await core.load();
  const accessKey = await createAccessKey(options.appDataDir);
  const app = createServer({
    core,
    accessKey,
    webRoot: options.webRoot,
    extraOrigins: options.extraOrigins,
    logger: options.logger,
  });
  await app.listen({ host: HOST, port: options.port ?? DEFAULT_PORT });
  const { port } = app.server.address() as { port: number };
  const url = `http://${HOST}:${port}`;
  return {
    core,
    url,
    accessKey,
    openUrl: `${url}/#key=${accessKey}`,
    async close() {
      await core.shutdown();
      await app.close();
    },
  };
}
