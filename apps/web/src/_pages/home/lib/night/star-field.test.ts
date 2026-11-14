import { describe, expect, it } from 'vitest';
import { createSkyLanding, LANDING_CAPACITY } from '../sky-landing';
import { Projector } from './projection';
import { StarField } from './star-field';
import { STAR_STRIDE } from './stars';
import type { CameraPose } from './projection';

/** Фоновых звёзд в stars.ts, из них 60% на небе, остальные на конечной дальности. */
const BACKGROUND = 150;
const SKY = 90;
const DRAWABLE = 14;

const POSE: CameraPose = {
  yaw: 0,
  pitch: 0,
  distance: 300,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  anchorX: 400,
  anchorY: 300,
  skyYaw: 0,
  skyPitch: 0,
};

function createProjector(pose: Partial<CameraPose> = {}): Projector {
  const projector = new Projector();
  projector.setView(800, 600);
  projector.setPose({ ...POSE, ...pose });
  return projector;
}

/** Масштаб в точке взгляда при расстоянии по умолчанию. */
function focusScale(projector: Projector): number {
  return projector.focal / POSE.distance;
}

/** Строки таблицы [from, to): значение поля offset у каждой. */
function column(
  field: StarField,
  rows: { readonly from: number; readonly to: number },
  offset: number,
): number[] {
  return Array.from(
    { length: rows.to - rows.from },
    (_, i) => field.table[(rows.from + i) * STAR_STRIDE + offset] ?? 0,
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Звёзды для рисования (ковш и тусклые) — последние 14 строк таблицы. */
function layers(field: StarField) {
  return { dipperFirst: field.count - DRAWABLE };
}

describe('StarField: состав', () => {
  it('содержит 150 фоновых звёзд, 7 звёзд ковша и 7 тусклых', () => {
    const field = new StarField();

    expect(field.count).toBe(BACKGROUND + DRAWABLE);
    expect(field.table).toHaveLength(field.count * STAR_STRIDE);
  });

  it('drawablePoints отдаёт 14 точек: семь звёзд ковша по порядку, затем семь тусклых', () => {
    const field = new StarField();
    const projector = createProjector();
    field.project(projector, focusScale(projector));
    const { dipperFirst } = layers(field);

    const points = field.drawablePoints();

    expect(points).toHaveLength(14);
    expect(points[0]).toEqual({
      x: field.table[dipperFirst * STAR_STRIDE],
      y: field.table[dipperFirst * STAR_STRIDE + 1],
    });
    expect(points[7]).toEqual({
      x: field.table[(dipperFirst + 7) * STAR_STRIDE],
      y: field.table[(dipperFirst + 7) * STAR_STRIDE + 1],
    });
  });

  it('drawablePoint пишет положение звезды по её номеру', () => {
    const field = new StarField();
    const projector = createProjector();
    field.project(projector, focusScale(projector));
    const { dipperFirst } = layers(field);
    const out = { x: 0, y: 0, k: 0 };

    field.drawablePoint(1, out);

    expect(out.x).toBe(field.table[(dipperFirst + 1) * STAR_STRIDE]);
    expect(out.y).toBe(field.table[(dipperFirst + 1) * STAR_STRIDE + 1]);
  });
});

describe('StarField: параллакс слоёв', () => {
  function shiftOnTranslation(field: StarField, from: number, to: number): number {
    const projector = createProjector();
    field.project(projector, focusScale(projector));
    const before = column(field, { from: from, to: to }, 0);
    field.project(createProjector({ targetX: 100 }), focusScale(projector));
    const after = column(field, { from: from, to: to }, 0);
    return mean(before.map((x, i) => Math.abs(x - (after[i] ?? 0))));
  }

  it('звёзды неба не сдвигаются при сдвиге камеры', () => {
    expect(shiftOnTranslation(new StarField(), 0, SKY)).toBe(0);
  });

  it('глубокие звёзды сдвигаются меньше звёзд ковша', () => {
    const field = new StarField();
    const { dipperFirst } = layers(field);

    const deep = shiftOnTranslation(field, SKY, BACKGROUND);
    const dipper = shiftOnTranslation(field, dipperFirst, dipperFirst + 7);

    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThan(dipper);
  });

  it('размер глубоких звёзд свободно растёт и ограничен 0,5…1,6 от исходного', () => {
    const field = new StarField();
    const base = column(field, { from: SKY, to: BACKGROUND }, 2);
    const projector = createProjector();

    field.project(projector, focusScale(projector) / 100);
    const grown = column(field, { from: SKY, to: BACKGROUND }, 2);
    field.project(projector, focusScale(projector) * 100);
    const shrunk = column(field, { from: SKY, to: BACKGROUND }, 2);

    expect(grown.every((size, i) => Math.abs(size - (base[i] ?? 0) * 1.6) < 1e-4)).toBe(true);
    expect(shrunk.every((size, i) => Math.abs(size - (base[i] ?? 0) * 0.5) < 1e-4)).toBe(true);
  });

  it('когда небо (угол × 0,33) развёрнуто на 180°, все его звёзды за спиной: размер 0', () => {
    const field = new StarField();
    const projector = createProjector({ yaw: Math.PI / 0.33 });

    field.project(projector, focusScale(projector));

    expect(column(field, { from: 0, to: SKY }, 2).every((size) => size === 0)).toBe(true);
  });
});

describe('StarField: звёзды ковша', () => {
  it('Мерак (z < 0) ближе к камере и крупнее, Дубхе (z > 0) дальше и мельче', () => {
    const field = new StarField();
    const { dipperFirst } = layers(field);
    const dubheSize = field.table[dipperFirst * STAR_STRIDE + 2] ?? 0;
    const merakSize = field.table[(dipperFirst + 1) * STAR_STRIDE + 2] ?? 0;
    const projector = createProjector();

    field.project(projector, focusScale(projector));

    expect(field.table[(dipperFirst + 1) * STAR_STRIDE + 2]).toBeGreaterThan(merakSize);
    expect(field.table[dipperFirst * STAR_STRIDE + 2]).toBeLessThan(dubheSize);
  });

  it('рост ограничен сверху 1,35 и снизу 0,75 от исходного размера', () => {
    const field = new StarField();
    const { dipperFirst } = layers(field);
    const baseSize = field.table[dipperFirst * STAR_STRIDE + 2] ?? 0;
    const projector = createProjector();

    // цель вдвое мельче — звёзды вдвое «ближе» цели, но рост упирается в 1,35
    field.project(projector, focusScale(projector) / 2);
    const grown = field.table[dipperFirst * STAR_STRIDE + 2] ?? 0;
    // цель вдесятеро крупнее — звёзды мельче цели, но не меньше 0,75
    field.project(projector, focusScale(projector) * 10);
    const shrunk = field.table[dipperFirst * STAR_STRIDE + 2] ?? 0;

    expect(grown).toBeCloseTo(baseSize * 1.35, 5);
    expect(shrunk).toBeCloseTo(baseSize * 0.75, 5);
  });

  it('Дубхе (y = 0) при прямой камере лежит на горизонтали опоры, Мерак (x = 0) — на её вертикали', () => {
    const field = new StarField();
    const { dipperFirst } = layers(field);
    const projector = createProjector();

    field.project(projector, focusScale(projector));

    expect(field.table[dipperFirst * STAR_STRIDE + 1]).toBeCloseTo(300, 6);
    expect(field.table[(dipperFirst + 1) * STAR_STRIDE]).toBeCloseTo(400, 6);
  });
});

describe('StarField: посадка капель', () => {
  const VIEW = { width: 800, height: 600 };
  /** Одна проекция, цели выбраны и записаны на стол. */
  function landed() {
    const field = new StarField();
    const projector = createProjector();
    field.project(projector, focusScale(projector));
    const landing = createSkyLanding();
    field.selectLanding(VIEW);
    field.writeLanding(landing);
    return { field, landing };
  }

  it('целей не больше ёмкости стола и не меньше семи звёзд ковша', () => {
    const { landing } = landed();

    expect(landing.count).toBeGreaterThanOrEqual(7);
    expect(landing.count).toBeLessThanOrEqual(LANDING_CAPACITY);
  });

  it('кроме ковша в цели берутся фоновые звёзды кадра', () => {
    const { landing } = landed();

    expect(landing.count).toBeGreaterThan(7);
  });

  it('первые семь целей — звёзды ковша по порядку', () => {
    const { field, landing } = landed();
    const dipper = field.drawablePoints().slice(0, 7);

    for (const [k, point] of dipper.entries()) {
      expect(landing.x[k]).toBe(point.x);
      expect(landing.y[k]).toBe(point.y);
    }
  });

  it('радиус севшей капли не меньше 0,9 px у каждой цели', () => {
    const { landing } = landed();

    for (let k = 0; k < landing.count; k++) {
      // Float32Array хранит 0.9 как 0.89999998…, поэтому нижняя граница с допуском
      expect(landing.radius[k]).toBeGreaterThanOrEqual(Math.fround(0.9));
    }
  });

  it('фоновые цели лежат в кадре, не ближе 4% стороны к краю', () => {
    const { landing } = landed();

    for (let k = 7; k < landing.count; k++) {
      expect(landing.x[k]).toBeGreaterThan(VIEW.width * 0.04);
      expect(landing.x[k]).toBeLessThan(VIEW.width * 0.96);
      expect(landing.y[k]).toBeGreaterThan(VIEW.height * 0.04);
      expect(landing.y[k]).toBeLessThan(VIEW.height * 0.96);
    }
  });

  it('без выбора целей на стол пишется ноль целей', () => {
    const field = new StarField();
    const landing = createSkyLanding();

    field.writeLanding(landing);

    expect(landing.count).toBe(0);
  });
});
