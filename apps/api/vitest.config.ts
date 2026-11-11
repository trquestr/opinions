import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    // Обязательные переменные без дефолтов; сети в unit-тестах нет (подключения ленивые или подменены).
    env: {
      DATABASE_URL: 'postgres://untesis:untesis@localhost:5432/untesis',
      REDIS_URL: 'redis://localhost:6379',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/migrate.ts', 'dist', 'test', '**/*.spec.ts', '**/schema/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
