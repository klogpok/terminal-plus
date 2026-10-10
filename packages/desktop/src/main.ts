/**
 * Electron main process: hosts the DevPanel Server (and with it `core`) in-process and shows the
 * built `web` UI in a window. All behavior lives in `desktop-app.ts`; this file only adapts Electron.
 *
 * Environment (same names as the web version's Server):
 * - DEVPANEL_APP_DATA: app data directory (default %APPDATA%\DevPanel, shared with the web version)
 * - DEVPANEL_PORT: port (default 7777)
 * Command line: `--hidden` starts in the tray (used by start with Windows).
 */
import path from 'node:path';
import { BrowserWindow, Menu, Tray, app, dialog, nativeImage, shell, type NativeImage } from 'electron';
import { probePort, readStoredAccessKey, startDevPanel } from '@devpanel/server';
import { DEFAULT_PORT, HOST_STRINGS } from '@devpanel/shared';
import { runDesktop, type DesktopError, type DesktopHost, type DesktopTray, type DesktopWindow } from './desktop-app.js';

const APP_ID = 'com.devpanel.desktop';
const HIDDEN_ARG = '--hidden';

const appDataDir = process.env.DEVPANEL_APP_DATA ?? path.join(app.getPath('appData'), 'DevPanel');
const port = process.env.DEVPANEL_PORT ? Number(process.env.DEVPANEL_PORT) : DEFAULT_PORT;
// Electron's own data (Chromium cache, the single-instance lock) stays out of the app data files
// and follows DEVPANEL_APP_DATA, so a test instance never collides with the installed app.
app.setPath('userData', path.join(appDataDir, 'desktop'));
app.setAppUserModelId(APP_ID);

/** The built `web` UI: next to the app when installed, from the workspace in development. */
const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(app.getAppPath(), '..', 'web', 'dist', 'browser');
const icon = (): NativeImage => nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png'));

/** Start with Windows launches the same app, in the tray. In development, also pass the app folder. */
const loginItem = () => ({ path: process.execPath, args: app.isPackaged ? [HIDDEN_ARG] : [app.getAppPath(), HIDDEN_ARG] });

function createWindow(url: string): DesktopWindow {
  const window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    title: 'DevPanel',
    icon: icon(),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const origin = new URL(url).origin;
  const openOutside = (target: string) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
  };
  // Links to other sites (a Service's URL, docs) open in the browser, never inside the app window.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    openOutside(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      openOutside(target);
    }
  });
  void window.loadURL(url);
  return {
    show() {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
    hide: () => window.hide(),
    onClose: (listener) => window.on('close', listener),
  };
}

function createTray(): DesktopTray {
  const tray = new Tray(icon());
  tray.setToolTip(HOST_STRINGS.desktop.tooltip);
  return {
    setMenu: (items) => tray.setContextMenu(Menu.buildFromTemplate(items)),
    onClick: (listener) => tray.on('click', listener),
  };
}

/**
 * A plain-Russian error box. Technical details stay folded away: a "Подробности" button opens them
 * in a second box (Windows message boxes have no expandable section).
 */
async function showError({ title, message, details }: DesktopError): Promise<void> {
  const { ok, details: detailsButton, detailsTitle } = HOST_STRINGS.desktop;
  const buttons = details ? [ok, detailsButton] : [ok];
  const { response } = await dialog.showMessageBox({ type: 'error', title, message, buttons, defaultId: 0, noLink: true });
  if (details && response === 1) {
    await dialog.showMessageBox({ type: 'info', title: detailsTitle, message, detail: details, buttons: [ok], noLink: true });
  }
}

const host: DesktopHost = {
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  onSecondInstance: (listener) => app.on('second-instance', listener),
  onBeforeQuit: (listener) => app.on('before-quit', listener),
  quit: () => app.quit(),
  exit: (code) => app.exit(code),
  createWindow,
  createTray,
  showError,
  isAutostartEnabled: () => app.getLoginItemSettings(loginItem()).openAtLogin,
  setAutostartEnabled: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled, ...loginItem() }),
};

// The window hides instead of closing, so this only matters while quitting: never quit from here.
app.on('window-all-closed', () => undefined);

void app.whenReady().then(() =>
  runDesktop({
    host,
    port,
    startHidden: process.argv.includes(HIDDEN_ARG),
    probePort: async (p) => probePort(p, await readStoredAccessKey(appDataDir)),
    startServer: async (onExit) => {
      const devPanel = await startDevPanel({ appDataDir, port, webRoot, onExit });
      return {
        openUrl: devPanel.openUrl,
        close: () => devPanel.close(),
        stopAllRepos: () => devPanel.core.stopAllRepos(),
      };
    },
  }),
);
