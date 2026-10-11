/**
 * Every user-facing string shown outside the web UI: the launcher's console lines, the desktop
 * app's tray and dialogs, and text `core` writes into Service output. One host string set per UI
 * Language: English (the default) and Russian. Both have the type `HostStrings`, so a key missing
 * from either fails to compile. Read them through `HOST_STRINGS[language]`.
 *
 * The web UI's strings sit beside these in `packages/web/src/app/strings.ts`; those two places are
 * the only ones user-facing text lives in.
 */
import type { UiLanguage } from './index.js';

const EN_HOST_STRINGS = {
  /** Another program (not DevPanel) holds the Server port. Launcher and desktop app. */
  portTaken: (port: number) =>
    `Could not start DevPanel: port ${port} is used by another program (not DevPanel).\n` +
    `Close the program that uses port ${port}, or restart the computer, and start DevPanel again.`,
  /** A DevPanel runs on the port with another app data folder (its Access Key is not ours). */
  keyMismatch:
    'DevPanel is already running, but with a different data folder, so it cannot be opened from here.\n' +
    'Close the window of the running DevPanel (or press "Exit DevPanel" in it) and start DevPanel again.',

  /** Dimmed line `core` writes into a Service's terminal before each new run (`time` is HH:MM). */
  restartSeparator: (time: string) => `── restart ${time} ──`,

  /** Console lines of the `.bat` launcher. */
  launcher: {
    notBuilt: 'DevPanel is not built. Ask a developer to run in the DevPanel folder: pnpm install, then pnpm build.',
    starting: 'DevPanel is starting...',
    started: (url: string) =>
      `DevPanel is running: ${url}\n` +
      'The browser is open. Keep this window open while you work: closing it stops all DevPanel Services and Sessions.',
    alreadyRunning: 'DevPanel is already running. Opening another browser tab.',
    browserFailed: (url: string) => `Could not open the browser. Open this address yourself: ${url}`,
    /** Printed before the technical details of an unexpected failure. */
    failed: 'Could not start DevPanel. Show this text to a developer:',
    /** Shown when DEVPANEL_BROWSER=none instead of opening a browser. */
    url: (url: string) => `URL: ${url}`,
  },

  /** Tray menu and dialogs of the desktop app. */
  desktop: {
    tooltip: 'DevPanel',
    show: 'Show DevPanel',
    stopAllRepos: 'Stop all in all Repos',
    autostart: 'Start with Windows',
    quit: 'Exit DevPanel',
    startFailedTitle: 'DevPanel did not start',
    alreadyRunning:
      'DevPanel is already running in another window (for example, from start-devpanel.bat).\n\n' +
      'Close it with "Exit DevPanel" (or close its black window) and open the app again.',
    unexpected: 'Something went wrong while starting. Press "Details" and show the text to a developer.',
    stopAllFailedTitle: 'Could not stop everything',
    stopAllFailed: 'Some Services could not be stopped. Press "Details" and show the text to a developer.',
    /** Error dialog buttons. */
    ok: 'OK',
    details: 'Details',
    detailsTitle: 'Details for a developer',
  },
};

/** The shape of a host string set; the English set defines it. */
export type HostStrings = typeof EN_HOST_STRINGS;

const RU_HOST_STRINGS: HostStrings = {
  portTaken: (port: number) =>
    `Не удалось запустить DevPanel: порт ${port} занят другой программой (это не DevPanel).\n` +
    `Закройте программу, которая использует порт ${port}, или перезагрузите компьютер, и запустите DevPanel снова.`,
  keyMismatch:
    'DevPanel уже работает, но запущен с другой папкой данных, поэтому открыть его отсюда не получается.\n' +
    'Закройте окно уже запущенного DevPanel (или нажмите в нём «Выйти из DevPanel») и запустите DevPanel снова.',

  restartSeparator: (time: string) => `── перезапуск ${time} ──`,

  launcher: {
    notBuilt: 'DevPanel не собран. Попросите разработчика выполнить в папке DevPanel: pnpm install, затем pnpm build.',
    starting: 'DevPanel запускается...',
    started: (url: string) =>
      `DevPanel работает: ${url}\n` +
      'Браузер открыт. Не закрывайте это окно, пока работаете: закрытие окна останавливает все сервисы и сессии DevPanel.',
    alreadyRunning: 'DevPanel уже работает. Открываю ещё одну вкладку браузера.',
    browserFailed: (url: string) => `Не удалось открыть браузер. Откройте этот адрес вручную: ${url}`,
    failed: 'Не удалось запустить DevPanel. Покажите этот текст разработчику:',
    url: (url: string) => `URL: ${url}`,
  },

  desktop: {
    tooltip: 'DevPanel',
    show: 'Показать DevPanel',
    stopAllRepos: 'Остановить всё во всех репо',
    autostart: 'Запускать вместе с Windows',
    quit: 'Выйти из DevPanel',
    startFailedTitle: 'DevPanel не запустился',
    alreadyRunning:
      'DevPanel уже запущен в другом окне (например, через start-devpanel.bat).\n\n' +
      'Закройте его кнопкой «Выйти из DevPanel» (или закройте его чёрное окно) и откройте приложение снова.',
    unexpected: 'Что-то пошло не так при запуске. Нажмите «Подробности» и покажите текст разработчику.',
    stopAllFailedTitle: 'Не удалось остановить всё',
    stopAllFailed: 'Не все сервисы удалось остановить. Нажмите «Подробности» и покажите текст разработчику.',
    ok: 'OK',
    details: 'Подробности',
    detailsTitle: 'Подробности для разработчика',
  },
};

/** The host string set of each UI Language. */
export const HOST_STRINGS: Record<UiLanguage, HostStrings> = { en: EN_HOST_STRINGS, ru: RU_HOST_STRINGS };
