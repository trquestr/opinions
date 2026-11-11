import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "coverage/**",
    "build/**",
    "next-env.d.ts",
    // Старые модули героя (vanilla JS + минифицированный three.js) — вне линтера.
    "public/js/**",
  ]),
]);

export default eslintConfig;
