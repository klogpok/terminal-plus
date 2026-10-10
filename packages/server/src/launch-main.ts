/**
 * Launcher entry point, run by `start-devpanel.bat` (the team member's desktop shortcut):
 * starts the Server and opens the browser, or only opens another tab when DevPanel already runs.
 *
 * Exit code: 0 when another tab was opened (the window may close); 1 when nothing could be started
 * (the `.bat` then keeps the window open so the message can be read). While this process runs the
 * Server, closing its console window is Exit (see `cli.ts`).
 *
 * Environment: as `cli.ts`, plus DEVPANEL_BROWSER=none to print the URL instead of opening a
 * browser (for checks without a browser).
 */
import { existsSync } from 'node:fs';
import { windowsShell } from '@devpanel/core';
import { readStoredAccessKey } from './access-key.js';
import { cliSettings, runServer } from './cli.js';
import { launch } from './launch.js';

const settings = cliSettings();
const print = (line: string) => console.log(line);

if (!existsSync(settings.webRoot)) {
  print('DevPanel не собран. Попросите разработчика выполнить в папке DevPanel: pnpm install, затем pnpm build.');
  process.exit(1);
}

const result = await launch({
  port: settings.port,
  readAccessKey: () => readStoredAccessKey(settings.appDataDir),
  startServer: () => runServer(settings),
  openBrowser: async (url) => {
    if (process.env.DEVPANEL_BROWSER === 'none') print(`URL: ${url}`);
    else {
      await windowsShell.openUrl(url).catch(() => {
        print(`Не удалось открыть браузер. Откройте этот адрес вручную: ${url}`);
      });
    }
  },
  print,
}).catch((error: unknown) => {
  print('Не удалось запустить DevPanel. Покажите этот текст разработчику:');
  print(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});

if (result === 'openedExisting') process.exit(0);
if (result !== 'started') process.exit(1);
