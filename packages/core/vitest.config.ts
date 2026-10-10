import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Real processes on Windows: run test files one at a time and use forked workers,
    // because node-pty keeps handles open after a pty exits.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
