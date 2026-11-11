import { createApiClient } from '@opinions/contracts/client';

/**
 * Клиент для браузера: baseUrl '' — запросы идут на тот же origin (`/api/...`).
 * В dev Next проксирует их на apps/api (rewrites), в проде /api маршрутизирует reverse proxy.
 * Секретов тут нет и быть не должно: файл попадает в клиентский бандл.
 */
export const browserApi = createApiClient({ baseUrl: '' });
