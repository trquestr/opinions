import { describe, expect, it } from 'vitest';
import { CLOUDS_FORMATION, projectCloud } from './clouds-formation';

const VIEWPORT = { width: 1000, height: 800 };

describe('clouds-formation', () => {
  it('содержит десять облаков, и все лежат ниже точки схода', () => {
    expect(CLOUDS_FORMATION).toHaveLength(10);
    expect(CLOUDS_FORMATION.every((c) => c.worldY > 0)).toBe(true);
  });

  it('есть облака слева и справа от оси подъёма', () => {
    expect(CLOUDS_FORMATION.some((c) => c.worldX < 0)).toBe(true);
    expect(CLOUDS_FORMATION.some((c) => c.worldX > 0)).toBe(true);
  });

  it('при приближении камеры облако растёт, уходит вниз и от центра', () => {
    const cloud = CLOUDS_FORMATION[0];
    if (!cloud) throw new Error('Облако не найдено');

    const far = projectCloud(cloud, 0.1, VIEWPORT);
    const closer = projectCloud(cloud, 0.5, VIEWPORT);

    expect(closer.widthPx).toBeGreaterThan(far.widthPx);
    // c-left-1 лежит слева: уходит дальше влево и вниз
    expect(closer.xPx).toBeLessThan(far.xPx);
    expect(closer.yPx).toBeGreaterThan(far.yPx);
  });

  it('проецирует облако по формулам масштаба, смещения и ширины', () => {
    const cloud = { id: 't', src: '', worldX: 0.5, worldY: 0.4, worldZ: 1.0, baseWidthVw: 40 };
    // dz = 0.5, масштаб = 1 / (0.5 * 0.85 + 0.28) = 1 / 0.705
    const projected = projectCloud(cloud, 0.5, VIEWPORT);

    expect(projected.xPx).toBeCloseTo(1000 * (0.5 + (0.5 / 0.705) * 0.55), 3);
    expect(projected.yPx).toBeCloseTo(800 * (-0.12 + 0.4 / 0.705), 3);
    expect(projected.widthPx).toBeCloseTo((0.4 * 1000) / 0.705, 3);
  });

  it('на вертикальном экране размер облака считается от доли высоты, а не от узкой ширины', () => {
    const cloud = { id: 't', src: '', worldX: 0.5, worldY: 0.4, worldZ: 1.0, baseWidthVw: 40 };
    // 0.62 * 1000 = 620 > 400, масштаб тот же 1 / 0.705
    const projected = projectCloud(cloud, 0.5, { width: 400, height: 1000 });

    expect(projected.widthPx).toBeCloseTo((0.4 * 620) / 0.705, 3);
  });

  it('облако проступает из дымки: далеко (dz >= 1.6) оно невидимо', () => {
    const cloud = { id: 't', src: '', worldX: 0, worldY: 0.3, worldZ: 2.0, baseWidthVw: 30 };
    const projected = projectCloud(cloud, 0.4, VIEWPORT);

    expect(projected.opacity).toBe(0);
    expect(projected.isVisible).toBe(false);
  });

  it('облако становится невидимым, когда камера пролетает сквозь него (dz <= 0.05)', () => {
    const cloud = CLOUDS_FORMATION[0];
    if (!cloud) throw new Error('Облако не найдено');
    const past = projectCloud(cloud, cloud.worldZ + 0.1, VIEWPORT);
    expect(past.isVisible).toBe(false);
    expect(past.opacity).toBe(0);
  });
});
