import { HealthController } from './health.controller.js';
import type { ReadinessService } from './readiness.service.js';

describe('HealthController', () => {
  const ready = { status: 'ok', checks: { database: 'up', redis: 'up' } } as const;
  const controller = new HealthController({
    check: () => Promise.resolve(ready),
  } as unknown as ReadinessService);

  it('live: процесс жив, внешних зависимостей не трогает', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('ready: делегирует проверку сервису', async () => {
    await expect(controller.ready()).resolves.toEqual(ready);
  });
});
