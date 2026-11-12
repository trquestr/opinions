import { describe, expect, it } from 'vitest';
import { CLOUDS_STOPS, NIGHT_STOPS, pageStops, stopOfWindow } from './scroll-stops';

function expectCloseList(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 6);
  });
}

describe('stopOfWindow', () => {
  it('отступает от конца окна на два затухания фразы', () => {
    expect(stopOfWindow(0.9)).toBeCloseTo(0.7, 6);
    expect(stopOfWindow(6.5)).toBeCloseTo(6.3, 6);
  });
});

describe('остановки сцен', () => {
  it('остановки облаков берутся из окон фраз', () => {
    expectCloseList(CLOUDS_STOPS, [0.7, 1.1, 1.6, 2.1]);
  });

  it('остановки ночи берутся из окон фраз', () => {
    expectCloseList(NIGHT_STOPS, [0.6, 1.4, 2.2, 3.0, 3.8, 4.1, 4.8, 5.2, 6.3]);
  });
});

describe('pageStops', () => {
  it('добавляет начало, конец и переводит экраны секций в пиксели', () => {
    const result = pageStops({
      sections: [{ topPx: 1000, stops: [0.5, 1] }],
      viewportHeightPx: 800,
      maxScrollPx: 5000,
    });
    expectCloseList(result, [0, 1400, 1800, 5000]);
  });

  it('сортирует остановки разных секций', () => {
    const result = pageStops({
      sections: [
        { topPx: 3000, stops: [0.5] },
        { topPx: 1000, stops: [0.5] },
      ],
      viewportHeightPx: 1000,
      maxScrollPx: 9000,
    });
    expectCloseList(result, [0, 1500, 3500, 9000]);
  });

  it('обрезает остановки по границам страницы', () => {
    const result = pageStops({
      sections: [{ topPx: 100, stops: [-1, 10] }],
      viewportHeightPx: 1000,
      maxScrollPx: 2000,
    });
    expectCloseList(result, [0, 2000]);
  });

  it('убирает дубли', () => {
    const result = pageStops({
      sections: [{ topPx: 0, stops: [0, 1, 1] }],
      viewportHeightPx: 500,
      maxScrollPx: 500,
    });
    expectCloseList(result, [0, 500]);
  });

  it('при отрицательном maxScrollPx возвращает только ноль', () => {
    const result = pageStops({ sections: [], viewportHeightPx: 500, maxScrollPx: -10 });
    expectCloseList(result, [0]);
  });
});
