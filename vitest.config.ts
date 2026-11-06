import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The Mac has 8 GB of RAM: keep the worker count modest.
    maxWorkers: 2,
  },
});
