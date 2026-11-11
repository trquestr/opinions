import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healthContract } from '@opinions/contracts';

const cookieString = vi.fn<() => string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: cookieString }),
}));

const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ status: 'ok' }));

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:4000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  cookieString.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: new Headers(init.headers) };
};

describe('serverApi', () => {
  it('бьёт в API_INTERNAL_URL и не отправляет cookie', async () => {
    const { serverApi } = await import('./server');
    await serverApi.call(healthContract, {});
    const { url, headers } = lastRequest();
    expect(url).toBe('http://api.internal:4000/api/health');
    expect(headers.has('cookie')).toBe(false);
    expect(cookieString).not.toHaveBeenCalled();
  });
});

describe('userServerApi', () => {
  it('пробрасывает cookie входящего запроса', async () => {
    cookieString.mockReturnValue('session=abc; theme=dark');
    const { userServerApi } = await import('./server');
    const api = await userServerApi();
    await api.call(healthContract, {});
    const { url, headers } = lastRequest();
    expect(url).toBe('http://api.internal:4000/api/health');
    expect(headers.get('cookie')).toBe('session=abc; theme=dark');
  });

  it('без cookie заголовок не добавляет', async () => {
    cookieString.mockReturnValue('');
    const { userServerApi } = await import('./server');
    const api = await userServerApi();
    await api.call(healthContract, {});
    expect(lastRequest().headers.has('cookie')).toBe(false);
  });
});
