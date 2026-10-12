/**
 * The desktop app's main-process behavior, free of Electron imports: `main.ts` passes the real
 * Electron objects through `DesktopHost`, tests pass fakes.
 *
 * The Electron main process hosts the DevPanel Server (ADR-0001) in-process, on the same
 * 127.0.0.1 WebSocket transport as the web version (ADR-0002); the window just loads the Server's
 * URL with the Access Key in the fragment, so the `web` build runs unchanged.
 */
import { HOST_STRINGS, type UiLanguage } from '@devpanel/shared';
import { isAddressInUse, portBlocker, portBlockerMessage, type PortProbe } from '@devpanel/server';

/**
 * An error dialog: a plain-language `message`, technical `details` folded away under "Details".
 * `language` is the UI Language of the texts; the dialog's buttons are in it too.
 */
export interface DesktopError {
  title: string;
  message: string;
  details?: string;
  language: UiLanguage;
}

/** The DevPanel Server running inside this process. */
export interface RunningServer {
  /** URL with the Access Key in the fragment. */
  openUrl: string;
  /** Exit: stops every Service and Session, then the Server. Idempotent. */
  close(): Promise<void>;
  /** "Stop everything in all Repos": every Service of every Repo; Sessions keep running. */
  stopAllRepos(): Promise<void>;
  /** The current UI Language. */
  uiLanguage(): UiLanguage;
  /** Calls `listener` after each UI Language change (`uiLanguageChanged`). */
  onUiLanguageChanged(listener: (language: UiLanguage) => void): void;
}

export interface QuitEvent {
  preventDefault(): void;
}

export interface DesktopWindow {
  /** Shows (restoring if minimized) and focuses the window. */
  show(): void;
  hide(): void;
  /** The user closes the window; `preventDefault` keeps it. */
  onClose(listener: (event: QuitEvent) => void): void;
}

export interface TrayMenuItem {
  /** Stable across rebuilds: the shell reports clicks by it. */
  id: string;
  label: string;
  type?: 'normal' | 'checkbox' | 'separator';
  checked?: boolean;
  click?: () => void;
}

export interface DesktopTray {
  setMenu(items: TrayMenuItem[]): void;
  setToolTip(text: string): void;
  /** Left click on the tray icon. */
  onClick(listener: () => void): void;
}

/** What the host shows if the DevPanel Server stops unexpectedly, in the current UI Language. */
export interface CrashTexts {
  title: string;
  message: string;
}

/**
 * What the desktop behaviour asks of the host that runs it (window, tray, dialogs, Start with
 * Windows, quitting). The host takes the single-instance lock before `runDesktop` starts: a second
 * launch never gets here.
 */
export interface DesktopHost {
  onBeforeQuit(listener: (event: QuitEvent) => void): void;
  /** Starts quitting; emits before-quit. */
  quit(): void;
  /** Ends the process now, without events. */
  exit(code: number): void;
  /** The window starts hidden; `show()` reveals it. */
  createWindow(url: string): DesktopWindow;
  createTray(): DesktopTray;
  /** Resolves once the user has dismissed the error. */
  showError(error: DesktopError): Promise<void>;
  /** Start with Windows, as the host last reported it. */
  isAutostartEnabled(): boolean;
  /** Asks the host to turn Start with Windows on or off; it confirms through `onAutostartChanged`. */
  requestAutostart(enabled: boolean): void;
  /** The host reports a new Start with Windows state. */
  onAutostartChanged(listener: (enabled: boolean) => void): void;
  /** The texts the host shows if the Server stops unexpectedly; replaces the previous ones. */
  setCrashTexts(texts: CrashTexts): void;
}

export interface DesktopOptions {
  host: DesktopHost;
  /** The Server's port: 7777 like the web version, so at most one DevPanel runs per machine. */
  port: number;
  /** Started with Windows: stay in the tray until the user opens the window. */
  startHidden: boolean;
  /** Starts the Server; `onExit` is called after "Exit DevPanel" in the UI has stopped everything. */
  startServer(onExit: () => void): Promise<RunningServer>;
  /** Asks whatever holds the port whether it is DevPanel (with the stored Access Key, see `probePort`). */
  probePort(port: number): Promise<PortProbe>;
  /** The UI Language stored in the app data folder; start-failure dialogs are in it. */
  readUiLanguage(): Promise<UiLanguage>;
}

