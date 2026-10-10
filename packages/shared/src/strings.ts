/**
 * Every user-facing string shown outside the web UI: the launcher's console lines, the desktop
 * app's tray and dialogs, and text `core` writes into Service output. Plain Russian now; English
 * later goes in a sibling object with the same shape.
 *
 * The web UI's strings sit beside these in `packages/web/src/app/strings.ts`; those two files are
 * the only places user-facing text lives.
 */

export const HOST_STRINGS = {
  /** Another program (not DevPanel) holds the Server port. Launcher and desktop app. */
  portTaken: (port: number) =>
    `Не удалось запустить DevPanel: порт ${port} занят другой программой (это не DevPanel).\n` +
    `Закройте программу, которая использует порт ${port}, или перезагрузите компьютер, и запустите DevPanel снова.`,
  /** A DevPanel runs on the port with another app data folder (its Access Key is not ours). */
  keyMismatch:
    'DevPanel уже работает, но запущен с другой папкой данных, поэтому открыть его отсюда не получается.\n' +
    'Закройте окно уже запущенного DevPanel (или нажмите в нём «Выйти из DevPanel») и запустите DevPanel снова.',

  /** Dimmed line `core` writes into a Service's terminal before each new run (`time` is HH:MM). */
  restartSeparator: (time: string) => `── перезапуск ${time} ──`,

  /** Console lines of the `.bat` launcher. */
  launcher: {
    notBuilt: 'DevPanel не собран. Попросите разработчика выполнить в папке DevPanel: pnpm install, затем pnpm build.',
    starting: 'DevPanel запускается...',
    started: (url: string) =>
      `DevPanel работает: ${url}\n` +
      'Браузер открыт. Не закрывайте это окно, пока работаете: закрытие окна останавливает все сервисы и сессии DevPanel.',
    alreadyRunning: 'DevPanel уже работает. Открываю ещё одну вкладку браузера.',
    browserFailed: (url: string) => `Не удалось открыть браузер. Откройте этот адрес вручную: ${url}`,
    /** Printed before the technical details of an unexpected failure. */
    failed: 'Не удалось запустить DevPanel. Покажите этот текст разработчику:',
    /** Shown when DEVPANEL_BROWSER=none instead of opening a browser. */
    url: (url: string) => `URL: ${url}`,
  },

  /** Tray menu and dialogs of the desktop app. */
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
    /** Error dialog buttons. */
    ok: 'OK',
    details: 'Подробности',
    detailsTitle: 'Подробности для разработчика',
  },
} as const;
