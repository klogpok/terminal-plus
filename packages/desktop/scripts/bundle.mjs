// Bundles the desktop entry points (desktop + server + core + shared and their JS deps) into one
// CommonJS file each, so neither needs workspace symlinks in node_modules:
// - dist/main.cjs: the Electron main process;
// - dist/sidecar.cjs: the headless sidecar the Tauri shell runs with plain Node.
// Only `electron` (provided by the runtime) and `node-pty` (native, shipped as a real dependency) stay external.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const src = (pkg) => fileURLToPath(new URL(`../../${pkg}/src/index.ts`, import.meta.url));
const here = (file) => fileURLToPath(new URL(`../${file}`, import.meta.url));

const options = {
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
};

await Promise.all([
  build({ ...options, entryPoints: [here('src/main.ts')], outfile: here('dist/main.cjs') }),
  build({ ...options, entryPoints: [here('src/sidecar.ts')], outfile: here('dist/sidecar.cjs') }),
]);
