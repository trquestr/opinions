import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: 'postgres://untesis:untesis@localhost:5432/untesis',
      REDIS_URL: 'redis://localhost:6379',
    },
  },
});
