import { describe, expect, it } from 'vitest';
import { CLOUDS_FORMATION, projectCloud } from './clouds-formation';

describe('clouds-formation', () => {
  it('содержит эшелоны облаков по сценарию и эскизу', () => {
    expect(CLOUDS_FORMATION.length).toBeGreaterThanOrEqual(6);
    // Проверяем наличие направлений разлёта: верх-лево, верх-право, низ
    const hasTopLeft = CLOUDS_FORMATION.some((c) => c.worldX < 0 && c.worldY < 0);
    const hasTopRight = CLOUDS_FORMATION.some((c) => c.worldX > 0 && c.worldY < 0);
    const hasBottom = CLOUDS_FORMATION.some((c) => c.worldY > 0);
    expect(hasTopLeft).toBe(true);
    expect(hasTopRight).toBe(true);
    expect(hasBottom).toBe(true);
  });

  it('облако приближается и разлетается радиально от центра', () => {
    const cloud = CLOUDS_FORMATION[0];
    if (!cloud) throw new Error('Облако не найдено');
    const vp = { width: 1000, height: 800 };

    const far = projectCloud(cloud, 0.1, vp);
    const closer = projectCloud(cloud, 0.5, vp);

    // При приближении облако увеличивается в размере
    expect(closer.widthPx).toBeGreaterThan(far.widthPx);
    // И смещается дальше от центра в сторону своего вектора (влево и вверх)
    expect(closer.xPx).toBeLessThan(far.xPx);
    expect(closer.yPx).toBeLessThan(far.yPx);
  });

  it('облако становится невидимым, когда камера пролетает сквозь него (dz <= 0.05)', () => {
    const cloud = CLOUDS_FORMATION[0];
    if (!cloud) throw new Error('Облако не найдено');
    const past = projectCloud(cloud, cloud.worldZ + 0.1, { width: 1000, height: 800 });
    expect(past.isVisible).toBe(false);
    expect(past.opacity).toBe(0);
  });
});
