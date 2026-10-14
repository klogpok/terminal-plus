/**
 * The desktop app's main-process behavior, driven through `runDesktop` with a fake host (window,
 * tray, Start with Windows, crash texts, quit) and a fake DevPanel Server. The real wiring is covered by `sidecar.e2e.test.ts` (the
 * shell–sidecar protocol) and the optional built-app test `tauri.e2e.test.ts` (single instance).
 */
import { describe, expect, it } from 'vitest';
import { HOST_STRINGS, type ServiceSetStartResult, type ServiceSetView, type UiLanguage } from '@devpanel/shared';
import {
  runDesktop,
  type CrashTexts,
  type DesktopError,
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
  tooltip?: string;
  setToolTip(text: string): void {
    this.tooltip = text;
  }
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
  /** Start with Windows as the host (the OS) has it. */
  autostartEnabled = false;
  /** When false, requests wait for `confirmAutostart()`, like a slow shell. */
  autostartConfirmsAtOnce = true;
  autostartRequests: boolean[] = [];
  window?: FakeWindow;
  tray?: FakeTray;
  errors: DesktopError[] = [];
  crashTexts: CrashTexts[] = [];
  exitCode?: number;
  quitRequests = 0;
  private beforeQuit?: (event: QuitEvent) => void;
  private autostartListener?: (enabled: boolean) => void;

  isAutostartEnabled(): boolean {
    return this.autostartEnabled;
  }
  requestAutostart(enabled: boolean): void {
    this.autostartRequests.push(enabled);
    if (this.autostartConfirmsAtOnce) this.confirmAutostart();
  }
  onAutostartChanged(listener: (enabled: boolean) => void): void {
    this.autostartListener = listener;
  }
  /** The host applies the last request and reports the new state. */
  confirmAutostart(): void {
    const requested = this.autostartRequests.at(-1);
    if (requested === undefined) return;
    this.reportAutostart(requested);
  }
  /** The host reports a Start with Windows state (after a request, or changed outside DevPanel). */
  reportAutostart(enabled: boolean): void {
    this.autostartEnabled = enabled;
    this.autostartListener?.(enabled);
  }
  setCrashTexts(texts: CrashTexts): void {
    this.crashTexts.push(texts);
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
  async showError(error: DesktopError): Promise<void> {
    this.errors.push(error);
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
  stopAllFailure?: Error;
  async stopAllRepos(): Promise<void> {
    this.stopAllCalls++;
    if (this.stopAllFailure) throw this.stopAllFailure;
  }
  language: UiLanguage = 'en';
  private languageListeners: ((language: UiLanguage) => void)[] = [];
  uiLanguage(): UiLanguage {
    return this.language;
  }
  onUiLanguageChanged(listener: (language: UiLanguage) => void): void {
    this.languageListeners.push(listener);
  }
  /** The UI Language is switched in the window (`uiLanguageChanged`). */
  switchUiLanguage(language: UiLanguage): void {
    this.language = language;
    for (const listener of this.languageListeners) listener(language);
  }
  sets: ServiceSetView[] = [];
  private setsListeners: ((sets: ServiceSetView[]) => void)[] = [];
  serviceSets(): ServiceSetView[] {
    return this.sets;
  }
  onServiceSetsChanged(listener: (sets: ServiceSetView[]) => void): void {
    this.setsListeners.push(listener);
  }
  /** The Service Sets change, in this or another window (`serviceSetsChanged`). */
  changeServiceSets(sets: ServiceSetView[]): void {
    this.sets = sets;
    for (const listener of this.setsListeners) listener(sets);
  }
  startSetCalls: string[] = [];
  /** What `startServiceSet` resolves with; or rejects with `startSetFailure`. */
  startSetResult: ServiceSetStartResult = { notFound: [], notRunning: [] };
  startSetFailure?: Error;
  async startServiceSet(id: string): Promise<ServiceSetStartResult> {
    this.startSetCalls.push(id);
    if (this.startSetFailure) throw this.startSetFailure;
    return this.startSetResult;
  }
}

const aSet = (id: string, name: string): ServiceSetView => ({
  id,
  name,
  services: [{ ref: { repoId: 'r1', serviceId: 'api' }, repoName: 'Billing', serviceName: 'API', found: true }],
});

const EN = HOST_STRINGS.en.desktop;
const RU = HOST_STRINGS.ru.desktop;

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
    readUiLanguage: async () => 'en',
    ...overrides,
  };
  return { host, server, options, exitFromUi: () => requestExit?.() };
}

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
    host.tray!.item(EN.show).click!();
    expect(host.window!.visible).toBe(true);
  });
});

