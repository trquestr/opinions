import { describe, expect, it } from 'vitest';
import { CLOUDS_SCREENS, VEIL_END, VEIL_START, frameAt, ramp, windowOpacity } from './timeline';

describe('clouds timeline', () => {
  describe('ramp', () => {
    it('обрезает значения вне диапазона [a, b]', () => {
      expect(ramp(-1, 0, 1)).toBe(0);
      expect(ramp(2, 0, 1)).toBe(1);
    });

    it('линейно интерполирует внутри диапазона', () => {
      expect(ramp(0.5, 0, 1)).toBeCloseTo(0.5);
      expect(ramp(0.25, 0, 1)).toBeCloseTo(0.25);
    });

    it('корректно обрабатывает b <= a', () => {
      expect(ramp(1, 2, 2)).toBe(0);
      expect(ramp(2, 2, 2)).toBe(1);
    });
  });

  describe('windowOpacity', () => {
    it('плавно поднимается, держится и плавно уходит', () => {
      const w = { from: 1.0, to: 2.0, fade: 0.1 };
      expect(windowOpacity(0.9, w)).toBe(0);
      expect(windowOpacity(1.05, w)).toBeCloseTo(0.5);
      expect(windowOpacity(1.1, w)).toBe(1);
      expect(windowOpacity(1.5, w)).toBe(1);
      expect(windowOpacity(1.95, w)).toBeCloseTo(0.5);
      expect(windowOpacity(2.0, w)).toBe(0);
      expect(windowOpacity(2.1, w)).toBe(0);
    });
  });

  describe('frameAt', () => {
    it('до сцены (u < 0) и после (u > 3.1) сцена погашена', () => {
      expect(frameAt(-0.5).stage).toBe(0);
      expect(frameAt(3.5).stage).toBe(0);
      expect(frameAt(1.0).stage).toBe(1);
    });

    it('О1 (0..0.5): слово увеличивается и уходит', () => {
      const fStart = frameAt(0);
      const fMid = frameAt(0.25);
      const fEnd = frameAt(0.5);

      expect(fStart.wordmarkScale).toBe(1.0);
      expect(fStart.wordmarkOpacity).toBe(1.0);
      expect(fMid.wordmarkScale).toBeGreaterThan(1.0);
      expect(fEnd.wordmarkScale).toBeGreaterThan(8.0);
      expect(fEnd.wordmarkOpacity).toBe(0);
    });

    it('3D-облака скрыты в прологе (u=0) и в О1, проявляются к О2', () => {
      expect(frameAt(0).cloudsVisibility).toBe(0);
      expect(frameAt(0.2).cloudsVisibility).toBe(0);
      expect(frameAt(0.7).cloudsVisibility).toBe(1);
      expect(frameAt(2.0).cloudsVisibility).toBe(1);
      expect(frameAt(3.0).cloudsVisibility).toBe(0);
    });

    it('О2–О5: фразы проступают строго по своим окнам', () => {
      // Фраза 0: 0.5..0.9
      expect(frameAt(0.4).phrases[0]).toBe(0);
      expect(frameAt(0.7).phrases[0]).toBe(1);
      expect(frameAt(1.0).phrases[0]).toBe(0);

      // Фраза 1: 0.9..1.3
      expect(frameAt(0.8).phrases[1]).toBe(0);
      expect(frameAt(1.1).phrases[1]).toBe(1);
      expect(frameAt(1.4).phrases[1]).toBe(0);

      // Фраза 2: 1.3..1.8
      expect(frameAt(1.2).phrases[2]).toBe(0);
      expect(frameAt(1.55).phrases[2]).toBe(1);
      expect(frameAt(1.9).phrases[2]).toBe(0);

      // Фраза 3: 1.8..2.3
      expect(frameAt(1.7).phrases[3]).toBe(0);
      expect(frameAt(2.05).phrases[3]).toBe(1);
      expect(frameAt(2.4).phrases[3]).toBe(0);
    });

    it('капли проступают вместе с облаками', () => {
      expect(frameAt(0.4).dropsVisibility).toBe(0);
      expect(frameAt(0.625).dropsVisibility).toBeCloseTo(0.5);
      expect(frameAt(0.9).dropsVisibility).toBe(1);
    });

    it('в О2–О3 в кадре горсть капель, к концу О5 поднимаются все', () => {
      expect(frameAt(1.0).dropsFraction).toBeCloseTo(0.3);
      expect(frameAt(2.1).dropsFraction).toBeCloseTo(1);
    });

    it('скорость всплытия растёт в О4–О5', () => {
      expect(frameAt(1.0).rise).toBeCloseTo(0.35);
      expect(frameAt(2.1).rise).toBeCloseTo(1);
    });

    it('вуаль сумерек не идёт до VEIL_START и закончена к VEIL_END', () => {
      expect(frameAt(VEIL_START - 0.1).veil).toBe(0);
      expect(frameAt(VEIL_START).veil).toBe(0);
      expect(frameAt((VEIL_START + VEIL_END) / 2).veil).toBeCloseTo(0.5);
      expect(frameAt(VEIL_END).veil).toBe(1);
      expect(frameAt(CLOUDS_SCREENS).veil).toBe(1);
    });

    it('под вуалью капли замедляются и повисают дымкой', () => {
      // К VEIL_END всплытие падает до 20% от полного
      expect(frameAt(VEIL_END).rise).toBeCloseTo(0.2);
    });

    it('облака уходят к приходу ночной сцены', () => {
      expect(frameAt(2.72).cloudsVisibility).toBe(1);
      expect(frameAt(2.9).cloudsVisibility).toBe(0);
    });
  });
});
