import { describe, expect, it } from 'vitest';
import { EMPTY_DRAWING, findStarAt, MAX_SEGMENTS, pressStar, releaseAnchor } from './drawing';
import type { Drawing } from './drawing';


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

/** Экранные положения трёх звёзд (px). */
const STARS = [
  { x: 100, y: 100 },
  { x: 150, y: 100 },
  { x: 400, y: 300 },
];

describe('findStarAt', () => {
  it('находит звезду в радиусе попадания', () => {
    expect(findStarAt(STARS, { point: { x: 103, y: 101 }, radiusPx: 5 })).toBe(0);
  });

  it('возвращает null вне радиуса', () => {
    expect(findStarAt(STARS, { point: { x: 700, y: 700 }, radiusPx: 24 })).toBeNull();
  });

  it('выбирает ближайшую из двух звёзд', () => {
    // до звезды 0 — 40 px, до звезды 1 — 10 px; обе в радиусе 50
    expect(findStarAt(STARS, { point: { x: 140, y: 100 }, radiusPx: 50 })).toBe(1);
  });

  it('без звёзд возвращает null', () => {
    expect(findStarAt([], { point: { x: 0, y: 0 }, radiusPx: 50 })).toBeNull();
  });
});
