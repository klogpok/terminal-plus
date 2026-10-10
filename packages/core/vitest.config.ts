import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Run against workspace package sources, so tests need no prior `pnpm build`.
    alias: {
      '@devpanel/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Real processes on Windows: run test files one at a time and use forked workers,
    // because node-pty keeps handles open after a pty exits.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
