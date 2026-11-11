import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { envSchema } from './config/env.schema.js';

// Одноразовый запуск миграций для прода (`node dist/migrate.js`): применяет drizzle/*.sql и выходит.
// Папка drizzle/ лежит рядом с dist/ и src/, поэтому путь считаем от этого файла.
const migrationsFolder = join(import.meta.dirname, '..', 'drizzle');

// Пока схема пустая, drizzle-kit ещё не создал журнал миграций. Это не ошибка: в прод-compose api ждёт
// успешного завершения migrate, и падение здесь не дало бы подняться всему стеку.
if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
  console.log('Миграций нет (нет drizzle/meta/_journal.json) — пропускаю.');
} else {
  const env = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log('Миграции применены.');
  } finally {
    await pool.end();
  }
}
