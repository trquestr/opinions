import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Проверка типов контрактов (expectTypeOf) — в тех же тестах, через tsc.
    typecheck: { enabled: true, include: ['src/**/*.test.ts'], tsconfig: './tsconfig.json' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
