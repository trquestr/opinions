import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Очереди BullMQ. Своё подключение к Redis: BullMQ требует `maxRetriesPerRequest: null` для воркеров,
 * а прикладному клиенту (RedisModule) нужны быстрые отказы.
 *
 * Очередь регистрируется в доменном модуле: `BullModule.registerQueue({ name: 'opinion-analysis' })`,
 * продюсер — `@InjectQueue('opinion-analysis')`, воркер — класс с `@Processor('opinion-analysis')`.
 * Задачи должны быть идемпотентными (повторы по attempts), а в данных — только id, не персональные данные.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: url.port ? Number(url.port) : 6379,
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
          },
        };
      },
    }),
  ],
})
export class QueueModule {}
