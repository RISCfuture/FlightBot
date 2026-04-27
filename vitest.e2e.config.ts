import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.test.ts'],
    setupFiles: ['./test/e2e/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false,
    pool: 'forks',
    alias: { '@': './src' },
  },
});
