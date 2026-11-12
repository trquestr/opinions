import { describe, expect, it } from 'vitest';
import {
  buildStarTable,
  createRandom,
  DIPPER_CENTER,
  DIPPER_STARS,
  DRAWABLE_STARS,
  INVITE_STARS,
  STAR_STRIDE,
} from './stars';

describe('звёзды ковша', () => {
  it('семь звёзд совпадают с манифестом от Дубхе до Алькаида', () => {
    expect(DIPPER_STARS).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 22 },
      { x: 31, y: 34 },
      { x: 44, y: 20 },
      { x: 68, y: 24 },
      { x: 86, y: 29 },
      { x: 100, y: 53 },
    ]);
  });

  it('тусклых звёзд для рисования семь', () => {
    expect(INVITE_STARS).toHaveLength(7);
  });

  it('рисовать можно по ковшу и тусклым звёздам, ковш первым', () => {
    expect(DRAWABLE_STARS).toHaveLength(14);
    expect(DRAWABLE_STARS.slice(0, 7)).toEqual(DIPPER_STARS);
  });

  it('центр ковша — центр рамки семи звёзд', () => {
    expect(DIPPER_CENTER).toEqual({ x: 50, y: 26.5 });
  });
});

describe('createRandom', () => {
  it('с одним зерном даёт одну и ту же последовательность', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('с разными зёрнами последовательности различаются', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('значения лежат в [0, 1)', () => {
    const random = createRandom(2026);
    const values = Array.from({ length: 1000 }, () => random());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe('buildStarTable', () => {
  it('содержит 150 фоновых, 7 ярких и 7 тусклых звёзд', () => {
    expect(buildStarTable()).toHaveLength((150 + 7 + 7) * STAR_STRIDE);
  });

  it('детерминирована между вызовами', () => {
    expect(buildStarTable()).toEqual(buildStarTable());
  });

  it('первая яркая звезда стоит после фоновых: Дубхе с обликом по звёздной величине 1.79', () => {
    const first = 150 * STAR_STRIDE;
    const [x, y, size, brightness, kind, tone, rays] = Array.from(
      buildStarTable().slice(first, first + STAR_STRIDE),
    );
    expect([x, y, kind]).toEqual([1, 0, 1]);
    expect(size).toBeCloseTo(4.693, 3);
    expect(brightness).toBeCloseTo(0.9009, 3);
    expect(tone).toBeCloseTo(0.15, 5);
    expect(rays).toBeCloseTo(0.12, 5);
  });

  it('Мегрец — самая слабая звезда ковша — меньше Алиота, самой яркой', () => {
    const table = buildStarTable();
    const sizeOf = (index: number) => table[(150 + index) * STAR_STRIDE + 2];
    expect(sizeOf(3)).toBeCloseTo(2.717, 3);
    expect(sizeOf(4)).toBeCloseTo(4.719, 3);
  });

  it('Алькаид — самый светлый по тону, Дубхе — самый тёплый', () => {
    const table = buildStarTable();
    const toneOf = (index: number) => table[(150 + index) * STAR_STRIDE + 5];
    expect(toneOf(6)).toBeCloseTo(1, 5);
    expect(toneOf(0)).toBeCloseTo(0.15, 5);
  });
});