describe('tray', () => {
  it('offers show, "Stop everything in all Repos", start with Windows, and quit, in English by default', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.tray!.menu.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Show DevPanel',
      'Stop everything in all Repos',
      'Start with Windows',
      'Exit DevPanel',
    ]);
    expect(host.tray!.tooltip).toBe('DevPanel');
  });

  it('is in Russian when the Server starts with the UI Language ru', async () => {
    const server = new FakeServer();
    server.language = 'ru';
    const { host, options } = setup({ server });
    await runDesktop(options);
    expect(host.tray!.menu.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Показать DevPanel',
      'Остановить всё во всех репо',
      'Запускать вместе с Windows',
      'Выйти из DevPanel',
    ]);
    expect(host.tray!.tooltip).toBe(RU.tooltip);
  });

  it('is rebuilt in the new UI Language right after it changes in the window, keeping its state', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    host.tray!.item(EN.autostart).click!();

    server.switchUiLanguage('ru');

    expect(host.tray!.menu.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Показать DevPanel',
      'Остановить всё во всех репо',
      'Запускать вместе с Windows',
      'Выйти из DevPanel',
    ]);
    expect(host.tray!.item(RU.autostart).checked).toBe(true);
    expect(host.tray!.tooltip).toBe(RU.tooltip);
    host.window!.hide();
    host.tray!.item(RU.show).click!();
    expect(host.window!.visible).toBe(true);
  });

  it('a failed "Stop everything in all Repos" after switching to ru explains in Russian', async () => {
    const server = new FakeServer();
    server.stopAllFailure = new Error('taskkill failed');
    const { host, options } = setup({ server });
    await runDesktop(options);
    server.switchUiLanguage('ru');
    host.tray!.item(RU.stopAllRepos).click!();
    await flush();
    expect(host.errors).toMatchObject([{ title: RU.stopAllFailedTitle, message: RU.stopAllFailed, language: 'ru' }]);
  });

  it('"Stop everything in all Repos" stops the Services and keeps DevPanel running', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    host.tray!.item(EN.stopAllRepos).click!();
    await flush();
    expect(server.stopAllCalls).toBe(1);
    expect(server.closeCalls).toBe(0);
    expect(host.exitCode).toBeUndefined();
  });

  it('a failed "Stop everything in all Repos" explains in plain language with the technical details apart', async () => {
    const server = new FakeServer();
    server.stopAllFailure = new Error('taskkill failed for PID 4242');
    const { host, options } = setup({ server });
    await runDesktop(options);
    host.tray!.item(EN.stopAllRepos).click!();
    await flush();
    expect(host.errors).toEqual([
      {
        title: 'Could not stop everything',
        message: EN.stopAllFailed,
        details: expect.stringContaining('taskkill failed for PID 4242'),
        language: 'en',
      },
    ]);
  });

  it('start with Windows shows the state the host reports at start', async () => {
    const { host, options } = setup();
    host.autostartEnabled = true;
    await runDesktop(options);
    expect(host.tray!.item(EN.autostart)).toMatchObject({ type: 'checkbox', checked: true });
  });

  it('start with Windows toggles from the tray by asking the host', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.tray!.item(EN.autostart)).toMatchObject({ type: 'checkbox', checked: false });
    host.tray!.item(EN.autostart).click!();
    expect(host.autostartRequests).toEqual([true]);
    expect(host.tray!.item(EN.autostart).checked).toBe(true);
    host.tray!.item(EN.autostart).click!();
    expect(host.autostartRequests).toEqual([true, false]);
    expect(host.tray!.item(EN.autostart).checked).toBe(false);
  });

  it('the start with Windows checkmark changes only once the host confirms', async () => {
    const { host, options } = setup();
    host.autostartConfirmsAtOnce = false;
    await runDesktop(options);
    host.tray!.item(EN.autostart).click!();
    expect(host.autostartRequests).toEqual([true]);
    expect(host.tray!.item(EN.autostart).checked).toBe(false);
    host.confirmAutostart();
    expect(host.tray!.item(EN.autostart).checked).toBe(true);
  });
});

