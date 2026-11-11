import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './../src/configure-app.js';

// Роут без @SkipThrottle — только для проверки лимитов, в прод-код не попадает.
@Controller('limited')
class LimitedController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

async function createApp(): Promise<INestApplication> {
  // ConfigModule.forRoot() вызывается при импорте AppModule и читает process.env сразу,
  // поэтому модуль импортируем заново — уже после правок окружения в тесте.
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [LimitedController],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health: 200, JSON, no-store', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('ставит заголовки безопасности', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('неизвестный роут: 404 без стека', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
    expect(JSON.stringify(res.body)).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)/);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('CORS: разрешённый Origin получает заголовок', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('CORS: чужой Origin не получает разрешения (заголовок указывает только на WEB_ORIGIN)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('API rate limit (e2e)', () => {
  let app: INestApplication;
  const saved = process.env.THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '2';
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.THROTTLE_LIMIT;
    else process.env.THROTTLE_LIMIT = saved;
  });

  it('третий запрос за окно получает 429', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/limited').expect(200);
    await request(server).get('/api/limited').expect(200);
    await request(server).get('/api/limited').expect(429);
  });

  it('health не ограничивается', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(server).get('/api/health').expect(200);
  });
});
