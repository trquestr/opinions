import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/core/database/schema/index.ts',
  out: './drizzle',
  // В TS — camelCase, в БД — snake_case. Должно совпадать с DatabaseModule.
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
