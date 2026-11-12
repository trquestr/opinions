import { CLOUDS_PHRASES } from './clouds-script';
import { NIGHT_PHRASES } from './night-script';

/**
 * Отступ от конца окна фразы до точки остановки, в экранах. Равен двум затуханиям фразы
 * (PHRASE_FADE_SCREENS = 0.1 в lib/clouds/timeline.ts и lib/night/timeline.ts): в этот момент фраза
 * и картинка уже полностью показаны и ещё не начали уходить. Константа объявлена здесь, а не
 * импортирована, чтобы не создавать цикл model → lib → model.
 */
const STOP_MARGIN_SCREENS = 0.2;

/** Допуск (px), в пределах которого две остановки считаются одной. */
const DEDUPE_EPSILON_PX = 0.5;

export interface StopSection {
  /** Абсолютная позиция верха секции на странице, px. */
  readonly topPx: number;
  /** Остановки внутри секции, в экранах от её верха. */
  readonly stops: readonly number[];
}

export interface PageStopsInput {
  readonly sections: readonly StopSection[];
  readonly viewportHeightPx: number;
  readonly maxScrollPx: number;
}

/** Остановка (в экранах от верха секции) для фразы, окно которой заканчивается в `end`. */
export function stopOfWindow(end: number): number {
  return end - STOP_MARGIN_SCREENS;
}

/** Остановки сцены облаков, экраны от верха секции. */
export const CLOUDS_STOPS: readonly number[] = CLOUDS_PHRASES.map((phrase) => stopOfWindow(phrase.end));

/** Остановки ночной сцены, экраны от верха секции. */
export const NIGHT_STOPS: readonly number[] = NIGHT_PHRASES.map((phrase) => stopOfWindow(phrase.to));

/**
 * Абсолютные позиции остановок страницы в px: начало страницы, остановки всех секций и конец страницы.
 * Отсортированы, без дублей, ограничены диапазоном [0, maxScrollPx].
 */
export function pageStops(input: PageStopsInput): number[] {
  const { sections, viewportHeightPx, maxScrollPx } = input;
  const max = Math.max(0, maxScrollPx);
  const raw = [0, max];
  for (const section of sections) {
    for (const stop of section.stops) {
      raw.push(section.topPx + stop * viewportHeightPx);
    }
  }
  const sorted = raw.map((px) => Math.min(max, Math.max(0, px))).sort((a, b) => a - b);
  return sorted.filter((px, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || px - previous > DEDUPE_EPSILON_PX;
  });
}
