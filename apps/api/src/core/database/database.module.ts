import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

/**
 * Подключение к Postgres. Пул и его закрытие при остановке (`onApplicationShutdown`) обеспечивает DrizzleModule.
 * Таймауты обязательны: без них зависшая БД держит соединения и кладёт весь API.
 */
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        drizzle,
        connection: {
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: config.getOrThrow<number>('DB_POOL_MAX'),
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          statement_timeout: 10000,
          query_timeout: 15000,
        },
        schema,
        // В TS — camelCase (createdAt), в БД — snake_case (created_at). То же в drizzle.config.ts.
        casing: 'snake_case' as const,
      }),
    }),
  ],
})
export class DatabaseModule {}
