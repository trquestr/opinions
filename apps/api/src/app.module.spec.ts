import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

describe('AppModule', () => {
  it('собирается и отдаёт конфиг с дефолтами', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const config = moduleRef.get(ConfigService);
    expect(config.getOrThrow<string>('WEB_ORIGIN')).toMatch(/^https?:\/\//);
    expect(config.getOrThrow<number>('THROTTLE_TTL_MS')).toBeGreaterThan(0);
    await moduleRef.close();
  });
});
