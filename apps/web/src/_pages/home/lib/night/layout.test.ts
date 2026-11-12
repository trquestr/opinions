import { describe, expect, it } from 'vitest';
import { computeLayout, pxToUnits, unitsToPx } from './layout';
import type { Bounds } from './layout';

const BOUNDS: Bounds = { minX: -28.7, minY: -25.4, maxX: 125, maxY: 83.1 };

describe('computeLayout', () => {
  it('на десктопе масштаб ограничен высотой (62%)', () => {
    expect(computeLayout({ width: 1440, height: 900 }, BOUNDS).scale).toBeCloseTo(5.1429, 3);
  });

  it('на телефоне масштаб ограничен шириной (86%)', () => {
    expect(computeLayout({ width: 375, height: 812 }, BOUNDS).scale).toBeCloseTo(2.0982, 3);
  });

  it.each([
    [1440, 900],
    [375, 812],
  ])('фигуры помещаются в 86%% ширины и 62%% высоты экрана %sx%s', (width, height) => {
    const layout = computeLayout({ width, height }, BOUNDS);
    const topLeft = unitsToPx(layout, { x: BOUNDS.minX, y: BOUNDS.minY });
    const bottomRight = unitsToPx(layout, { x: BOUNDS.maxX, y: BOUNDS.maxY });
    expect(bottomRight.x - topLeft.x).toBeLessThanOrEqual(width * 0.86 + 1e-6);
    expect(bottomRight.y - topLeft.y).toBeLessThanOrEqual(height * 0.62 + 1e-6);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(width);
  });

  it('центрирует фигуры по горизонтали', () => {
    const layout = computeLayout({ width: 1000, height: 1000 }, BOUNDS);
    const left = unitsToPx(layout, { x: BOUNDS.minX, y: 0 }).x;
    const right = unitsToPx(layout, { x: BOUNDS.maxX, y: 0 }).x;
    expect((left + right) / 2).toBeCloseTo(500, 5);
  });
});

describe('unitsToPx / pxToUnits', () => {
  it('переводит единицы в пиксели и обратно без потерь', () => {
    const layout = { originX: 120, originY: 80, scale: 3.5 };
    const back = pxToUnits(layout, unitsToPx(layout, { x: 44, y: 20 }));
    expect(back.x).toBeCloseTo(44, 9);
    expect(back.y).toBeCloseTo(20, 9);
  });

  it('точка (0, 0) попадает в начало раскладки', () => {
    expect(unitsToPx({ originX: 120, originY: 80, scale: 3.5 }, { x: 0, y: 0 })).toEqual({ x: 120, y: 80 });
  });
});
