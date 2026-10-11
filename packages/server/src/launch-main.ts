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
import { readUiLanguage, windowsShell } from '@devpanel/core';
import { HOST_STRINGS } from '@devpanel/shared';
import { readStoredAccessKey } from './access-key.js';
import { cliSettings, runServer } from './cli.js';
import { launch } from './launch.js';

const settings = cliSettings();
const print = (line: string) => console.log(line);
const language = await readUiLanguage(settings.appDataDir);
const strings = HOST_STRINGS[language].launcher;

if (!existsSync(settings.webRoot)) {
  print(strings.notBuilt);
  process.exit(1);
}

const result = await launch({
  port: settings.port,
  readAccessKey: () => readStoredAccessKey(settings.appDataDir),
  readUiLanguage: async () => language,
  startServer: () => runServer(settings),
  openBrowser: async (url) => {
    if (process.env.DEVPANEL_BROWSER === 'none') print(strings.url(url));
    else {
      await windowsShell.openUrl(url).catch(() => {
        print(strings.browserFailed(url));
      });
    }
  },
  print,
}).catch((error: unknown) => {
  print(strings.failed);
  print(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});

if (result === 'openedExisting') process.exit(0);
if (result !== 'started') process.exit(1);
