/**
 * The launcher's logic (`start-devpanel.bat` runs `dist/launch-main.js`): find out whether DevPanel
 * already runs on the port, then either start the Server, only open another browser tab (a normal
 * peer client, ADR-0001), or explain in plain Russian that another program holds the port.
 */
import { HOST, browserUrl } from './start.js';
import { ACCESS_KEY_HEADER, DEVPANEL_APP_ID, HELLO_PATH } from './server.js';

export type PortProbe =
  | { kind: 'free' }
  /** Our Server; `keyValid` says whether the stored Access Key is its current one. */
  | { kind: 'devpanel'; keyValid: boolean }
  | { kind: 'foreign' };

const PROBE_TIMEOUT_MS = 3_000;

/** Asks whatever listens on 127.0.0.1:`port` whether it is DevPanel. */
export async function probePort(port: number, accessKey: string | undefined): Promise<PortProbe> {
  let response: Response;
  try {
    response = await fetch(`http://${HOST}:${port}${HELLO_PATH}`, {
      headers: accessKey ? { [ACCESS_KEY_HEADER]: accessKey } : {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    const code = (error as { cause?: { code?: unknown } }).cause?.code;
    // Nobody listens. Anything else (reset, timeout, not HTTP) means some program holds the port.
    return code === 'ECONNREFUSED' ? { kind: 'free' } : { kind: 'foreign' };
  }
  try {
    const body = (await response.json()) as { app?: unknown; keyValid?: unknown };
    if (response.ok && body.app === DEVPANEL_APP_ID) return { kind: 'devpanel', keyValid: body.keyValid === true };
  } catch {
    // Not JSON: not ours.
  }
  return { kind: 'foreign' };
}

/** Everything the launcher touches; `launch-main.ts` passes the real ones, tests pass fakes. */
export interface LaunchDeps {
  port: number;
  /** The Access Key stored in the app data directory by the running Server. */
  readAccessKey(): Promise<string | undefined>;
  /** Starts the Server in this process (it then lives as long as the launcher's console). */
  startServer(): Promise<{ openUrl: string }>;
  openBrowser(url: string): Promise<void>;
  /** One line for the team member in the console window. */
  print(line: string): void;
}

/**
 * - `started`: this process now runs the Server; keep it alive.
 * - `openedExisting`: DevPanel already ran; another tab was opened. The launcher may exit.
 * - `portTaken`, `keyMismatch`: nothing was started; a message was printed. Keep the window open.
 */
export type LaunchResult = 'started' | 'openedExisting' | 'portTaken' | 'keyMismatch';

/** Plain-Russian lines the launcher prints. */
export const LAUNCH_MESSAGES = {
  starting: 'DevPanel запускается...',
  started: (url: string) =>
    `DevPanel работает: ${url}\n` +
    'Браузер открыт. Не закрывайте это окно, пока работаете: закрытие окна останавливает все сервисы и сессии DevPanel.',
  alreadyRunning: 'DevPanel уже работает. Открываю ещё одну вкладку браузера.',
  portTaken: (port: number) =>
    `Не удалось запустить DevPanel: порт ${port} занят другой программой (это не DevPanel).\n` +
    `Закройте программу, которая использует порт ${port}, или перезагрузите компьютер, и запустите DevPanel снова.`,
  keyMismatch:
    'DevPanel уже работает, но запущен с другой папкой данных, поэтому открыть его отсюда не получается.\n' +
    'Закройте окно уже запущенного DevPanel (или нажмите в нём «Выйти из DevPanel») и запустите DevPanel снова.',
} as const;

const isAddressInUse = (error: unknown) => (error as { code?: unknown }).code === 'EADDRINUSE';

/** Starts DevPanel, or opens another tab of the running one, or explains why neither is possible. */
export async function launch(deps: LaunchDeps): Promise<LaunchResult> {
  const probe = await probePort(deps.port, await deps.readAccessKey());
  if (probe.kind === 'free') {
    deps.print(LAUNCH_MESSAGES.starting);
    try {
      const { openUrl } = await deps.startServer();
      await deps.openBrowser(openUrl);
      deps.print(LAUNCH_MESSAGES.started(openUrl.split('#')[0]!));
      return 'started';
    } catch (error) {
      // Another launcher (a double double-click) or program took the port after our probe.
      if (!isAddressInUse(error)) throw error;
      return openExisting(deps, await probePort(deps.port, await deps.readAccessKey()));
    }
  }
  return openExisting(deps, probe);
}

async function openExisting(deps: LaunchDeps, probe: PortProbe): Promise<LaunchResult> {
  if (probe.kind !== 'devpanel') {
    deps.print(LAUNCH_MESSAGES.portTaken(deps.port));
    return 'portTaken';
  }
  const key = await deps.readAccessKey();
  if (!probe.keyValid || key === undefined) {
    deps.print(LAUNCH_MESSAGES.keyMismatch);
    return 'keyMismatch';
  }
  deps.print(LAUNCH_MESSAGES.alreadyRunning);
  await deps.openBrowser(browserUrl(deps.port, key));
  return 'openedExisting';
}
