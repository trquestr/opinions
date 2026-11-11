import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { configureApp } from './configure-app.js';

describe('configureApp', () => {
  it('включает заголовки безопасности, shutdown hooks, префикс и CORS из WEB_ORIGIN', () => {
    const app = {
      get: vi.fn(
        () => ({ getOrThrow: () => 'https://example.test' }) as unknown as ConfigService,
      ),
      useSecurityHeaders: vi.fn(),
      enableShutdownHooks: vi.fn(),
      setGlobalPrefix: vi.fn(),
      enableCors: vi.fn(),
    };

    configureApp(app as unknown as INestApplication);

    expect(app.useSecurityHeaders).toHaveBeenCalledOnce();
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'https://example.test',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: false,
    });
  });
});
