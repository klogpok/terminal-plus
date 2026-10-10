// Bundles the Electron main process (desktop + server + core + shared and their JS deps) into one
// CommonJS file, so the packaged app needs no workspace symlinks in node_modules. Only `electron`
// (provided by the runtime) and `node-pty` (native, shipped as a real dependency) stay external.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const src = (pkg) => fileURLToPath(new URL(`../../${pkg}/src/index.ts`, import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/main.cjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  logLevel: 'warning',
  alias: {
    '@devpanel/shared': src('shared'),
    '@devpanel/core': src('core'),
    '@devpanel/server': src('server'),
  },
  // `ws` tries these optional native speed-ups inside try/catch.
  external: ['electron', 'node-pty', 'bufferutil', 'utf-8-validate'],
});
