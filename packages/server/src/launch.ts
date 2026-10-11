/**
 * The launcher's logic (`start-devpanel.bat` runs `dist/launch-main.js`): find out whether DevPanel
 * already runs on the port, then either start the Server, only open another browser tab (a normal
 * peer client, ADR-0001), or explain in plain language that another program holds the port. Console
 * lines are in the stored UI Language.
 */
import { HOST_STRINGS, type UiLanguage } from '@devpanel/shared';
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
  /** The UI Language stored in the app data directory; the console lines are in it. */
  readUiLanguage(): Promise<UiLanguage>;
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

/** Listening failed because something already holds the port. */
export const isAddressInUse = (error: unknown) => (error as { code?: unknown }).code === 'EADDRINUSE';

/** What keeps us from using a DevPanel port that is not free. */
export type PortBlocker = 'portTaken' | 'keyMismatch';

/**
 * Something answers on the port: another program (`portTaken`), a DevPanel whose Access Key we do
 * not hold (`keyMismatch`), or our own DevPanel (`undefined`, it can be opened). Used by the
 * launcher and the desktop app.
 */
export function portBlocker(probe: PortProbe): PortBlocker | undefined {
  if (probe.kind !== 'devpanel') return 'portTaken';
  return probe.keyValid ? undefined : 'keyMismatch';
}

/** The plain-language explanation of a `PortBlocker`, in the given UI Language. */
export function portBlockerMessage(blocker: PortBlocker, port: number, language: UiLanguage): string {
  const strings = HOST_STRINGS[language];
  return blocker === 'portTaken' ? strings.portTaken(port) : strings.keyMismatch;
}

/** Starts DevPanel, or opens another tab of the running one, or explains why neither is possible. */
export async function launch(deps: LaunchDeps): Promise<LaunchResult> {
  const language = await deps.readUiLanguage();
  const strings = HOST_STRINGS[language].launcher;
  const probe = await probePort(deps.port, await deps.readAccessKey());
  if (probe.kind === 'free') {
    deps.print(strings.starting);
    try {
      const { openUrl } = await deps.startServer();
      await deps.openBrowser(openUrl);
      deps.print(strings.started(openUrl.split('#')[0]!));
      return 'started';
    } catch (error) {
      // Another launcher (a double double-click) or program took the port after our probe.
      if (!isAddressInUse(error)) throw error;
      return openExisting(deps, language, await probePort(deps.port, await deps.readAccessKey()));
    }
  }
  return openExisting(deps, language, probe);
}

async function openExisting(deps: LaunchDeps, language: UiLanguage, probe: PortProbe): Promise<LaunchResult> {
  const key = await deps.readAccessKey();
  const blocker = portBlocker(probe);
  if (blocker || key === undefined) {
    const reason = blocker ?? 'keyMismatch';
    deps.print(portBlockerMessage(reason, deps.port, language));
    return reason;
  }
  deps.print(HOST_STRINGS[language].launcher.alreadyRunning);
  await deps.openBrowser(browserUrl(deps.port, key));
  return 'openedExisting';
}
