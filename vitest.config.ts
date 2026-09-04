import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@io/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@io/providers': fileURLToPath(new URL('./packages/providers/src/index.ts', import.meta.url)),
      '@io/agent': fileURLToPath(new URL('./packages/agent/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
  },
});
