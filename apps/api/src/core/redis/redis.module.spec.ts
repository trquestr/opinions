import type { Redis } from 'ioredis';
import { RedisShutdown, createRedisClient } from './redis.module.js';

describe('RedisShutdown', () => {
  it('вызывает quit', async () => {
    const redis = { status: 'ready', quit: vi.fn().mockResolvedValue('OK'), disconnect: vi.fn() };
    await new RedisShutdown(redis as unknown as Redis).onApplicationShutdown();
    expect(redis.quit).toHaveBeenCalledOnce();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('если quit упал — закрывает сокет', async () => {
    const redis = { status: 'ready', quit: vi.fn().mockRejectedValue(new Error('x')), disconnect: vi.fn() };
    await new RedisShutdown(redis as unknown as Redis).onApplicationShutdown();
    expect(redis.disconnect).toHaveBeenCalledOnce();
  });

  it('уже закрытое соединение не трогает', async () => {
    const redis = { status: 'end', quit: vi.fn(), disconnect: vi.fn() };
    await new RedisShutdown(redis as unknown as Redis).onApplicationShutdown();
    expect(redis.quit).not.toHaveBeenCalled();
  });
});

describe('createRedisClient', () => {
  it('создаёт клиент без офлайн-очереди и с ограниченными ретраями', () => {
    const client = createRedisClient('redis://localhost:6399');
    // lazy не включён, поэтому сразу гасим сокет, чтобы тест не держал соединение.
    client.on('error', () => undefined);
    expect(client.options.enableOfflineQueue).toBe(false);
    expect(client.options.maxRetriesPerRequest).toBe(2);
    expect(client.options.retryStrategy?.(1)).toBe(200);
    expect(client.options.retryStrategy?.(100)).toBe(3000);
    client.disconnect();
  });
});
