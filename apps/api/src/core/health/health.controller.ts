import { Controller, Header, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { healthContract, readinessContract, type ResponseInput } from '@opinions/contracts';
import { Endpoint } from '../contracts/endpoint.decorator.js';
import { ReadinessService } from './readiness.service.js';

// Health дёргают балансировщик и мониторинг — лимитам и кэшу он не подчиняется.
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Header('Cache-Control', 'no-store')
  @Endpoint(healthContract)
  live(): ResponseInput<typeof healthContract> {
    return { status: 'ok' };
  }

  @Header('Cache-Control', 'no-store')
  @Endpoint(readinessContract)
  ready(): Promise<ResponseInput<typeof readinessContract>> {
    return this.readiness.check();
  }
}
