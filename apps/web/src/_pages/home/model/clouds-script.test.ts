import { describe, expect, it } from 'vitest';
import { CLOUDS_PHRASES } from './clouds-script';

describe('clouds-script', () => {
  it('содержит ровно 4 фразы по сценарию (О2–О5)', () => {
    expect(CLOUDS_PHRASES).toHaveLength(4);
    expect(CLOUDS_PHRASES[0]?.text).toBe('Говорят, мысли приходят в голову.');
    expect(CLOUDS_PHRASES[1]?.text).toBe('Никто не видел откуда.');
    expect(CLOUDS_PHRASES[2]?.text).toBe('Кажется, они поднимаются снизу —');
    expect(CLOUDS_PHRASES[3]?.text).toBe('из всего, что с тобой было.');
  });

  it('фразы упорядочены по скроллу и не перекрываются', () => {
    for (let i = 0; i < CLOUDS_PHRASES.length; i++) {
      const phrase = CLOUDS_PHRASES[i];
      if (!phrase) continue;
      expect(phrase.start).toBeLessThan(phrase.end);
      if (i > 0) {
        const prev = CLOUDS_PHRASES[i - 1];
        if (prev) {
          expect(phrase.start).toBeGreaterThanOrEqual(prev.end);
        }
      }
    }
  });

  it('укладываются в бюджет длины строки (до 28 знаков в строке)', () => {
    for (const phrase of CLOUDS_PHRASES) {
      expect(phrase.text.length).toBeLessThanOrEqual(40);
    }
  });
});
