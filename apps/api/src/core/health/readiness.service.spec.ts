import { EventEmitter } from 'node:events';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Database } from '../database/database.types.js';
import { ReadinessService } from './readiness.service.js';

function service(execute: () => Promise<unknown>, ping: () => Promise<unknown>): ReadinessService {
  return new ReadinessService({ execute } as unknown as Database, { ping } as unknown as Redis);
}

const ok = () => Promise.resolve('PONG');
const never = () => new Promise<never>(() => undefined);

describe('ReadinessService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('обе зависимости отвечают: ok', async () => {
    await expect(service(ok, ok).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('БД недоступна: 503 с именем БД', async () => {
    const failing = () => Promise.reject(new Error('connection refused'));
    const promise = service(failing, ok).check();
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toThrow(/database/);
    await expect(promise).rejects.not.toThrow(/redis/);
  });

  it('Redis недоступен: 503 с именем Redis', async () => {
    const failing = () => Promise.reject(new Error('ECONNREFUSED'));
    await expect(service(ok, failing).check()).rejects.toThrow(/redis/);
  });

  it('обе недоступны: перечислены обе', async () => {
    const failing = () => Promise.reject(new Error('x'));
    await expect(service(failing, failing).check()).rejects.toThrow(/database, redis/);
  });

  it('зависание дольше 1000 мс считается отказом', async () => {
    vi.useFakeTimers();
    const promise = service(never, ok).check();
    const assertion = expect(promise).rejects.toThrow(/database/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('Redis без offline-очереди', () => {
    /** Фейковый клиент ioredis: статус соединения и события, как у настоящего. */
    function redisClient(status: string, ping: () => Promise<unknown> = ok) {
      return Object.assign(new EventEmitter(), { status, ping: vi.fn(ping) });
    }
    const withRedis = (redis: EventEmitter) =>
      new ReadinessService({ execute: ok } as unknown as Database, redis as unknown as Redis);

    it('соединение ещё устанавливается: ждёт ready, потом ping', async () => {
      const redis = redisClient('connecting');
      const promise = withRedis(redis).check();
      expect(redis.ping).not.toHaveBeenCalled();
      redis.status = 'ready';
      redis.emit('ready');
      await expect(promise).resolves.toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
      expect(redis.ping).toHaveBeenCalledTimes(1);
    });

    it('не дождался ready за таймаут: отказ, подписка снята, таймеров нет', async () => {
      vi.useFakeTimers();
      const redis = redisClient('reconnecting');
      const promise = withRedis(redis).check();
      const assertion = expect(promise).rejects.toThrow(/redis/);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(redis.listenerCount('ready')).toBe(0);
      expect(redis.ping).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('соединение закрыто: ping сразу, без ожидания ready', async () => {
      const redis = redisClient('end', () => Promise.reject(new Error('Connection is closed.')));
      await expect(withRedis(redis).check()).rejects.toThrow(/redis/);
      expect(redis.ping).toHaveBeenCalledTimes(1);
      expect(redis.listenerCount('ready')).toBe(0);
    });
  });

  it('успешная проверка не оставляет таймеров', async () => {
    vi.useFakeTimers();
    await service(ok, ok).check();
    expect(vi.getTimerCount()).toBe(0);
  });
});
