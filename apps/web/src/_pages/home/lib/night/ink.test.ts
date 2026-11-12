import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHaze, createOutline, loadFigures, pickInkCount } from './ink';
import manifest from './night-manifest.json';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createHaze', () => {
  it('на 1000 капель даёт 3000 значений int16', () => {
    const haze = createHaze(1000);
    expect(haze).toBeInstanceOf(Int16Array);
    expect(haze).toHaveLength(3000);
  });

  it('детерминирована', () => {
    expect(createHaze(500)).toEqual(createHaze(500));
  });
});

describe('createOutline', () => {
  const haze = createHaze(500);

  it('сохраняет длину и переставляет часть капель в пунктир', () => {
    const outline = createOutline(haze, [[0, 1]]);
    expect(outline).toHaveLength(haze.length);
    expect(outline.findIndex((value, i) => value !== haze[i])).toBeGreaterThanOrEqual(0);
  });

  it('без линий равна дымке', () => {
    expect(createOutline(haze, [])).toEqual(haze);
  });

  it('линия между несуществующими звёздами игнорируется', () => {
    expect(createOutline(haze, [[98, 99]])).toEqual(haze);
  });
});

describe('pickInkCount', () => {
  it('берёт числа капель из манифеста: на телефоне меньше, чем на десктопе', () => {
    expect(pickInkCount(true)).toBe(manifest.counts[1]);
    expect(pickInkCount(false)).toBe(manifest.counts[0]);
    expect(pickInkCount(true)).toBeLessThan(pickInkCount(false));
  });
});

describe('loadFigures', () => {
  const okResponse = (bytes: number) => ({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)),
  });

  it('возвращает четыре вида по 300 значений для буфера нужного размера', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(2400)));

    const figures = await loadFigures(100, new AbortController().signal);

    expect(figures).toHaveLength(4);
    expect(figures.every((f) => f instanceof Int16Array && f.length === 300)).toBe(true);
  });

  it('запрашивает нужный файл и передаёт AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(2400));
    vi.stubGlobal('fetch', fetchMock);

    await loadFigures(100, new AbortController().signal);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/assets/night/points-100.bin');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('отклоняется при HTTP 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(loadFigures(100, new AbortController().signal)).rejects.toThrow('404');
  });

  it('отклоняет файл неверного размера', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(1000)));

    await expect(loadFigures(100, new AbortController().signal)).rejects.toThrow('1000 байт вместо 2400');
  });

  it('пробрасывает ошибку сети', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));

    await expect(loadFigures(100, new AbortController().signal)).rejects.toThrow('network');
  });
});

describe('createHaze: растворённая тушь', () => {
  const radii = (count: number) => {
    const haze = createHaze(count);
    return Array.from({ length: count }, (_, i) => haze[i * 3 + 2] ?? 0);
  };

  it('около 75% капель имеют радиус 0', () => {
    const dissolved = radii(4000).filter((r) => r === 0).length;

    expect(dissolved).toBeGreaterThan(2800);
    expect(dissolved).toBeLessThan(3200);
  });

  it('видимые капли имеют радиус от 0,06 до 0,16 единицы', () => {
    const visible = radii(4000).filter((r) => r > 0);

    expect(Math.min(...visible)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...visible)).toBeLessThanOrEqual(16);
  });
});
