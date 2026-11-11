import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../src/configure-app.js';

// Настоящие Postgres и Redis (docker compose up -d --wait). DATABASE_URL/REDIS_URL задаёт vitest.config.int.ts.
describe('readiness (integration)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module.js');
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/ready: 200, БД и Redis up', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });
});
