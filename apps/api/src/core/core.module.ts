import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, DiscoveryModule } from '@nestjs/core';
import { AccessGuard } from './access/access.guard.js';
import { ContractCoverage } from './contracts/contract-coverage.js';
import { ResponseContractInterceptor } from './contracts/response-contract.interceptor.js';
import { DatabaseModule } from './database/database.module.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { createValidationPipe } from './errors/validation.pipe.js';
import { HealthModule } from './health/health.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';

/** Инфраструктура, общая для всех доменов: контракты, доступ, ошибки, БД, Redis, очереди, health. */
@Module({
  imports: [DiscoveryModule, DatabaseModule, RedisModule, QueueModule, HealthModule],
  providers: [
    ContractCoverage,
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseContractInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class CoreModule {}
