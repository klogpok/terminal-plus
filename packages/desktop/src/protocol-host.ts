/**
 * The production `DesktopHost`: an adapter over the shell–sidecar protocol (`protocol.ts`). Every
 * host call becomes a sidecar message; every shell message becomes a host event. The shell only
 * executes; all decisions stay in `runDesktop`.
 */
import type { DesktopShell } from '@devpanel/core';
import { HOST_STRINGS } from '@devpanel/shared';
import type { DesktopHost, DesktopTray, DesktopWindow, QuitEvent, TrayMenuItem } from './desktop-app.js';
import { parseShellMessage, type ShellMessage, type SidecarMessage } from './protocol.js';

export type StartMessage = Extract<ShellMessage, { type: 'start' }>;

export interface ShellConnectionOptions {
  /** Writes one message to the shell. */
  send(message: SidecarMessage): void;
  /** The sidecar's own log (stderr). */
  log(text: string): void;
  /** Ends the sidecar process, after the messages already sent have reached the shell. */
  exitProcess(code: number): void;
  /** The folder picker; it returns a path, so it runs in the sidecar, not in the shell. */
  pickFolder(): Promise<string | undefined>;
}

export interface ShellConnection {
  /** Handles one line the shell wrote. Malformed or unexpected lines are logged and ignored. */
  receiveLine(line: string): void;
  /** Resolves with the shell's `start` message. */
  started: Promise<StartMessage>;
  host: DesktopHost;
  /** For `core`: opening URLs and folders is delegated to the shell, outside the sidecar's Job Object. */
  desktopShell: DesktopShell;
}

type Listener<A extends unknown[] = []> = (...args: A) => void;

/** Quit/close events: `preventDefault` keeps the window or the app. */
function emit(listeners: Listener<[QuitEvent]>[]): boolean {
  let prevented = false;
  const event: QuitEvent = { preventDefault: () => (prevented = true) };
  for (const listener of listeners) listener(event);
  return prevented;
}

export function connectShell(options: ShellConnectionOptions): ShellConnection {
  const { send, log } = options;
  let resolveStarted!: (message: StartMessage) => void;
  const started = new Promise<StartMessage>((resolve) => (resolveStarted = resolve));
  let isStarted = false;
  let autostartEnabled = false;

  const beforeQuitListeners: Listener<[QuitEvent]>[] = [];
  const closeListeners: Listener<[QuitEvent]>[] = [];
  const trayClickListeners: Listener[] = [];
  const autostartListeners: Listener<[boolean]>[] = [];
  let trayItems: TrayMenuItem[] = [];
  let nextDialogId = 1;
  const dialogs = new Map<number, () => void>();
  let exiting = false;

  const host: DesktopHost = {
    onBeforeQuit: (listener) => beforeQuitListeners.push(listener),
    quit() {
      if (!emit(beforeQuitListeners)) host.exit(0);
    },
    exit(code) {
      if (exiting) return;
      exiting = true;
      send({ type: 'exit', code });
      options.exitProcess(code);
    },
    createWindow(url): DesktopWindow {
      // `runDesktop` shows the window right after creating it unless started hidden: fold that
      // into `openWindow`, so the shell creates the window visible or hidden in one go.
      let opened = false;
      let show = false;
      queueMicrotask(() => {
        opened = true;
        send({ type: 'openWindow', url, show });
      });
      return {
        show: () => (opened ? send({ type: 'showWindow' }) : (show = true)),
        hide: () => (opened ? send({ type: 'hideWindow' }) : (show = false)),
        onClose: (listener) => closeListeners.push(listener),
      };
    },
    createTray(): DesktopTray {
      // The tooltip and the menu travel together in `setTray`; one message per synchronous rebuild.
      let tooltip = '';
      let scheduled = false;
      const publish = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const items = trayItems.map(({ id, label, type, checked }) => ({
            id,
            label,
            kind: type ?? 'normal',
            ...(checked === undefined ? {} : { checked }),
          }));
          send({ type: 'setTray', tooltip, items });
        });
      };
      return {
        setMenu: (items) => {
          trayItems = items;
          publish();
        },
        setToolTip: (text) => {
          tooltip = text;
          publish();
        },
        onClick: (listener) => trayClickListeners.push(listener),
      };
    },
    showError({ title, message, details, language }) {
      const dialogId = nextDialogId++;
      const { ok, details: detailsButton, detailsTitle } = HOST_STRINGS[language].desktop;
      return new Promise<void>((resolve) => {
        dialogs.set(dialogId, resolve);
        send({
          type: 'showError',
          dialogId,
          title,
          message,
          ...(details === undefined ? {} : { details }),
          language,
          buttons: { ok, details: detailsButton, detailsTitle },
        });
      });
    },
    isAutostartEnabled: () => autostartEnabled,
    requestAutostart: (enabled) => send({ type: 'setAutostart', enabled }),
    onAutostartChanged: (listener) => autostartListeners.push(listener),
    setCrashTexts: ({ title, message }) => send({ type: 'setCrashTexts', title, message }),
  };

  const handle = (message: ShellMessage) => {
    if (message.type === 'start') {
      if (isStarted) return log('Ignoring a second start message.');
      isStarted = true;
      autostartEnabled = message.autostartEnabled;
      resolveStarted(message);
      return;
    }
    if (!isStarted) return log(`Ignoring ${message.type} before start.`);
    switch (message.type) {
      case 'trayClicked':
        for (const listener of trayClickListeners) listener();
        return;
      case 'trayItemClicked': {
        const item = trayItems.find((i) => i.id === message.itemId);
        if (!item?.click) return log(`Ignoring a click on unknown tray item "${message.itemId}".`);
        return item.click();
      }
      case 'windowCloseRequested':
        // A close nobody prevented happens while quitting: the shell keeps the window until `exit`.
        emit(closeListeners);
        return;
      case 'quitRequested':
        return host.quit();
      case 'autostartChanged':
        autostartEnabled = message.enabled;
        for (const listener of autostartListeners) listener(message.enabled);
        return;
      case 'errorDismissed': {
        const dismiss = dialogs.get(message.dialogId);
        if (!dismiss) return log(`Ignoring errorDismissed for unknown dialog ${message.dialogId}.`);
        dialogs.delete(message.dialogId);
        return dismiss();
      }
    }
  };

  const desktopShell: DesktopShell = {
    pickFolder: () => options.pickFolder(),
    async openFolder(folder) {
      send({ type: 'openFolder', path: folder });
    },
    async openUrl(url) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Refusing to open a non-http(s) URL: ${url}`);
      }
      send({ type: 'openUrl', url: parsed.href });
    },
  };

  return {
    receiveLine(line) {
      if (line.trim() === '') return;
      const parsed = parseShellMessage(line);
      if (!parsed.ok) return log(`Ignoring a malformed protocol line (${parsed.error}): ${line}`);
      try {
        handle(parsed.message);
      } catch (error) {
        log(`Handling ${parsed.message.type} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      }
    },
    started,
    host,
    desktopShell,
  };
}