export type DesktopResult = 'running' | 'startFailed';

const describe = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error));

/** Starts the desktop app: Server, window, tray, and Exit on quit. */
export async function runDesktop(options: DesktopOptions): Promise<DesktopResult> {
  const { host } = options;

  /** Set once every Service and Session is stopped and the Server closed: the process may end. */
  let stopped = false;
  let quitting = false;
  let server: RunningServer;
  try {
    server = await options.startServer(() => {
      // "Exit DevPanel" in the UI: everything is already stopped; let the window close too.
      stopped = true;
      quitting = true;
      host.quit();
    });
  } catch (error) {
    const language = await options.readUiLanguage();
    await host.showError({
      title: HOST_STRINGS[language].desktop.startFailedTitle,
      ...(await explainStartFailure(options, error, language)),
      language,
    });
    host.exit(1);
    return 'startFailed';
  }

  const window = host.createWindow(server.openUrl);
  window.onClose((event) => {
    // Closing the window is not Exit (ADR-0001): DevPanel keeps running in the tray.
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  if (!options.startHidden) window.show();

  const exitDevPanel = () => {
    quitting = true;
    void server.close().finally(() => {
      stopped = true;
      host.exit(0);
    });
  };
  host.onBeforeQuit((event) => {
    if (stopped) return;
    event.preventDefault();
    if (!quitting) exitDevPanel();
  });

  const tray = host.createTray();
  /** Builds the tooltip and menu in the current UI Language. */
  const renderMenu = () => {
    const language = server.uiLanguage();
    const strings = HOST_STRINGS[language].desktop;
    tray.setToolTip(strings.tooltip);
    tray.setMenu([
      { id: 'show', label: strings.show, click: () => window.show() },
      {
        id: 'stopAllRepos',
        label: strings.stopAllRepos,
        click: () => {
          server.stopAllRepos().catch((error: unknown) => {
            // In the UI Language current when it failed, not when the menu was built.
            const now = server.uiLanguage();
            const { stopAllFailedTitle, stopAllFailed } = HOST_STRINGS[now].desktop;
            void host.showError({ title: stopAllFailedTitle, message: stopAllFailed, details: describe(error), language: now });
          });
        },
      },
      { id: 'separator-1', label: '', type: 'separator' },
      {
        id: 'autostart',
        label: strings.autostart,
        type: 'checkbox',
        checked: host.isAutostartEnabled(),
        // The checkmark follows the host: it changes once the host reports the new state.
        click: () => host.requestAutostart(!host.isAutostartEnabled()),
      },
      { id: 'separator-2', label: '', type: 'separator' },
      { id: 'quit', label: strings.quit, click: () => host.quit() },
    ]);
  };
  /** The crash dialog the host may need later, in the current UI Language. */
  const publishCrashTexts = () => {
    const { crashedTitle, crashed } = HOST_STRINGS[server.uiLanguage()].desktop;
    host.setCrashTexts({ title: crashedTitle, message: crashed });
  };
  renderMenu();
  publishCrashTexts();
  server.onUiLanguageChanged(() => {
    renderMenu();
    publishCrashTexts();
  });
  host.onAutostartChanged(renderMenu);
  tray.onClick(() => window.show());
  return 'running';
}

/** Explains in plain language why the Server did not start; technical details only when unexpected. */
async function explainStartFailure(
  options: DesktopOptions,
  error: unknown,
  language: UiLanguage,
): Promise<Pick<DesktopError, 'message' | 'details'>> {
  const strings = HOST_STRINGS[language].desktop;
  if (!isAddressInUse(error)) return { message: strings.unexpected, details: describe(error) };
  const probe = await options.probePort(options.port).catch((): PortProbe => ({ kind: 'foreign' }));
  const blocker = portBlocker(probe);
  return { message: blocker ? portBlockerMessage(blocker, options.port, language) : strings.alreadyRunning };
}
