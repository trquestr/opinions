import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Правила с типами — через projectService (tsconfig.json подхватывается автоматически).
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'coverage/**',
    'build/**',
    'next-env.d.ts',
    // Старые модули героя (vanilla JS + минифицированный three.js) — вне линтера.
    'public/js/**',
  ]),
]);

export default eslintConfig;
