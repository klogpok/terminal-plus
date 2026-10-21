---
name: run
description: Launch DevPanel's web UI on a throwaway Workspace and drive it in Chrome. Use to run, screenshot, or check a UI change in the real app.
---

1. `pnpm build`, then start `node scripts/dev-sandbox.mjs` in the background: plain `node`, since stopping a `pnpm` wrapper leaves the Server listening on Windows. Done when it prints `DevPanel: http://127.0.0.1:<port>/#key=...`. Repos `vplans-app` (serve:login, serve:a) and `server` (start:dev) are already in it; terminals open via `button[aria-label="Open the <service> terminal"]`.
2. Drive it with a `.cjs` script in your scratchpad, run from the repo root (`playwright-core` is a root devDependency):

   ```js
   const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd()] }));
   const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
   ```

   Each `newPage` starts with empty localStorage: open the tabs you need first.
3. Zoneless Angular renders after the event: after every action wait for the expected DOM (`page.waitForFunction`) before reading it. A read straight after a click shows the previous state.
4. Drags (CDK): `mouse.down`, a small move past the 5px threshold, `mouse.move(..., { steps: 20 })`, `mouse.up`.
5. Screenshot and Read every PNG you claim to have checked. Done when the screenshot shows the change. Stop the server; its port is free afterwards (`netstat -ano | grep :<port>`).
