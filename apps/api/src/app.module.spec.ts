import { ConfigService } from '@nestjs/config';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module.js';
import { REDIS } from './core/redis/redis.module.js';

describe('AppModule', () => {
  it('собирается и отдаёт конфиг с дефолтами', async () => {
    // Подключения к БД и Redis подменяем: unit-тест не ходит в сеть.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue({})
      .overrideProvider(REDIS)
      .useValue({ status: 'end' })
      .compile();
    const config = moduleRef.get(ConfigService);
    expect(config.getOrThrow<string>('WEB_ORIGIN')).toMatch(/^https?:\/\//);
    expect(config.getOrThrow<number>('THROTTLE_TTL_MS')).toBeGreaterThan(0);
    expect(config.getOrThrow<number>('DB_POOL_MAX')).toBe(10);
    await moduleRef.close();
  });
});
