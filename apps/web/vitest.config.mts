import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Алиасы из tsconfig (@/*) — встроенной опцией Vite 8 вместо плагина vite-tsconfig-paths.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "public"],
    // CSS (landing.css в layout) в тестах не нужен.
    css: false,
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
