/*
 * Проявление фразы буква за буквой, слева направо: каждая буква поднимается снизу и выходит из расфокуса
 * (приём с мудборда, Figma 22:15). Здесь только расчёт очереди: фраза раскладывается на слова и буквы,
 * каждая буква получает свою задержку. Сам переход — в landing.css (.phrase-letter).
 */

/** Задержка между соседними буквами. */
export const LETTER_STEP_MS = 55;
/** Последняя буква длинной фразы стартует не позже этого: иначе фраза проявляется дольше, чем её читают. */
export const MAX_SPREAD_MS = 2400;

export interface RevealLetter {
  readonly char: string;
  /** Задержка старта проявления; пробелы в очереди не считаются. */
  readonly delayMs: number;
}

/** Слово не рвётся при переносе строки: его буквы — отдельные блоки, и без обёртки строка сломалась бы посреди слова. */
export interface RevealWord {
  readonly letters: readonly RevealLetter[];
}

/**
 * Раскладывает фразу на слова и буквы с задержками: шаг LETTER_STEP_MS, но вся очередь не длиннее MAX_SPREAD_MS.
 * Слова разделяются пробелами; между словами в разметке остаётся один обычный пробел.
 */
export function toRevealWords(text: string): readonly RevealWord[] {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const letterCount = words.reduce((sum, word) => sum + Array.from(word).length, 0);
  const stepMs = Math.min(LETTER_STEP_MS, MAX_SPREAD_MS / Math.max(1, letterCount - 1));
  return words.map((word, wordIndex) => {
    const lettersBefore = words.slice(0, wordIndex).reduce((sum, prev) => sum + Array.from(prev).length, 0);
    return {
      letters: Array.from(word).map((char, index) => ({
        char,
        delayMs: Math.round((lettersBefore + index) * stepMs),
      })),
    };
  });
}
