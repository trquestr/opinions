import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './configure-app.js';
import { requestIdMiddleware } from './core/request-id/request-id.middleware.js';

describe('configureApp', () => {
  it('включает заголовки безопасности, shutdown hooks, префикс, CORS, requestId и лимит JSON', () => {
    const app = {
      get: vi.fn(() => ({ getOrThrow: () => 'https://example.test' }) as unknown as ConfigService),
      useSecurityHeaders: vi.fn(),
      enableShutdownHooks: vi.fn(),
      setGlobalPrefix: vi.fn(),
      enableCors: vi.fn(),
      use: vi.fn(),
      useBodyParser: vi.fn(),
    };

    configureApp(app as unknown as NestExpressApplication);

    expect(app.useSecurityHeaders).toHaveBeenCalledOnce();
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'https://example.test',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: false,
    });
    expect(app.use).toHaveBeenCalledWith(requestIdMiddleware);
    expect(app.useBodyParser).toHaveBeenCalledTimes(1);
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '100kb' });
  });
});
