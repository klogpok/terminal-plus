import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Run against workspace package sources, so unit tests need no prior `pnpm build`.
    alias: {
      '@devpanel/shared': src('shared'),
      '@devpanel/core': src('core'),
      '@devpanel/server': src('server'),
    },
  },
  test: {
    // The end-to-end tests run the real sidecar and the built Tauri app with real processes (node-pty).
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
