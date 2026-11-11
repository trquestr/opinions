import { once } from 'node:events';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { readinessContract, ResponseInput } from '@untesis/contracts';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { DATABASE, type Database } from '../database/database.types.js';
import { REDIS } from '../redis/redis.module.js';

export const READINESS_TIMEOUT_MS = 1000;

type Readiness = ResponseInput<typeof readinessContract>;

/** Статусы ioredis, при которых соединение ещё устанавливается — команда без offline-очереди упадёт сразу. */
const REDIS_CONNECTING = new Set(['wait', 'connecting', 'connect', 'reconnecting']);

/**
 * Ждёт проверку не дольше `timeoutMs`; таймер всегда очищается, чтобы не держать процесс.
 * По таймауту отменяет `signal` — проверка снимает свои подписки на события и не утекает.
 */
async function withTimeout(
  check: (signal: AbortSignal) => Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`таймаут ${timeoutMs} мс`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    await Promise.race([check(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<Readiness> {
    const [database, redis] = await Promise.all([
      this.probe('database', () => this.db.execute(sql`select 1`)),
      this.probe('redis', (signal) => this.pingRedis(signal)),
    ]);
    const failed = [database, redis].filter((name): name is string => name !== undefined);
    if (failed.length > 0) {
      throw new ServiceUnavailableException(`Недоступны зависимости: ${failed.join(', ')}`);
    }
    return { status: 'ok', checks: { database: 'up', redis: 'up' } };
  }

  /**
   * У клиента Redis выключена offline-очередь (`enableOfflineQueue: false`): команда до установки соединения
   * падает мгновенно. Поэтому сразу после старта или при переподключении сначала ждём `ready` — в пределах
   * общего таймаута проверки. Закрытое соединение (`end`/`close`) — отказ без ожидания.
   */
  private async pingRedis(signal: AbortSignal): Promise<void> {
    if (REDIS_CONNECTING.has(this.redis.status)) {
      await once(this.redis, 'ready', { signal });
    }
    await this.redis.ping();
  }

  /** Имя зависимости, если она не ответила; `undefined`, если всё хорошо. */
  private async probe(
    name: string,
    check: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<string | undefined> {
    try {
      await withTimeout(check, READINESS_TIMEOUT_MS);
      return undefined;
    } catch (error) {
      this.logger.warn({
        message: 'Проверка готовности не пройдена',
        dependency: name,
        reason: String(error),
      });
      return name;
    }
  }
}
