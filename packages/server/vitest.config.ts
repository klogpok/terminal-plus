import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Run against workspace package sources, so tests need no prior `pnpm build`.
    alias: {
      '@devpanel/shared': src('shared'),
      '@devpanel/core': src('core'),
    },
  },
  test: {
    // Real processes (node-pty), like the core tests.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
