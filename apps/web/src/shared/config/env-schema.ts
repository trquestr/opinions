import { z } from 'zod';

/*
 * Схемы окружения без побочных эффектов: их можно импортировать и в next.config.ts, и в тестах.
 * Разобранные значения лежат в server-env.ts (только сервер) и public-env.ts (в т.ч. браузер).
 */

// Пустая строка в .env (`KEY=`) — то же, что «не задано»: берём значение по умолчанию.
const httpUrl = (fallback: string) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    // Только http(s): `javascript:`/`file:` в адресе API или сайта — ошибка конфигурации.
    z.url({ protocol: /^https?$/ }).default(fallback),
  );

const serverEnvSchema = z.object({
  /** Адрес apps/api изнутри сети (контейнера): серверный рендер ходит к нему напрямую. */
  API_INTERNAL_URL: httpUrl('http://localhost:4000'),
});

const publicEnvSchema = z.object({
  /** Публичный origin сайта (canonical, sitemap, OpenGraph). Без завершающего слэша. */
  NEXT_PUBLIC_SITE_URL: httpUrl('http://localhost:3000').transform((url) => url.replace(/\/+$/, '')),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, unknown>,
  scope: string,
): z.output<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  // Значения в сообщение не включаем (в env бывают секреты) — только имена переменных и причины.
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Некорректное ${scope} окружение: ${details}`);
}

export const parseServerEnv = (source: Record<string, unknown>): ServerEnv =>
  parseEnv(serverEnvSchema, source, 'серверное');

export const parsePublicEnv = (source: Record<string, unknown>): PublicEnv =>
  parseEnv(publicEnvSchema, source, 'публичное');
