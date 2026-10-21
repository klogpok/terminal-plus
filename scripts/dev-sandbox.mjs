// Starts the built Server on throwaway app data seeded with two fixture Repos, for driving the UI.
// Needs `pnpm build`. Prints the URL with the Access Key; Ctrl+C stops it.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const tick = (name) => `node -e "setInterval(()=>console.log('${name} tick'),2000)"`;
const repos = {
  'vplans-app': [
    ['api', 'serve:login'],
    ['web', 'serve:a'],
  ],
  server: [['db', 'start:dev']],
};

const root = mkdtempSync(path.join(os.tmpdir(), 'devpanel-sandbox-'));
const appData = path.join(root, 'appdata');
mkdirSync(appData);
const workspace = { repos: [] };
for (const [name, services] of Object.entries(repos)) {
  const dir = path.join(root, 'repos', name);
  mkdirSync(dir, { recursive: true });
  const yml = services.map(([id, label]) => `  - id: ${id}\n    name: ${label}\n    command: ${tick(id)}\n`).join('');
  writeFileSync(path.join(dir, '.devpanel.yml'), `services:\n${yml}`);
  workspace.repos.push({ path: dir, name });
}
writeFileSync(path.join(appData, 'workspace.json'), JSON.stringify(workspace));

const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
console.log(`Sandbox: ${root}`);
// In this process, so stopping it stops the Server (a spawned child would outlive it on Windows).
process.env.DEVPANEL_APP_DATA = appData;
process.env.DEVPANEL_PORT = String(port);
await import('../packages/server/dist/main.js');
