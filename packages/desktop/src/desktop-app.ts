/**
 * The desktop app's main-process behavior, free of Electron imports: `main.ts` passes the real
 * Electron objects through `DesktopHost`, tests pass fakes.
 *
 * The Electron main process hosts the DevPanel Server (ADR-0001) in-process, on the same
 * 127.0.0.1 WebSocket transport as the web version (ADR-0002); the window just loads the Server's
 * URL with the Access Key in the fragment, so the `web` build runs unchanged.
 */

/** Whatever answers on the port (see `probePort` in `@devpanel/server`). */
export type PortProbe = { kind: 'free' } | { kind: 'devpanel'; keyValid: boolean } | { kind: 'foreign' };

/** The DevPanel Server running inside this process. */
export interface RunningServer {
  /** URL with the Access Key in the fragment. */
  openUrl: string;
  /** Exit: stops every Service and Session, then the Server. Idempotent. */
  close(): Promise<void>;
  /** "Stop all in all Repos": every Service of every Repo; Sessions keep running. */
  stopAllRepos(): Promise<void>;
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
  label: string;
  type?: 'normal' | 'checkbox' | 'separator';
  checked?: boolean;
  click?: () => void;
}

export interface DesktopTray {
  setMenu(items: TrayMenuItem[]): void;
  /** Left click on the tray icon. */
  onClick(listener: () => void): void;
}

/** The parts of Electron the app uses (`app`, `BrowserWindow`, `Tray`, `dialog`). */
export interface DesktopHost {
  requestSingleInstanceLock(): boolean;
  onSecondInstance(listener: () => void): void;
  onBeforeQuit(listener: (event: QuitEvent) => void): void;
  /** Starts quitting; emits before-quit. */
  quit(): void;
  /** Ends the process now, without events. */
  exit(code: number): void;
  /** The window starts hidden; `show()` reveals it. */
  createWindow(url: string): DesktopWindow;
  createTray(): DesktopTray;
  showError(title: string, message: string): void;
  isAutostartEnabled(): boolean;
  setAutostartEnabled(enabled: boolean): void;
}

export interface DesktopOptions {
  host: DesktopHost;
  /** The Server's port: 7777 like the web version, so at most one DevPanel runs per machine. */
  port: number;
  /** Started with Windows: stay in the tray until the user opens the window. */
  startHidden: boolean;
  /** Starts the Server; `onExit` is called after "Exit DevPanel" in the UI has stopped everything. */
  startServer(onExit: () => void): Promise<RunningServer>;
  probePort(port: number): Promise<PortProbe>;
}

export type DesktopResult = 'running' | 'secondInstance' | 'startFailed';

/** Everything the desktop shell itself says, in plain Russian. */
export const DESKTOP_MESSAGES = {
  tooltip: 'DevPanel',
  show: 'Показать DevPanel',
  stopAllRepos: 'Остановить всё во всех репо',
  autostart: 'Запускать вместе с Windows',
  quit: 'Выйти из DevPanel',
  startFailedTitle: 'DevPanel не запустился',
  alreadyRunning:
    'DevPanel уже запущен в другом окне (например, через start-devpanel.bat).\n\n' +
    'Закройте его кнопкой «Выйти из DevPanel» (или закройте его чёрное окно) и откройте приложение снова.',
  portTaken: (port: number) =>
    `Порт ${port} занят другой программой (это не DevPanel).\n\n` +
    `Закройте программу, которая использует порт ${port}, или перезагрузите компьютер, и откройте DevPanel снова.`,
  unexpected: (details: string) => `Что-то пошло не так при запуске.\n\nПодробности для разработчика:\n${details}`,
  stopAllFailedTitle: 'Не удалось остановить всё',
} as const;

const isAddressInUse = (error: unknown) => (error as { code?: unknown }).code === 'EADDRINUSE';
const describe = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error));

/** Starts the desktop app: single-instance lock, Server, window, tray, and Exit on quit. */
export async function runDesktop(options: DesktopOptions): Promise<DesktopResult> {
  const { host } = options;
  if (!host.requestSingleInstanceLock()) {
    // The first instance gets `second-instance` and shows its window.
    host.exit(0);
    return 'secondInstance';
  }

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
    host.showError(DESKTOP_MESSAGES.startFailedTitle, await startFailureMessage(options, error));
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
  host.onSecondInstance(() => window.show());

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
  const renderMenu = () =>
    tray.setMenu([
      { label: DESKTOP_MESSAGES.show, click: () => window.show() },
      {
        label: DESKTOP_MESSAGES.stopAllRepos,
        click: () => {
          server.stopAllRepos().catch((error: unknown) => host.showError(DESKTOP_MESSAGES.stopAllFailedTitle, describe(error)));
        },
      },
      { label: '', type: 'separator' },
      {
        label: DESKTOP_MESSAGES.autostart,
        type: 'checkbox',
        checked: host.isAutostartEnabled(),
        click: () => {
          host.setAutostartEnabled(!host.isAutostartEnabled());
          renderMenu();
        },
      },
      { label: '', type: 'separator' },
      { label: DESKTOP_MESSAGES.quit, click: () => host.quit() },
    ]);
  renderMenu();
  tray.onClick(() => window.show());
  return 'running';
}

/** Explains in plain Russian why the Server did not start. */
async function startFailureMessage(options: DesktopOptions, error: unknown): Promise<string> {
  if (isAddressInUse(error)) {
    const probe = await options.probePort(options.port).catch((): PortProbe => ({ kind: 'foreign' }));
    if (probe.kind === 'devpanel') return DESKTOP_MESSAGES.alreadyRunning;
    if (probe.kind === 'foreign') return DESKTOP_MESSAGES.portTaken(options.port);
  }
  return DESKTOP_MESSAGES.unexpected(describe(error));
}
