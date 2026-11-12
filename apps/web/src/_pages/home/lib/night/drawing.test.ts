import { describe, expect, it } from 'vitest';
import { EMPTY_DRAWING, findStarAt, MAX_SEGMENTS, pressStar, releaseAnchor } from './drawing';
import type { Drawing } from './drawing';

const IDENTITY = { originX: 0, originY: 0, scale: 1 };

describe('pressStar', () => {
  it('первое нажатие делает звезду якорем', () => {
    expect(pressStar(EMPTY_DRAWING, 2)).toEqual({ segments: [], anchor: 2 });
  });

  it('нажатие на другую звезду добавляет линию и переносит якорь', () => {
    expect(pressStar({ segments: [], anchor: 2 }, 5)).toEqual({ segments: [[2, 5]], anchor: 5 });
  });

  it('повторное нажатие на якорь отпускает его', () => {
    expect(pressStar({ segments: [[2, 5]], anchor: 5 }, 5)).toEqual({ segments: [[2, 5]], anchor: null });
  });

  it('не добавляет дубликат линии в том же направлении', () => {
    expect(pressStar({ segments: [[2, 5]], anchor: 2 }, 5)).toEqual({ segments: [[2, 5]], anchor: 5 });
  });

  it('не добавляет дубликат линии в обратном направлении', () => {
    expect(pressStar({ segments: [[2, 5]], anchor: 5 }, 2)).toEqual({ segments: [[2, 5]], anchor: 2 });
  });

  it('не превышает MAX_SEGMENTS и отпускает якорь', () => {
    const full: Drawing = {
      segments: Array.from({ length: MAX_SEGMENTS }, (_, i) => [i, i + 100] as const),
      anchor: 1,
    };

    const drawing = pressStar(full, 2);

    expect(drawing.segments).toHaveLength(MAX_SEGMENTS);
    expect(drawing.anchor).toBeNull();
  });

  it('не меняет исходное состояние', () => {
    const start: Drawing = { segments: [], anchor: 1 };

    pressStar(start, 2);

    expect(start).toEqual({ segments: [], anchor: 1 });
  });
});

describe('releaseAnchor', () => {
  it('снимает якорь и оставляет линии', () => {
    expect(releaseAnchor({ segments: [[1, 2]], anchor: 2 })).toEqual({ segments: [[1, 2]], anchor: null });
  });
});

describe('findStarAt', () => {
  it('находит звезду в радиусе попадания', () => {
    // Дубхе стоит в (1, 0)
    expect(findStarAt(IDENTITY, { point: { x: 3, y: 1 }, radiusPx: 5 })).toBe(0);
  });

  it('возвращает null вне радиуса', () => {
    expect(findStarAt(IDENTITY, { point: { x: 500, y: 500 }, radiusPx: 24 })).toBeNull();
  });

  it('выбирает ближайшую из двух звёзд', () => {
    // Дубхе (1, 0) в 15 px, Мерак (0, 22) в 7 px — обе в радиусе 24
    expect(findStarAt(IDENTITY, { point: { x: 0, y: 15 }, radiusPx: 24 })).toBe(1);
  });

  it('учитывает масштаб и смещение раскладки', () => {
    // Мерак (0, 22) при смещении (100, 50) и масштабе 2 стоит в (100, 94)
    const layout = { originX: 100, originY: 50, scale: 2 };
    expect(findStarAt(layout, { point: { x: 101, y: 95 }, radiusPx: 4 })).toBe(1);
  });
});
