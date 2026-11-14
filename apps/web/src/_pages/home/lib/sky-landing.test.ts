import { describe, expect, it } from 'vitest';
import { createSkyLanding, LANDING_CAPACITY, skyLanding } from './sky-landing';

describe('createSkyLanding', () => {
  it('создаёт пустой стол: целей нет, ничего не занято', () => {
    const landing = createSkyLanding();

    expect(landing.count).toBe(0);
    expect(landing.claimed).toBe(0);
  });

  it('выделяет массивы на LANDING_CAPACITY целей, заполненные нулями', () => {
    const landing = createSkyLanding();

    expect(LANDING_CAPACITY).toBe(44);
    expect(landing.x).toHaveLength(LANDING_CAPACITY);
    expect(landing.y).toHaveLength(LANDING_CAPACITY);
    expect(landing.radius).toHaveLength(LANDING_CAPACITY);
    expect(Math.max(...landing.x, ...landing.y, ...landing.radius)).toBe(0);
  });

  it('каждый вызов отдаёт новый стол, не связанный с общим', () => {
    const first = createSkyLanding();
    const second = createSkyLanding();

    first.x[0] = 5;

    expect(second.x[0]).toBe(0);
    expect(first).not.toBe(skyLanding);
  });
});
