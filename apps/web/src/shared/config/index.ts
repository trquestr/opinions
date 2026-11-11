// Публичный API сегмента. Серверное окружение (server-env.ts) сюда НЕ входит:
// оно с `server-only` и импортируется напрямую из '@/shared/config/server-env'.
export { publicEnv } from './public-env';
export { siteConfig } from './site';
