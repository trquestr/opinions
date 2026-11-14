import { describe, expect, it } from 'vitest';
import { OverviewSky, overviewSkyPosition } from './overview-sky';
import { HAZE } from './timeline';

const VIEW = { width: 1000, height: 800 };

function point(): { x: number; y: number } {
  return { x: 0, y: 0 };
}

describe('overviewSkyPosition', () => {
  it('медведица: мнимое небо на полшага вправо и вверх — по знаку её бокового доворота', () => {
    const out = point();
    overviewSkyPosition(1, out);
    expect(out).toEqual({ x: 0.5, y: -0.5 });
  });

  it('плуг стоит по другую сторону: полшага влево', () => {
    const out = point();
    overviewSkyPosition(2, out);
    expect(out).toEqual({ x: -0.5, y: -0.5 });
  });

  it('у общего плана мнимое небо в нуле', () => {
    const out = { x: 1, y: 1 };
    overviewSkyPosition(HAZE, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });
});

describe('OverviewSky', () => {
  it('с общего плана к медведице деталь въезжает с полэкрана и встаёт в угол к концу хода', () => {
    const sky = new OverviewSky();
    sky.aim(1, 1);
    const shift = point();

    sky.lagShift(0, VIEW, shift);
    expect(shift).toEqual({ x: 500, y: -400 });

    sky.lagShift(0.5, VIEW, shift);
    expect(shift).toEqual({ x: 250, y: -200 });

    sky.lagShift(1, VIEW, shift);
    expect(shift.x).toBeCloseTo(0);
    expect(shift.y).toBeCloseTo(0);
  });

  it('при смене фигуры уходящая деталь уплывает на целый экран в сторону движения неба', () => {
    const sky = new OverviewSky();
    sky.aim(1, 1);
    sky.aim(2, 1);
    const shift = point();

    sky.driftShift(0, VIEW, shift);
    expect(shift.x).toBeCloseTo(0);

    sky.driftShift(1, VIEW, shift);
    expect(shift.x).toBeCloseTo(1000);
    expect(shift.y).toBeCloseTo(0);
  });

  it('новая цель посреди хода стартует с текущего положения неба, без скачка', () => {
    const sky = new OverviewSky();
    sky.aim(1, 1);
    sky.aim(2, 0.5);
    const shift = point();

    sky.lagShift(0, VIEW, shift);
    expect(shift.x).toBeCloseTo(-750);
    expect(shift.y).toBeCloseTo(-200);
  });

  it('без анимации встаёт в цель сразу: ни въезда, ни сноса', () => {
    const sky = new OverviewSky();
    sky.snap(1);
    const lag = point();
    const drift = point();

    sky.lagShift(0, VIEW, lag);
    sky.driftShift(0.5, VIEW, drift);
    expect(lag.x).toBeCloseTo(0);
    expect(lag.y).toBeCloseTo(0);
    expect(drift.x).toBeCloseTo(0);
    expect(drift.y).toBeCloseTo(0);
  });
});