describe('Service Sets in the tray', () => {
  const labels = (tray: FakeTray) => tray.menu.filter((i) => i.type !== 'separator').map((i) => i.label);

  it('lists the Sets in order between Show and "Stop everything in all Repos", with ids from the Set ids', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'Morning'), aSet('s2', 'Billing only')];
    const { host, options } = setup({ server });
    await runDesktop(options);
    expect(labels(host.tray!)).toEqual([
      'Show DevPanel',
      'Morning',
      'Billing only',
      'Stop everything in all Repos',
      'Start with Windows',
      'Exit DevPanel',
    ]);
    expect(host.tray!.item('Morning').id).toBe('serviceSet:s1');
    expect(host.tray!.item('Billing only').id).toBe('serviceSet:s2');
    const ids = host.tray!.menu.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows an "&" in a Set name literally (Windows menus read a single "&" as a mnemonic)', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'R&D')];
    const { host, options } = setup({ server });
    await runDesktop(options);
    expect(host.tray!.menu.find((i) => i.id === 'serviceSet:s1')!.label).toBe('R&&D');
  });

  it('is rebuilt when the Sets change, in the current UI Language', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    server.switchUiLanguage('ru');

    server.changeServiceSets([aSet('s1', 'Morning')]);

    expect(labels(host.tray!)).toEqual([RU.show, 'Morning', RU.stopAllRepos, RU.autostart, RU.quit]);

    server.changeServiceSets([]);

    expect(labels(host.tray!)).toEqual([RU.show, RU.stopAllRepos, RU.autostart, RU.quit]);
  });

  it('clicking a Set starts it and keeps the window hidden when every Service reached running', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'Morning'), aSet('s2', 'Evening')];
    const { host, options } = setup({ server, startHidden: true });
    await runDesktop(options);

    host.tray!.item('Evening').click!();
    await flush();

    expect(server.startSetCalls).toEqual(['s2']);
    expect(host.window!.visible).toBe(false);
    expect(host.window!.shows).toBe(0);
    expect(host.errors).toEqual([]);
  });

  it('shows the window when some Service of the Set did not reach running', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'Morning')];
    server.startSetResult = { notFound: [], notRunning: [{ repoId: 'r1', serviceId: 'api' }] };
    const { host, options } = setup({ server, startHidden: true });
    await runDesktop(options);

    host.tray!.item('Morning').click!();
    await flush();

    expect(host.window!.visible).toBe(true);
    // The web shows the message itself (`serviceSetStartReported`).
    expect(host.errors).toEqual([]);
  });

  it('shows the window when some Service of the Set was not found', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'Morning')];
    server.startSetResult = { notFound: [{ repoId: 'r1', serviceId: 'api' }], notRunning: [] };
    const { host, options } = setup({ server, startHidden: true });
    await runDesktop(options);

    host.tray!.item('Morning').click!();
    await flush();

    expect(host.window!.visible).toBe(true);
  });

  it('a start that fails shows the window and explains in the UI Language current at failure', async () => {
    const server = new FakeServer();
    server.sets = [aSet('s1', 'Morning')];
    server.startSetFailure = new Error('This Service Set no longer exists');
    const { host, options } = setup({ server, startHidden: true });
    await runDesktop(options);

    host.tray!.item('Morning').click!();
    server.switchUiLanguage('ru');
    await flush();

    expect(host.window!.visible).toBe(true);
    expect(host.errors).toEqual([
      {
        title: RU.serviceSetStartFailedTitle,
        message: RU.serviceSetStartFailed('Morning'),
        details: expect.stringContaining('This Service Set no longer exists'),
        language: 'ru',
      },
    ]);
  });

  it('with no Sets the menu is exactly as before (no extra separator)', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.tray!.menu.map((i) => i.id)).toEqual(['show', 'stopAllRepos', 'separator-1', 'autostart', 'separator-2', 'quit']);
  });
});

describe('crash texts', () => {
  it('are handed to the host at start, in the UI Language', async () => {
    const { host, options } = setup();
    await runDesktop(options);
    expect(host.crashTexts).toEqual([
      {
        title: 'DevPanel stopped',
        message: 'DevPanel stopped unexpectedly and will close. Start it again from the Start menu.',
      },
    ]);
  });

  it('are handed to the host again in the new UI Language after it changes', async () => {
    const { host, options, server } = setup();
    await runDesktop(options);
    server.switchUiLanguage('ru');
    expect(host.crashTexts.at(-1)).toEqual({
      title: 'DevPanel остановился',
      message: 'DevPanel неожиданно остановился и будет закрыт. Запустите его снова из меню «Пуск».',
    });
    server.switchUiLanguage('en');
    expect(host.crashTexts.at(-1)).toEqual({ title: EN.crashedTitle, message: EN.crashed });
  });
});

describe('quit', () => {
  it('quit from the tray stops every Service and Session before the process ends', async () => {
    const server = new FakeServer(false);
    const { host, options } = setup({ server });
    await runDesktop(options);
    host.tray!.item(EN.quit).click!();
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
    expect(host.errors).toEqual([{ title: 'DevPanel did not start', message: EN.alreadyRunning, language: 'en' }]);
    expect(host.errors[0]!.message).toContain('DevPanel is already running in another window');
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
    expect(host.errors[0]!.message).toContain('port 7777 is used by another program');
    expect(host.exitCode).toBe(1);
  });

  it('a DevPanel with another app data folder holds the port: says so, exits', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw inUse();
      },
      probePort: async () => ({ kind: 'devpanel', keyValid: false }),
    });
    await runDesktop(options);
    expect(host.errors).toEqual([
      { title: 'DevPanel did not start', message: HOST_STRINGS.en.keyMismatch, language: 'en' },
    ]);
    expect(host.exitCode).toBe(1);
  });

  it('any other failure: a plain message, with the technical details apart under "Details"', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw new Error('workspace.json is broken');
      },
    });
    await runDesktop(options);
    expect(host.errors).toEqual([
      {
        title: 'DevPanel did not start',
        message: EN.unexpected,
        details: expect.stringContaining('workspace.json is broken'),
        language: 'en',
      },
    ]);
    expect(host.exitCode).toBe(1);
  });

  it('is shown in the stored UI Language', async () => {
    const { host, options } = setup({
      startServer: async () => {
        throw inUse();
      },
      probePort: async () => ({ kind: 'foreign' }),
      readUiLanguage: async () => 'ru',
    });
    await runDesktop(options);
    expect(host.errors).toEqual([
      { title: 'DevPanel не запустился', message: HOST_STRINGS.ru.portTaken(7777), language: 'ru' },
    ]);
  });
});
