// Bundles the sidecar (desktop + server + core + shared and their JS deps) into one CommonJS file,
// dist/sidecar.cjs, which the Tauri shell runs with plain Node and which needs no workspace
// symlinks in node_modules. Only `node-pty` (native, shipped as a real dependency) stays external.
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
  external: ['node-pty', 'bufferutil', 'utf-8-validate'],
};

await build({ ...options, entryPoints: [here('src/sidecar.ts')], outfile: here('dist/sidecar.cjs') });
