import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudsSimulation } from './clouds-sim';
import { frameAt, type CloudsFrame } from './timeline';

const WIDTH = 1000;
const HEIGHT = 600;
const NO_CURSOR = { x: 500, y: 300, isInside: false };
const CTX = { cursor: NO_CURSOR, width: WIDTH, height: HEIGHT };

/** Кадр О4: капли видны, всплывают сами (rise > 0). */
const RISING_FRAME = frameAt(1.5);
/** Тот же кадр, но капли сами не всплывают: двигает их только рывок скролла. */
const STILL_FRAME: CloudsFrame = { ...RISING_FRAME, rise: 0 };

/** Все случайные числа равны 0.5: капли стоят на одной дорожке, на середине пути, и сцена детерминирована. */
function fixRandom(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
}

function createSim(count = 10): CloudsSimulation {
  return new CloudsSimulation({ count, isSmallScreen: false });
}

function stepMany(
  sim: CloudsSimulation,
  frame: CloudsFrame,
  { steps, dt }: { steps: number; dt: number },
): void {
  for (let i = 0; i < steps; i++) {
    sim.step(dt, frame, CTX);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CloudsSimulation', () => {
  it('выделяет память под заданное количество частиц', () => {
    const sim = createSim(100);
    expect(sim.count).toBe(100);
    expect(sim.x.length).toBe(100);
    expect(sim.y.length).toBe(100);
    expect(sim.radius.length).toBe(100);
    expect(sim.alpha.length).toBe(100);
    expect(sim.dirX.length).toBe(100);
    expect(sim.dirY.length).toBe(100);
    expect(sim.stretch.length).toBe(100);
  });

  it('разбивает частицы на срезы под облаками (back) и над облаками (front)', () => {
    const sim = createSim(48);
    expect(sim.backCount).toBe(20);
    expect(sim.frontCount).toBe(28);
    expect(sim.back.count).toBe(20);
    expect(sim.front.count).toBe(28);
    expect(sim.back.x.length).toBe(20);
    expect(sim.front.x.length).toBe(28);
  });

  it('срезы делят память с общими массивами', () => {
    fixRandom();
    const sim = createSim(10);
    sim.step(0.016, RISING_FRAME, CTX);
    expect(sim.front.x[0]).toBe(sim.x[sim.backCount]);
    expect(sim.back.y[0]).toBe(sim.y[0]);
  });

  it('при stage <= 0 гасит все частицы', () => {
    fixRandom();
    const sim = createSim(50);
    sim.step(0.016, RISING_FRAME, CTX);
    expect(sim.alpha.some((a) => a > 0)).toBe(true);

    sim.step(0.016, frameAt(-0.5), CTX);
    expect(sim.alpha.every((a) => a === 0)).toBe(true);
  });

  it('капли поднимаются вверх без скролла', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, RISING_FRAME, CTX);
    const startY = sim.y[0] ?? 0;

    stepMany(sim, RISING_FRAME, { steps: 10, dt: 0.016 });

    expect(sim.y[0]).toBeLessThan(startY);
    expect(sim.dirY[0]).toBe(-1);
  });

  it('при rise = 0 и без скролла капли стоят на месте', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, STILL_FRAME, CTX);
    const startY = sim.y[0] ?? 0;

    stepMany(sim, STILL_FRAME, { steps: 10, dt: 0.016 });

    expect(sim.y[0]).toBeCloseTo(startY, 3);
  });

  it('положительный рывок скролла поднимает капли быстрее', () => {
    fixRandom();
    const calm = createSim();
    const jerked = createSim();
    calm.step(0.016, RISING_FRAME, CTX);
    jerked.step(0.016, RISING_FRAME, CTX);
    const startY = calm.y[0] ?? 0;

    jerked.addScrollImpulse(100);
    calm.step(0.016, RISING_FRAME, CTX);
    jerked.step(0.016, RISING_FRAME, CTX);

    expect(startY - (jerked.y[0] ?? 0)).toBeGreaterThan(startY - (calm.y[0] ?? 0) + 3);
    expect(jerked.dirY[0]).toBe(-1);
    expect(jerked.stretch[0]).toBeGreaterThan(calm.stretch[0] ?? 0);
  });

  it('отрицательный рывок скролла опускает капли и переворачивает направление', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, RISING_FRAME, CTX);
    const startY = sim.y[0] ?? 0;

    sim.addScrollImpulse(-100);
    sim.step(0.016, RISING_FRAME, CTX);

    expect(sim.y[0]).toBeGreaterThan(startY);
    expect(sim.dirY[0]).toBe(1);
  });

  it('рывок ограничен сверху: огромный скролл равен ограничению в 1800 px/с', () => {
    fixRandom();
    const huge = createSim();
    const limit = createSim();
    huge.step(0.016, STILL_FRAME, CTX);
    limit.step(0.016, STILL_FRAME, CTX);

    huge.addScrollImpulse(100000);
    limit.addScrollImpulse(500);
    huge.step(0.016, STILL_FRAME, CTX);
    limit.step(0.016, STILL_FRAME, CTX);

    expect(huge.y[0]).toBeCloseTo(limit.y[0] ?? 0, 3);
  });

  it('инерция затухает до покоя', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, STILL_FRAME, CTX);
    const startY = sim.y[0] ?? 0;

    sim.addScrollImpulse(100);
    stepMany(sim, STILL_FRAME, { steps: 20, dt: 0.5 });
    const restY = sim.y[0] ?? 0;
    sim.step(0.5, STILL_FRAME, CTX);

    expect(restY).toBeLessThan(startY);
    expect(sim.y[0]).toBeCloseTo(restY, 3);
    expect(sim.stretch[0]).toBe(0);
  });

  it('невидимы, пока капли не проступили (dropsVisibility = 0)', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, { ...RISING_FRAME, dropsVisibility: 0 }, CTX);
    expect(sim.alpha.every((a) => a === 0)).toBe(true);
  });

  it('невидимы, пока в кадре ноль капель (dropsFraction = 0)', () => {
    fixRandom();
    const sim = createSim();
    sim.step(0.016, { ...RISING_FRAME, dropsFraction: 0 }, CTX);
    expect(sim.alpha.every((a) => a === 0)).toBe(true);
  });

  it('при полной доле и видимости капли видны и прозрачность не выше 1', () => {
    fixRandom();
    const sim = createSim(44);
    sim.step(0.016, { ...RISING_FRAME, dropsFraction: 1, dropsVisibility: 1 }, CTX);

    expect(sim.alpha.some((a) => a > 0)).toBe(true);
    expect(sim.alpha.every((a) => a <= 1)).toBe(true);
  });

  it('при меньшей доле видна только часть капель', () => {
    fixRandom();
    const sim = createSim(40);
    sim.step(0.016, { ...RISING_FRAME, dropsFraction: 0.5, dropsVisibility: 1 }, CTX);

    const visible = sim.alpha.filter((a) => a > 0).length;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(40);
  });

  it('курсор в радиусе 110 px отталкивает каплю', () => {
    fixRandom();
    const calm = createSim();
    const pushed = createSim();
    calm.step(0.016, STILL_FRAME, CTX);
    pushed.step(0.016, STILL_FRAME, CTX);
    // Курсор слева от капли в 30 px: толкает её вправо
    const cursor = { x: (pushed.x[0] ?? 0) - 30, y: pushed.y[0] ?? 0, isInside: true };

    calm.step(0.016, STILL_FRAME, CTX);
    pushed.step(0.016, STILL_FRAME, { cursor, width: WIDTH, height: HEIGHT });

    expect(pushed.x[0]).toBeGreaterThan((calm.x[0] ?? 0) + 3);
  });

  it('курсор вне окна не трогает каплю', () => {
    fixRandom();
    const calm = createSim();
    const outside = createSim();
    calm.step(0.016, STILL_FRAME, CTX);
    outside.step(0.016, STILL_FRAME, CTX);
    const cursor = { x: (outside.x[0] ?? 0) - 30, y: outside.y[0] ?? 0, isInside: false };

    calm.step(0.016, STILL_FRAME, CTX);
    outside.step(0.016, STILL_FRAME, { cursor, width: WIDTH, height: HEIGHT });

    expect(outside.x[0]).toBeCloseTo(calm.x[0] ?? 0, 3);
  });

  it('курсор дальше 110 px не трогает каплю', () => {
    fixRandom();
    const calm = createSim();
    const distant = createSim();
    calm.step(0.016, STILL_FRAME, CTX);
    distant.step(0.016, STILL_FRAME, CTX);
    const cursor = { x: (distant.x[0] ?? 0) - 300, y: distant.y[0] ?? 0, isInside: true };

    calm.step(0.016, STILL_FRAME, CTX);
    distant.step(0.016, STILL_FRAME, { cursor, width: WIDTH, height: HEIGHT });

    expect(distant.x[0]).toBeCloseTo(calm.x[0] ?? 0, 3);
  });

  it('капля, ушедшая за верхний край, возвращается снизу и не выходит за поля 48 px', () => {
    fixRandom();
    const sim = createSim(4);
    sim.addScrollImpulse(100000);
    const ys: number[] = [];

    for (let i = 0; i < 30; i++) {
      sim.step(0.06, RISING_FRAME, CTX);
      ys.push(sim.y[0] ?? 0);
    }

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-48);
    expect(Math.max(...ys)).toBeLessThanOrEqual(HEIGHT + 48);
    // Рост y между шагами возможен только при возврате снизу
    expect(ys.some((y, index) => index > 0 && y > (ys[index - 1] ?? 0))).toBe(true);
  });

  it('при скролле назад капля уходит за нижний край и возвращается сверху', () => {
    fixRandom();
    const sim = createSim(4);
    sim.addScrollImpulse(-100000);
    const ys: number[] = [];

    for (let i = 0; i < 30; i++) {
      sim.step(0.06, RISING_FRAME, CTX);
      ys.push(sim.y[0] ?? 0);
    }

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-48);
    expect(Math.max(...ys)).toBeLessThanOrEqual(HEIGHT + 48);
    expect(ys.some((y, index) => index > 0 && y < (ys[index - 1] ?? 0))).toBe(true);
  });
});
