import { Controller, Get, Header, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  // Health дёргают балансировщик и мониторинг — лимитам и кэшу он не подчиняется.
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  @Get('health')
  getHealth(): { status: 'ok' } {
    return this.appService.getHealth();
  }
}
