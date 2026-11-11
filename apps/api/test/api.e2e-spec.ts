import { Controller } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { apiErrorSchema, defineEndpoint } from '@opinions/contracts';
import request from 'supertest';
import { z } from 'zod';
import { ContractBody } from '../src/core/contracts/contract-params.js';
import { Endpoint } from '../src/core/contracts/endpoint.decorator.js';
import { REDIS } from '../src/core/redis/redis.module.js';
import { configureApp } from '../src/configure-app.js';

// Контракты и контроллер существуют только в тестах: на них проверяем механизмы core, а не домен.
const createContract = defineEndpoint({
  method: 'POST',
  path: '/test-things',
  access: 'public',
  status: 201,
  body: z.object({ title: z.string().min(1).max(10) }).strict(),
  response: z.object({ id: z.string(), title: z.string() }),
});
const privateContract = defineEndpoint({
  method: 'GET',
  path: '/test-private',
  access: 'user',
  response: z.object({ ok: z.boolean() }),
});
const limitedContract = defineEndpoint({
  method: 'GET',
  path: '/test-limited',
  access: 'public',
  response: z.object({ ok: z.boolean() }),
});
const brokenContract = defineEndpoint({
  method: 'GET',
  path: '/test-broken',
  access: 'public',
  response: z.object({ id: z.string() }),
});

@Controller()
class TestController {
  @Endpoint(createContract)
  create(@ContractBody(createContract) body: { title: string }) {
    // Лишнее поле «секрета» должно быть отрезано контрактом ответа.
    return { id: 'thing-1', title: body.title, secret: 'must-not-leak' };
  }

  @Endpoint(privateContract)
  secret() {
    return { ok: true };
  }

  @Endpoint(limitedContract)
  limited() {
    return { ok: true };
  }

  @Endpoint(brokenContract)
  broken() {
    return { id: 42 };
  }
}

interface Fakes {
  dbOk: boolean;
  redisOk: boolean;
}

async function createApp(fakes: Fakes): Promise<NestExpressApplication> {
  // ConfigModule.forRoot() читает process.env при импорте AppModule — импортируем заново после правок env.
  vi.resetModules();
  const { AppModule } = await import('../src/app.module.js');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestController],
  })
    // Ни БД, ни Redis в e2e нет: подменяем фейками (DrizzleModule и Bull подключаются лениво).
    .overrideProvider(getDrizzleToken())
    .useValue({
      execute: () => (fakes.dbOk ? Promise.resolve([]) : Promise.reject(new Error('db down'))),
    })
    .overrideProvider(REDIS)
    .useValue({
      status: 'end',
      ping: () => (fakes.redisOk ? Promise.resolve('PONG') : Promise.reject(new Error('redis down'))),
    })
    .compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

function expectApiError(body: unknown, statusCode: number, code: string) {
  const parsed = apiErrorSchema.parse(body);
  expect(parsed.statusCode).toBe(statusCode);
  expect(parsed.code).toBe(code);
  expect(parsed.requestId).toBeTruthy();
  return parsed;
}

describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp({ dbOk: true, redisOk: true });
  });
  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('GET /api/health: 200, JSON, no-store', async () => {
    const res = await request(server()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/health/ready: 200 когда БД и Redis отвечают', async () => {
    const res = await request(server()).get('/api/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('заголовки безопасности', async () => {
    const res = await request(server()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('неизвестный маршрут: 404 в формате ApiError с requestId и заголовком', async () => {
    const res = await request(server()).get('/api/nope').expect(404);
    const body = expectApiError(res.body, 404, 'NOT_FOUND');
    expect(res.headers['x-request-id']).toBe(body.requestId);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('входящий x-request-id возвращается эхом', async () => {
    const res = await request(server()).get('/api/health').set('x-request-id', 'client-id-1');
    expect(res.headers['x-request-id']).toBe('client-id-1');
  });

  it('небезопасный x-request-id заменяется', async () => {
    const res = await request(server()).get('/api/health').set('x-request-id', 'bad id;<script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST с валидным телом: 201, лишние поля ответа отрезаны', async () => {
    const res = await request(server()).post('/api/test-things').send({ title: 'hello' }).expect(201);
    expect(res.body).toEqual({ id: 'thing-1', title: 'hello' });
  });

  it('POST с невалидным телом: 400 VALIDATION_FAILED с issues', async () => {
    const res = await request(server()).post('/api/test-things').send({ title: '' }).expect(400);
    const body = expectApiError(res.body, 400, 'VALIDATION_FAILED');
    expect(body.issues?.[0]?.path).toEqual(['title']);
  });

  it('POST с лишним полем в теле: 400 (strict-схема)', async () => {
    const res = await request(server())
      .post('/api/test-things')
      .send({ title: 'a', admin: true })
      .expect(400);
    expectApiError(res.body, 400, 'VALIDATION_FAILED');
  });

  it('тело больше 100 КБ: 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(server())
      .post('/api/test-things')
      .send({ title: 'x'.repeat(200 * 1024) })
      .expect(413);
    expectApiError(res.body, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('битый JSON: 400 BAD_REQUEST', async () => {
    const res = await request(server())
      .post('/api/test-things')
      .set('content-type', 'application/json')
      .send('{"title": ')
      .expect(400);
    expectApiError(res.body, 400, 'BAD_REQUEST');
  });

  it('access user без сессии: 401 UNAUTHORIZED', async () => {
    const res = await request(server()).get('/api/test-private').expect(401);
    expectApiError(res.body, 401, 'UNAUTHORIZED');
  });

  it('ответ, не соответствующий контракту: 500 INTERNAL без деталей', async () => {
    const res = await request(server()).get('/api/test-broken').expect(500);
    const body = expectApiError(res.body, 500, 'INTERNAL');
    expect(body.message).toBe('Внутренняя ошибка сервера');
  });

  it('CORS: разрешённый Origin получает заголовок', async () => {
    const res = await request(server()).get('/api/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('CORS: чужой Origin не получает разрешения', async () => {
    const res = await request(server()).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('readiness при отказе зависимостей (e2e)', () => {
  it('БД недоступна: 503 SERVICE_UNAVAILABLE в формате ApiError', async () => {
    const app = await createApp({ dbOk: false, redisOk: true });
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(503);
    expectApiError(res.body, 503, 'SERVICE_UNAVAILABLE');
    await app.close();
  });

  it('Redis недоступен: 503', async () => {
    const app = await createApp({ dbOk: true, redisOk: false });
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(503);
    expectApiError(res.body, 503, 'SERVICE_UNAVAILABLE');
    await app.close();
  });
});

describe('rate limit (e2e)', () => {
  let app: NestExpressApplication;
  const saved = process.env.THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '2';
    app = await createApp({ dbOk: true, redisOk: true });
  });
  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.THROTTLE_LIMIT;
    else process.env.THROTTLE_LIMIT = saved;
  });

  it('третий запрос за окно: 429 RATE_LIMITED', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/test-limited').expect(200);
    await request(server).get('/api/test-limited').expect(200);
    const res = await request(server).get('/api/test-limited').expect(429);
    expectApiError(res.body, 429, 'RATE_LIMITED');
  });

  it('health не ограничивается', async () => {
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
