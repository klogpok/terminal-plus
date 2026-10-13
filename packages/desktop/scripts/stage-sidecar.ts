// Stages what the installer ships as resources\sidecar: the sidecar bundle and the runtime part of
// node-pty, so `require('node-pty')` resolves next to sidecar.cjs. Needs `dist/sidecar.cjs` (the
// `build` script). Run with `node` (type stripping).
//
// node-pty 1.2.0-beta.15 is an N-API addon and loads `prebuilds/<platform>-<arch>` (lib/utils.js), so only
// its compiled JS and the win32-x64 prebuilds go in: no sources, no other platforms, no rebuild.
// The prebuilds' *.pdb debug symbols are 28 of their 30 MB and are dropped too.
import { cpSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const stage = path.join(desktopDir, 'dist', 'sidecar');
// pnpm links node_modules/node-pty into its store: copy real files.
const nodePty = realpathSync(path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json')));
const nodePtyStage = path.join(stage, 'node_modules', 'node-pty');

const isTestOrMap = (file: string) => /\.test\.js$|\.map$/.test(file);

rmSync(stage, { recursive: true, force: true });
mkdirSync(nodePtyStage, { recursive: true });
cpSync(path.join(desktopDir, 'dist', 'sidecar.cjs'), path.join(stage, 'sidecar.cjs'));
for (const file of ['package.json', 'LICENSE']) cpSync(path.join(nodePty, file), path.join(nodePtyStage, file));
cpSync(path.join(nodePty, 'lib'), path.join(nodePtyStage, 'lib'), {
  recursive: true,
  filter: (source) => !isTestOrMap(source),
});
cpSync(path.join(nodePty, 'prebuilds', 'win32-x64'), path.join(nodePtyStage, 'prebuilds', 'win32-x64'), {
  recursive: true,
  filter: (source) => !source.endsWith('.pdb'),
});
console.log(`Sidecar staged with node-pty (win32-x64): ${stage}`);
