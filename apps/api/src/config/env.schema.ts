import { z } from 'zod';

// Схема переменных окружения: валидируется при старте, приложение не поднимется с мусором в env.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  // Без дефолтов: подключение к чужой базе «по умолчанию» — это ошибка конфигурации, а не удобство.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // Верхняя граница пула: каждое соединение — процесс в Postgres, а инстансов API может быть несколько.
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Если не задан — выбирается по NODE_ENV (см. resolveLogFormat).
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
});

export type Env = z.infer<typeof envSchema>;
export type LogFormat = NonNullable<Env['LOG_FORMAT']>;

/** В проде логи — JSON (их читают агрегаторы), в разработке — человекочитаемые. */
export function resolveLogFormat(env: Pick<Env, 'NODE_ENV' | 'LOG_FORMAT'>): LogFormat {
  return env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty');
}
