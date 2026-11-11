import 'server-only';
import { cookies } from 'next/headers';
import { createApiClient, type ApiClient } from '@opinions/contracts/client';
import { serverEnv } from '@/shared/config/server-env';

/**
 * Серверный клиент БЕЗ cookie: для публичных данных, которые можно кэшировать и отдавать роботам (SEO).
 * Не читает запрос, поэтому не делает рендер динамическим.
 */
export const serverApi: ApiClient = createApiClient({ baseUrl: serverEnv.API_INTERNAL_URL });

/**
 * Серверный клиент от имени пользователя: пробрасывает cookie входящего запроса в apps/api.
 * Чтение `cookies()` — динамический API Next: страница/компонент, который его вызывает, рендерится на
 * каждый запрос (или должен быть под <Suspense>, если включён cacheComponents). Поэтому для публичного
 * контента использовать `serverApi`, а этот — только для персональных данных.
 */
export async function userServerApi(): Promise<ApiClient> {
  const cookieHeader = (await cookies()).toString();
  return createApiClient({
    baseUrl: serverEnv.API_INTERNAL_URL,
    headers: (): HeadersInit => (cookieHeader ? { cookie: cookieHeader } : []),
  });
}
