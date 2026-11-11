import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('publicEnv', () => {
  it('читает NEXT_PUBLIC_SITE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://untesis.example');
    const { publicEnv } = await import('./public-env');
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe('https://untesis.example');
  });

  it('без переменной — localhost по умолчанию', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const { publicEnv } = await import('./public-env');
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
  });
});
