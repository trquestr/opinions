import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { envSchema } from './config/env.schema.js';
import { CoreModule } from './core/core.module.js';

// Доменные модули (questions, opinions, …) подключаются здесь, рядом с CoreModule.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('THROTTLE_TTL_MS'),
          limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
        },
      ],
    }),
    CoreModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
