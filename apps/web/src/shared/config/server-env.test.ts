import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('serverEnv', () => {
  it('читает API_INTERNAL_URL из process.env при загрузке модуля', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    const { serverEnv } = await import('./server-env');
    expect(serverEnv.API_INTERNAL_URL).toBe('http://api:4000');
  });

  it('при невалидном значении модуль не загружается', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'bad');
    await expect(import('./server-env')).rejects.toThrow(/API_INTERNAL_URL/);
  });
});
