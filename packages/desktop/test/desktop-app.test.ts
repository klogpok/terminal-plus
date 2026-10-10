/**
 * The desktop app's main-process behavior, driven through `runDesktop` with a fake Electron host
 * (window, tray, login items, quit) and a fake DevPanel Server. The real Electron wiring is covered
 * by `electron.e2e.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_MESSAGES,
  runDesktop,
  type DesktopHost,
  type DesktopOptions,
  type DesktopTray,
  type DesktopWindow,
  type RunningServer,
  type TrayMenuItem,
} from '../src/desktop-app.js';

interface QuitEvent {
  prevented: boolean;
  preventDefault(): void;
}
const quitEvent = (): QuitEvent => ({
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

class FakeWindow implements DesktopWindow {
  visible = false;
  shows = 0;
  private closeListener?: (event: QuitEvent) => void;
  constructor(readonly url: string) {}
  show(): void {
    this.visible = true;
    this.shows++;
  }
  hide(): void {
    this.visible = false;
  }
  onClose(listener: (event: QuitEvent) => void): void {
    this.closeListener = listener;
  }
  /** The user clicks the window's X; returns whether the close went ahead. */
  clickClose(): boolean {
    const event = quitEvent();
    this.closeListener?.(event);
    if (!event.prevented) this.visible = false;
    return !event.prevented;
  }
}

class FakeTray implements DesktopTray {
  menu: TrayMenuItem[] = [];
  private clickListener?: () => void;
  setMenu(items: TrayMenuItem[]): void {
    this.menu = items;
  }
  onClick(listener: () => void): void {
    this.clickListener = listener;
  }
  click(): void {
    this.clickListener?.();
  }
  item(label: string): TrayMenuItem {
    const item = this.menu.find((i) => i.label === label);
    if (!item) throw new Error(`No tray item "${label}" in ${JSON.stringify(this.menu.map((i) => i.label))}`);
    return item;
  }
}

class FakeHost implements DesktopHost {
  lockAvailable = true;
  autostartEnabled = false;
  window?: FakeWindow;
  tray?: FakeTray;
  errors: { title: string; message: string }[] = [];
  exitCode?: number;
  quitRequests = 0;
  private secondInstance?: () => void;
  private beforeQuit?: (event: QuitEvent) => void;

  requestSingleInstanceLock(): boolean {
    return this.lockAvailable;
  }
  onSecondInstance(listener: () => void): void {
    this.secondInstance = listener;
  }
  onBeforeQuit(listener: (event: QuitEvent) => void): void {
    this.beforeQuit = listener;
  }
  createWindow(url: string): DesktopWindow {
    this.window = new FakeWindow(url);
    return this.window;
  }
  createTray(): DesktopTray {
    this.tray = new FakeTray();
    return this.tray;
  }
  showError(title: string, message: string): void {
    this.errors.push({ title, message });
  }
  isAutostartEnabled(): boolean {
    return this.autostartEnabled;
  }
  setAutostartEnabled(enabled: boolean): void {
    this.autostartEnabled = enabled;
  }
  /**
   * Like `app.quit()`: emits before-quit, then closes the windows; a listener preventing either
   * cancels the quit.
   */
  quit(): void {
    this.quitRequests++;
    const event = quitEvent();
    this.beforeQuit?.(event);
    if (event.prevented) return;
    if (this.window && !this.window.clickClose()) return;
    this.exitCode ??= 0;
  }
  /** Like `app.exit()`: no events, the process ends. */
  exit(code: number): void {
    this.exitCode ??= code;
  }
  launchSecondInstance(): void {
    this.secondInstance?.();
  }
}

class FakeServer implements RunningServer {
  openUrl = 'http://127.0.0.1:43210/#key=abc';
  closeCalls = 0;
  stopAllCalls = 0;
  closed = false;
  private finishClose?: () => void;
  constructor(private readonly closeImmediately = true) {}
  close(): Promise<void> {
    this.closeCalls++;
    if (this.closeImmediately) {
      this.closed = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.finishClose = () => {
        this.closed = true;
        resolve();
      };
    });
  }
  /** For a slow close: everything stopped now. */
  completeClose(): void {
    this.finishClose?.();
  }
  async stopAllRepos(): Promise<void> {
    this.stopAllCalls++;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<DesktopOptions> & { server?: FakeServer } = {}) {
  const host = new FakeHost();
  const server = overrides.server ?? new FakeServer();
  let requestExit: (() => void) | undefined;
  const options: DesktopOptions = {
    host,
    port: 7777,
    startHidden: false,
    startServer: async (onExit) => {
      requestExit = onExit;
      return server;
    },
    probePort: async () => ({ kind: 'free' }),
    ...overrides,
  };
  return { host, server, options, exitFromUi: () => requestExit?.() };
}

