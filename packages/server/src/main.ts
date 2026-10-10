/**
 * Server entry point for developers: `node packages/server/dist/main.js` (after `pnpm build`).
 * Prints the URL instead of opening a browser. Team members use `start-devpanel.bat`
 * (`launch-main.ts`). Environment variables: see `cli.ts`.
 */
import { cliSettings, runServer } from './cli.js';

const settings = cliSettings();
const devPanel = await runServer(settings);
console.log(`DevPanel: ${devPanel.openUrl}`);
console.log(`App data: ${settings.appDataDir}`);
const orphans = devPanel.core.listOrphans();
if (orphans.length) console.log(`DevPanel: ${orphans.length} process group(s) left over from the previous run; see the UI.`);
