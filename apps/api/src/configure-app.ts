import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Общая настройка приложения: её вызывают и main.ts, и e2e-тесты, чтобы тестировать боевую конфигурацию.
export function configureApp(app: INestApplication): void {
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
}
