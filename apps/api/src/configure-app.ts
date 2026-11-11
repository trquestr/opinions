import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestIdMiddleware } from './core/request-id/request-id.middleware.js';

// Общая настройка приложения: её вызывают и main.ts, и e2e-тесты, чтобы тестировать боевую конфигурацию.
// Приложение должно быть создано с `bodyParser: false` — парсер тела подключаем сами, с лимитом.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.useSecurityHeaders();
  app.enableShutdownHooks();
  // Все ручки API — под /api, чтобы фронт и бэк можно было отдать с одного домена через прокси.
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: false,
  });
  // requestId — до парсера тела, чтобы ошибки разбора (413, битый JSON) тоже получили id корреляции.
  app.use(requestIdMiddleware);
  // JSON ограничен 100 КБ (мнения короткие). urlencoded не включаем намеренно: API принимает только JSON.
  app.useBodyParser('json', { limit: '100kb' });
}
