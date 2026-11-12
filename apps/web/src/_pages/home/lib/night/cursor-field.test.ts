import { describe, expect, it } from 'vitest';
import { CursorField, fieldConfig, MAX_CURSOR_DOTS } from './cursor-field';
import { createRandom } from './stars';

const VIEW = { width: 400, height: 300 };
const CENTER = { x: 200, y: 150 };
const FRAME_MS = 16.667;

interface Dot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly stretch: number;
}

function createField(view = VIEW): CursorField {
  const field = new CursorField(createRandom(5));
  field.build(view);
  return field;
}

function readDots(field: CursorField): Dot[] {
  return Array.from({ length: field.dotCount }, (_, n) => ({
    x: field.dots[n * 4] ?? 0,
    y: field.dots[n * 4 + 1] ?? 0,
    r: field.dots[n * 4 + 2] ?? 0,
    stretch: field.dots[n * 4 + 3] ?? 0,
  }));
}

function stepTimes(field: CursorField, times: number, dtMs = FRAME_MS): void {
  Array.from({ length: times }).forEach(() => field.step(dtMs));
}

function largestRadius(field: CursorField): number {
  return Math.max(0, ...readDots(field).map((dot) => dot.r));
}

/** Все пары точек: наименьшее расстояние (вспомогательная проверка, не ожидаемое значение). */
function minPairDistance(dots: readonly Dot[]): number {
  return Math.min(
    Infinity,
    ...dots.flatMap((a, i) => dots.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))),
  );
}

describe('fieldConfig', () => {
  it('для 1440×900 даёт полные размеры пролога', () => {
    expect(fieldConfig({ width: 1440, height: 900 })).toEqual({
      maxRadius: 12,
      fieldRadius: 42,
      clickRadius: 55,
      minDist: 18.8,
    });
  });

  it('для 375×812 размеры меньше', () => {
    const config = fieldConfig({ width: 375, height: 812 });

    expect(config.maxRadius).toBe(6);
    expect(config.fieldRadius).toBe(29);
    expect(config.clickRadius).toBe(39);
    expect(config.minDist).toBeCloseTo(13.16, 5);
  });
});

