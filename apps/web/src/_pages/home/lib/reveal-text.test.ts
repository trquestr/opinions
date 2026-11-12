import { describe, expect, it } from 'vitest';
import { LETTER_STEP_MS, MAX_SPREAD_MS, toRevealWords } from './reveal-text';

function charsOf(text: string): string[][] {
  return toRevealWords(text).map((word) => word.letters.map((letter) => letter.char));
}

function delaysOf(text: string): number[][] {
  return toRevealWords(text).map((word) => word.letters.map((letter) => letter.delayMs));
}

describe('toRevealWords', () => {
  it('раскладывает фразу на слова и буквы по порядку', () => {
    expect(charsOf('Да, так.')).toEqual([
      ['Д', 'а', ','],
      ['т', 'а', 'к', '.'],
    ]);
  });

  it('буквы короткой фразы идут с шагом в 55 мс', () => {
    expect(LETTER_STEP_MS).toBe(55);
    expect(delaysOf('Она')).toEqual([[0, 55, 110]]);
  });

  it('очередь продолжается из слова в слово, пробел в ней места не занимает', () => {
    expect(delaysOf('а бв')).toEqual([[0], [55, 110]]);
  });

  it('несколько пробелов подряд не дают пустых слов', () => {
    expect(charsOf(' а  б ')).toEqual([['а'], ['б']]);
  });

  it('длинная фраза укладывает всю очередь в предел', () => {
    // 121 буква: шаг 55 мс дал бы 6600 мс, предел сжимает шаг до 20 мс
    const letters = toRevealWords('а'.repeat(121))[0]?.letters;

    expect(MAX_SPREAD_MS).toBe(2400);
    expect(letters?.[1]?.delayMs).toBe(20);
    expect(letters?.at(-1)?.delayMs).toBe(2400);
  });

  it('пустая строка даёт пустой список', () => {
    expect(toRevealWords('')).toEqual([]);
  });

  it('одна буква стартует без задержки', () => {
    expect(toRevealWords('я')).toEqual([{ letters: [{ char: 'я', delayMs: 0 }] }]);
  });
});
