import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Алиасы из tsconfig (@/*) — встроенной опцией Vite 8 вместо плагина vite-tsconfig-paths.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'public'],
    // CSS (globals.css, landing.css) в тестах не нужен.
    css: false,
    // Настоящий `server-only` бросает исключение вне react-server окружения Next.
    alias: { 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