describe('CursorField: указатель', () => {
  it('быстрое движение задаёт скорость и направление', () => {
    const field = createField();

    field.pointer.moveTo(100, 100);
    field.pointer.moveTo(100, 140);
    field.pointer.update(1);

    expect(field.pointer.vy).toBeCloseTo(10, 5);
    expect(field.pointer.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('совсем медленное движение скорость обнуляет', () => {
    const field = createField();

    field.pointer.moveTo(100, 100);
    field.pointer.moveTo(100.2, 100);
    field.pointer.update(1);

    expect(field.pointer.speed).toBe(0);
  });

  it('leave снимает признак «внутри»', () => {
    const field = createField();
    field.pointer.moveTo(100, 100);

    field.pointer.leave();

    expect(field.pointer.isInside).toBe(false);
  });
});

describe('CursorField: прорастание у курсора', () => {
  it('пока курсор не входил, капель нет и поле неактивно', () => {
    const field = createField();

    field.step(FRAME_MS);

    expect(field.dotCount).toBe(0);
    expect(field.isActive()).toBe(false);
  });

  it('после входа курсора капли растут только рядом с ним и не крупнее предела', () => {
    const field = createField();
    const { fieldRadius, maxRadius } = fieldConfig(VIEW);

    field.pointer.moveTo(CENTER.x, CENTER.y);
    stepTimes(field, 20);

    const dots = readDots(field);
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.every((dot) => Math.hypot(dot.x - CENTER.x, dot.y - CENTER.y) < fieldRadius)).toBe(true);
    expect(dots.every((dot) => dot.r <= maxRadius * 1.3 * 1.2)).toBe(true);
  });

  it('точки полотна стоят не ближе minDist друг к другу', () => {
    const field = createField();
    field.pointer.moveTo(CENTER.x, CENTER.y);

    stepTimes(field, 20);

    expect(minPairDistance(readDots(field))).toBeGreaterThanOrEqual(fieldConfig(VIEW).minDist - 0.01);
  });

  it('после ухода курсора капли тают, пока не исчезнут, и поле засыпает', () => {
    const field = createField();
    field.pointer.moveTo(CENTER.x, CENTER.y);
    stepTimes(field, 20);
    const before = largestRadius(field);

    field.pointer.leave();
    field.step(FRAME_MS);
    const after = largestRadius(field);
    stepTimes(field, 100);

    expect(after).toBeLessThan(before);
    expect(field.dotCount).toBe(0);
    expect(field.isActive()).toBe(false);
  });

  it('рамка капель охватывает все капли', () => {
    const field = createField();
    field.pointer.moveTo(CENTER.x, CENTER.y);
    stepTimes(field, 20);

    const dots = readDots(field);

    expect(dots.every((d) => d.x - d.r >= (field.bbox[0] ?? 0) && d.y - d.r >= (field.bbox[1] ?? 0))).toBe(true);
    expect(dots.every((d) => d.x + d.r <= (field.bbox[2] ?? 0) && d.y + d.r <= (field.bbox[3] ?? 0))).toBe(true);
  });
});

describe('CursorField: быстрое движение', () => {
  /** Курсор идёт по линии слева направо; эталон — те же положения, но «телепортом» (скорость нулевая). */
  function sweep(isTeleport: boolean): CursorField {
    const field = createField();
    Array.from({ length: 10 }, (_, k) => 100 + 40 * k).forEach((x) => {
      if (isTeleport) field.pointer.leave();
      field.pointer.moveTo(x, CENTER.y);
      field.step(FRAME_MS);
    });
    return field;
  }

  it('вытягивает капли по скорости', () => {
    const fast = sweep(false);
    const still = sweep(true);

    expect(Math.max(...readDots(fast).map((dot) => dot.stretch))).toBeGreaterThan(0);
    expect(Math.max(...readDots(still).map((dot) => dot.stretch))).toBe(0);
  });

  it('сносит капли не дальше 0,32 радиуса поля', () => {
    const fast = readDots(sweep(false));
    const still = readDots(sweep(true));

    const shifts = fast.map((dot, i) => Math.hypot(dot.x - (still[i]?.x ?? 0), dot.y - (still[i]?.y ?? 0)));

    expect(fast).toHaveLength(still.length);
    expect(Math.max(...shifts)).toBeGreaterThan(0);
    expect(Math.max(...shifts)).toBeLessThanOrEqual(fieldConfig(VIEW).fieldRadius * 0.32 + 0.01);
  });
});

describe('CursorField: щелчок', () => {
  it('будит капли вокруг точки щелчка без курсора', () => {
    const field = createField();

    field.click(CENTER.x, CENTER.y);
    field.step(FRAME_MS);

    expect(field.dotCount).toBeGreaterThan(0);
    expect(field.isActive()).toBe(true);
  });

  it('волна живёт 440 мс, потом капли тают и поле засыпает', () => {
    const field = createField();
    field.click(CENTER.x, CENTER.y);

    stepTimes(field, 43, 10);
    const during = field.isActive();
    stepTimes(field, 100, 50);

    expect(during).toBe(true);
    expect(field.dotCount).toBe(0);
    expect(field.isActive()).toBe(false);
  });
});

describe('CursorField: предел капель', () => {
  it('не передаёт шейдеру больше 256 капель', () => {
    const big = { width: 1440, height: 900 };
    const field = createField(big);
    Array.from({ length: 150 }, (_, k) => k).forEach((k) => field.click(60 + (k % 15) * 90, 60 + Math.floor(k / 15) * 85));

    field.step(30);

    expect(field.dotCount).toBe(MAX_CURSOR_DOTS);
  });
});

describe('CursorField: края экрана и разрежение', () => {
  it('щелчок за краем экрана не падает и будит только точки у края', () => {
    const field = createField();

    expect(() => {
      field.click(-20, -20);
      field.step(FRAME_MS);
    }).not.toThrow();
    expect(field.dotCount).toBeLessThan(10);
  });

  it('курсор у самого края поля тоже растит капли', () => {
    const field = createField();

    field.pointer.moveTo(2, 2);
    stepTimes(field, 10);

    expect(field.dotCount).toBeGreaterThan(0);
  });

  it('щелчок под курсором не раздувает капли сверх предела', () => {
    const field = createField();
    const { maxRadius } = fieldConfig(VIEW);
    field.pointer.moveTo(CENTER.x, CENTER.y);
    stepTimes(field, 10);

    field.click(CENTER.x, CENTER.y);
    stepTimes(field, 12, 25);

    expect(largestRadius(field)).toBeLessThanOrEqual(maxRadius * 1.3 * 1.2);
  });
});
