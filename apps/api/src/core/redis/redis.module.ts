import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS = Symbol.for('untesis.redis');

/** Закрывает соединение при остановке: `quit()` дожидается ответов на уже отправленные команды. */
@Injectable()
export class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return;
    try {
      await this.redis.quit();
    } catch {
      // Соединение уже разорвано — просто закрываем сокет.
      this.redis.disconnect();
    }
  }
}

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    // Запрос приложения не должен висеть вечно: пара ретраев и отказ (дальше решает вызывающий код).
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    // Недоступный Redis = быстрая ошибка, а не очередь команд в памяти, растущая без предела.
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createRedisClient(config.getOrThrow<string>('REDIS_URL')),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
