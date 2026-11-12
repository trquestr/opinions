import { describe, expect, it } from 'vitest';
import { CloudsSimulation } from './clouds-sim';
import { frameAt } from './timeline';

describe('CloudsSimulation', () => {
  it('выделяет память под заданное количество частиц', () => {
    const sim = new CloudsSimulation({ count: 100, isSmallScreen: false });
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
    const sim = new CloudsSimulation({ count: 48, isSmallScreen: false });
    expect(sim.backCount).toBe(20);
    expect(sim.frontCount).toBe(28);
    expect(sim.back.count).toBe(20);
    expect(sim.front.count).toBe(28);
    expect(sim.back.x.length).toBe(20);
    expect(sim.front.x.length).toBe(28);
  });

  it('при stage <= 0 гасит все частицы', () => {
    const sim = new CloudsSimulation({ count: 50, isSmallScreen: false });
    const frame = frameAt(-0.5);
    const cursor = { x: 500, y: 300, isInside: false };

    sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    expect(sim.alpha.every((a) => a === 0)).toBe(true);
  });

  it('при скролле принимает импульс и увеличивает скорость («рывок»)', () => {
    const sim = new CloudsSimulation({ count: 50, isSmallScreen: false });
    const cursor = { x: 500, y: 300, isInside: false };
    const frame = frameAt(0.7);

    // До импульса
    sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    const oldX = sim.x[0] ?? 0;
    const oldY = sim.y[0] ?? 0;

    // Передаём резкий скролл
    sim.addScrollImpulse(150);

    // Следующий шаг с импульсом
    sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    const newX = sim.x[0] ?? 0;
    const newY = sim.y[0] ?? 0;

    const delta = Math.hypot(newX - oldX, newY - oldY);
    expect(delta).toBeGreaterThan(0.5);
  });

  it('в статичном кадре без скролла точки остаются видимыми на полотне и их растяжение затухает', () => {
    const sim = new CloudsSimulation({ count: 20, isSmallScreen: false });
    const cursor = { x: 500, y: 300, isInside: false };
    const frame = frameAt(0.7);

    for (let f = 0; f < 30; f++) {
      sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    }

    // Точки не исчезают, они остаются видимыми
    expect(sim.alpha.some((a) => a > 0)).toBe(true);
    // В покое частицы круглые (stretch = 0)
    expect(sim.stretch.every((s) => s === 0)).toBe(true);
  });

  it('инерция плавно затухает со временем', () => {
    const sim = new CloudsSimulation({ count: 10, isSmallScreen: false });
    const cursor = { x: 500, y: 300, isInside: false };
    const frame = frameAt(1.0);

    sim.addScrollImpulse(200);

    // Замеряем смещение за первые 16 мс
    const x0 = sim.x[0] ?? 0;
    sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    const d1 = Math.abs((sim.x[0] ?? 0) - x0);

    // Пропускаем 500 мс (затухание)
    for (let i = 0; i < 25; i++) {
      sim.step(0.02, frame, { cursor, width: 1000, height: 600 });
    }

    const xBefore = sim.x[0] ?? 0;
    sim.step(0.016, frame, { cursor, width: 1000, height: 600 });
    const dLater = Math.abs((sim.x[0] ?? 0) - xBefore);

    // Смещение после затухания должно быть заметно меньше первого рывка
    expect(dLater).toBeLessThan(d1);
  });
});
