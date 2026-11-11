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
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    // Лучшие практики из .claude/rules/general.md, раздел «Автоматическая проверка» (те же пороги, что в oxlint).
    files: ['**/*.{ts,tsx,mts,mjs}'],
    rules: {
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', { max: 3 }],
      'max-params': ['error', { max: 3 }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'no-nested-ternary': 'error',
      'no-else-return': 'error',
      'no-param-reassign': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': 'error',
    },
  },
  {
    // describe-блоки тестов длинные по природе.
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'max-lines-per-function': 'off' },
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
