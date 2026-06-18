import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Minimal, framework-free vitest config. The S1 timer work is pure TypeScript
// (no React/DOM, no Next runtime), so we run in the default node environment
// and scope to lib/** unit tests — this never touches the shared `.next` build
// output. `@/` mirrors the tsconfig path alias so test imports resolve.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
});
