import { describe, expect, it } from 'vitest';
import { DRAWING_START, frameAt, ramp, windowOpacity } from './timeline';

describe('ramp', () => {
  it('поднимается линейно и обрезается по краям', () => {
    expect(ramp(-1, 0, 2)).toBe(0);
    expect(ramp(1, 0, 2)).toBe(0.5);
    expect(ramp(3, 0, 2)).toBe(1);
  });

  it('при b <= a работает как ступенька', () => {
    expect(ramp(0.9, 1, 1)).toBe(0);
    expect(ramp(1, 1, 1)).toBe(1);
    expect(ramp(0, 2, 1)).toBe(0);
    expect(ramp(1.5, 2, 1)).toBe(1);
  });
});

describe('windowOpacity', () => {
  const window = { from: 1, to: 2, fade: 0.2 } as const;

  it('проступает в начале окна и гаснет в конце', () => {
    expect(windowOpacity(1, window)).toBe(0);
    expect(windowOpacity(1.5, window)).toBe(1);
    expect(windowOpacity(2, window)).toBe(0);
  });

  it('вне окна невидимо', () => {
    expect(windowOpacity(0.5, window)).toBe(0);
    expect(windowOpacity(2.5, window)).toBe(0);
  });
});

describe('frameAt', () => {
  it('до начала сцены сцена прозрачна, с начала — полностью видна', () => {
    expect(frameAt(-0.5).stage).toBe(0);
    expect(frameAt(0).stage).toBe(1);
    expect(frameAt(3).stage).toBe(1);
  });

  it('смена дня на ночь занимает 0,12 экрана до начала сцены', () => {
    expect(frameAt(-0.12).stage).toBe(0);
    expect(frameAt(-0.06).stage).toBeCloseTo(0.5);
  });

  it('на 0,5 экрана видна только первая фраза', () => {
    expect(frameAt(0.5).phrases).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it.each([
    [-0.5, 0],
    [0.79, 0],
    [0.8, 1],
    [1.59, 1],
    [1.6, 2],
    [2.39, 2],
    [2.4, 3],
    [3.19, 3],
    [3.2, 4],
    [3.99, 4],
    [4.0, 0],
    [6.0, 0],
  ])('на u=%s целевая фигура туши — %s', (u, figure) => {
    expect(frameAt(u).figure).toBe(figure);
  });

  it.each([0.05, 0.4, 0.79, 0.8, 1.55, 1.6, 2.4, 3.2, 4.0, 4.4, 4.5, 4.95, 5.0, 5.2, 5.4, 6.0])(
    'на u=%s видно не больше одной фразы',
    (u) => {
      expect(frameAt(u).phrases.filter((opacity) => opacity > 0).length).toBeLessThanOrEqual(1);
    },
  );

  it('контур ковша виден внутри окна 5,0–5,4 и невидим вне него', () => {
    expect(frameAt(4.9).outline).toBe(0);
    expect(frameAt(5.2).outline).toBe(1);
    expect(frameAt(5.5).outline).toBe(0);
  });

  it('рисование начинается ровно с DRAWING_START', () => {
    expect(DRAWING_START).toBe(5.4);
    expect(frameAt(5.39).isDrawing).toBe(false);
    expect(frameAt(5.4).isDrawing).toBe(true);
  });

  it('гравюры на небе проступают в Н1 и дальше не уходят', () => {
    expect(frameAt(0.3).sky).toBe(0);
    expect(frameAt(0.8).sky).toBe(1);
    expect(frameAt(6.4).sky).toBe(1);
  });

  it('одинаковый u даёт одинаковый кадр', () => {
    expect(frameAt(2.7)).toEqual(frameAt(2.7));
  });
});
