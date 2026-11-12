import { CLOUDS_PHRASES } from '../../model/clouds-script';

/** Длина сцены «Облака» (起) — 3 экрана скролла (Раскадровка.md). */
export const CLOUDS_SCREENS = 3.0;
/** Фразы проступают и уходят за 0,1 экрана (Раскадровка.md). */
export const PHRASE_FADE_SCREENS = 0.1;

/** Вуаль сумерек (О6): пунктир опускается по листу между этими экранами (lib/clouds/dusk-veil.ts). */
export const VEIL_START = 2.2;
export const VEIL_END = 2.88;

export interface CloudsFrame {
  readonly u: number;
  /** Непрозрачность всей закреплённой сцены. */
  readonly stage: number;
  /**
   * О1 (0–0,5 экрана): увеличение и уход слова UNTESIS в чашу буквы U.
   * Масштаб растёт от 1 до 8+, непрозрачность падает от 1 до 0.
   */
  readonly wordmarkScale: number;
  readonly wordmarkOpacity: number;
  /** Высота камеры на подъёме сквозь эшелоны облаков (0..2.95), см. projectCloud. */
  readonly zCam: number;
  /** Видимость облаков (проступают после влёта в чашу буквы U в О2, уходят к концу О6). */
  readonly cloudsVisibility: number;
  /** Видимость капель туши: проступают вместе с облаками. */
  readonly dropsVisibility: number;
  /** Доля капель в кадре: в О2–О3 их горсть, к О5 поднимаются все. */
  readonly dropsFraction: number;
  /** Скорость всплытия капель без скролла, 0…1: растёт в О4–О5 и гаснет под вуалью (капли повисают дымкой). */
  readonly rise: number;
  /** Ход вуали сумерек: 0 — день, 1 — весь лист в негативе (ночь). */
  readonly veil: number;
  /** Непрозрачность каждой из 4 фраз. */
  readonly phrases: readonly number[];
}

/** Линейный подъём 0→1 на отрезке [a, b], с обрезкой. */
export function ramp(u: number, a: number, b: number): number {
  if (b <= a) return u >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (u - a) / (b - a)));
}

interface Window {
  readonly from: number;
  readonly to: number;
  readonly fade: number;
}

/** Окно видимости фразы: проступает за fade, держится, уходит за fade. */
export function windowOpacity(u: number, w: Window): number {
  return Math.min(ramp(u, w.from, w.from + w.fade), 1 - ramp(u, w.to - w.fade, w.to));
}

function computeStageOpacity(u: number): number {
  if (u <= 0 || u > CLOUDS_SCREENS + 0.1) return 0;
  return 1;
}

/** Считает кадр сцены «Облака» по скроллу u (числу пройденных экранов сцены). */
export function frameAt(u: number): CloudsFrame {
  const stage = computeStageOpacity(u);

  // О1: 0–0,5 экрана. Слово увеличивается и рассыпается, камера влетает в чашу буквы U
  const wordmarkP = ramp(u, 0, 0.5);
  const wordmarkScale = 1.0 + Math.pow(wordmarkP, 2.2) * 15.0;
  const wordmarkOpacity = 1.0 - ramp(u, 0.22, 0.5);

  // Камера поднимается сквозь эшелоны облаков от z=0 до z=2.95
  const zCam = ramp(u, 0.45, 3.0) * 2.95;

  // Облака проявляются после влёта в чашу буквы U (О2) и уходят к приходу ночной сцены
  const cloudsVisibility = ramp(u, 0.35, 0.65) * (1 - ramp(u, 2.72, 2.9));

  // Капли: горсть с появлением облаков, с О4 (1,3 экрана) их всё больше и они всплывают быстрее
  const dropsVisibility = ramp(u, 0.45, 0.8);
  const rainUp = ramp(u, 1.25, 2.1);
  const dropsFraction = 0.3 + 0.7 * rainUp;

  // О6: вуаль сумерек; под ней капли замедляются и повисают
  const veil = ramp(u, VEIL_START, VEIL_END);
  const rise = (0.35 + 0.65 * rainUp) * (1 - 0.8 * veil);

  // Фразы О2–О5
  const phrases = CLOUDS_PHRASES.map((phrase) =>
    windowOpacity(u, { from: phrase.start, to: phrase.end, fade: PHRASE_FADE_SCREENS }),
  );

  return {
    u,
    stage,
    wordmarkScale,
    wordmarkOpacity,
    zCam,
    cloudsVisibility,
    dropsVisibility,
    dropsFraction,
    rise,
    veil,
    phrases,
  };
}