describe('single instance', () => {
  it('a second launch exits at once without starting a Server', async () => {
    const { host, options } = setup();
    host.lockAvailable = false;
    let started = false;
    const result = await runDesktop({ ...options, startServer: async () => ((started = true), new FakeServer()) });
    expect(result).toBe('secondInstance');
    expect(started).toBe(false);
    expect(host.exitCode).toBe(0);
    expect(host.window).toBeUndefined();
  });

  it('a second launch shows and focuses the existing window', async () => {
    const { host, options } = setup();
    expect(await runDesktop(options)).toBe('running');
    host.window!.hide();
    host.launchSecondInstance();
    expect(host.window!.visible).toBe(true);
  });
});

describe('window', () => {
  it('shows the Server URL with the Access Key, so the web UI runs unchanged', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    expect(host.window!.url).toBe(server.openUrl);
    expect(host.window!.visible).toBe(true);
  });

  it('started with Windows: stays in the tray until opened from it', async () => {
    const { host, options } = setup({ startHidden: true });
    await runDesktop(options);
    expect(host.window!.visible).toBe(false);
    host.tray!.click();
    expect(host.window!.visible).toBe(true);
  });

  it('closing the window hides it to the tray and stops nothing (closing is not Exit)', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    expect(host.window!.clickClose()).toBe(false);
    expect(host.window!.visible).toBe(false);
    expect(server.closeCalls).toBe(0);
    expect(host.exitCode).toBeUndefined();
    host.tray!.item(DESKTOP_MESSAGES.show).click!();
    expect(host.window!.visible).toBe(true);
  });
});

describe('tray', () => {
  it('offers show, "Stop all in all Repos", start with Windows, and quit', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.tray!.menu.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Показать DevPanel',
      'Остановить всё во всех репо',
      'Запускать вместе с Windows',
      'Выйти из DevPanel',
    ]);
  });

  it('"Stop all in all Repos" stops the Services and keeps DevPanel running', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    host.tray!.item(DESKTOP_MESSAGES.stopAllRepos).click!();
    await flush();
    expect(server.stopAllCalls).toBe(1);
    expect(server.closeCalls).toBe(0);
    expect(host.exitCode).toBeUndefined();
  });

  it('start with Windows is off by default and toggles from the tray', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.tray!.item(DESKTOP_MESSAGES.autostart)).toMatchObject({ type: 'checkbox', checked: false });
    host.tray!.item(DESKTOP_MESSAGES.autostart).click!();
    expect(host.autostartEnabled).toBe(true);
    expect(host.tray!.item(DESKTOP_MESSAGES.autostart).checked).toBe(true);
    host.tray!.item(DESKTOP_MESSAGES.autostart).click!();
    expect(host.autostartEnabled).toBe(false);
    expect(host.tray!.item(DESKTOP_MESSAGES.autostart).checked).toBe(false);
  });
});

describe('quit', () => {
  it('quit from the tray stops every Service and Session before the process ends', async () => {
    const server = new FakeServer(false);
    const { host, options } = setup({ server });
    await runDesktop(options);
    host.tray!.item(DESKTOP_MESSAGES.quit).click!();
    expect(server.closeCalls).toBe(1);
    await flush();
    expect(host.exitCode).toBeUndefined();
    // Another quit request meanwhile (e.g. Windows logoff) neither ends the process nor stops twice.
    host.quit();
    expect(server.closeCalls).toBe(1);
    server.completeClose();
    await flush();
    expect(server.closed).toBe(true);
    expect(host.exitCode).toBe(0);
  });

  it('while quitting, closing the window is allowed', async () => {
    const server = new FakeServer(false);
    const { host, options } = setup({ server });
    await runDesktop(options);
    host.quit();
    expect(host.window!.clickClose()).toBe(true);
  });

  it('"Exit DevPanel" in the UI (everything already stopped) ends the process', async () => {
    const { host, options, server, exitFromUi } = setup();
    await runDesktop(options);
    exitFromUi();
    await flush();
    expect(host.exitCode).toBe(0);
    expect(server.closeCalls).toBe(0);
  });
});

describe('start failures', () => {
  const inUse = () =>
    Object.assign(new Error('listen EADDRINUSE: address already in use 127.0.0.1:7777'), { code: 'EADDRINUSE' });

  it('DevPanel already runs on the port (e.g. from the .bat launcher): explains, exits', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw inUse();
      },
      probePort: async () => ({ kind: 'devpanel', keyValid: true }),
    });
    expect(await runDesktop(options)).toBe('startFailed');
    expect(host.errors).toEqual([{ title: 'DevPanel не запустился', message: DESKTOP_MESSAGES.alreadyRunning }]);
    expect(host.errors[0]!.message).toContain('DevPanel уже запущен');
    expect(host.exitCode).toBe(1);
    expect(host.window).toBeUndefined();
  });

  it('another program holds the port: names the port', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw inUse();
      },
      probePort: async () => ({ kind: 'foreign' }),
    });
    await runDesktop(options);
    expect(host.errors[0]!.message).toContain('Порт 7777 занят другой программой');
    expect(host.exitCode).toBe(1);
  });

  it('any other failure: shows the technical details', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw new Error('workspace.json is broken');
      },
    });
    await runDesktop(options);
    expect(host.errors[0]!.message).toContain('workspace.json is broken');
    expect(host.exitCode).toBe(1);
  });
});
