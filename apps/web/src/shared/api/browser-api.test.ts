import { afterEach, describe, expect, it, vi } from 'vitest';
import { healthContract } from '@opinions/contracts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('browserApi', () => {
  it('ходит на относительный /api того же origin', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    // Модуль грузим после подмены fetch: клиент берёт globalThis.fetch при создании.
    const { browserApi } = await import('./index');

    await expect(browserApi.call(healthContract, {})).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/health');
  });
});
