import { defineConfig } from 'vitest/config';

// Интеграционные тесты: настоящие Postgres и Redis из docker-compose.yml (DATABASE_URL/REDIS_URL из env,
// иначе дефолты как в .env.example). Запуск: `docker compose up -d --wait`, затем `yarn workspace api test:int`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/*.int-spec.ts'],
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://untesis:untesis@localhost:5432/untesis',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  },
});
