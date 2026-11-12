import { CLOUDS_PHRASES } from '../../model/clouds-script';

/** Длина сцены «Облака» (起) — 3 экрана скролла (Раскадровка.md). */
export const CLOUDS_SCREENS = 3.0;
/** Фразы проступают и уходят за 0,1 экрана (Раскадровка.md). */
export const PHRASE_FADE_SCREENS = 0.1;

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
  /** Положение камеры по глубине Z для 3D-пролёта сквозь облака (0..2.95). */
  readonly zCam: number;
  /** Видимость 3D-облаков (проступают после влёта в чашу буквы U в О2, уходят к О6). */
  readonly cloudsVisibility: number;
  /**
   * О2–О6: Вертикальный параллакс облаков (камера поднимается вверх, облака опускаются).
   * Дальняя гряда движется медленно, ближние облака — быстрее.
   */
  readonly farRidgeY: number;
  readonly farRidgeOpacity: number;
  readonly nearCloudsY: number;
  readonly nearCloudsOpacity: number;
  /**
   * О4–О5 (1,3–2,3 экрана): дождь капель туши идёт вверх.
   * Интенсивность скорости и доля активных капель.
   */
  readonly rainUpIntensity: number;
  readonly rainCountFraction: number;
  /**
   * О6 (2,3–3,0 экрана): смена дня на ночь.
   * bgDarkness: 0 (белый лист) → 1 (#0b0b0d). Дальняя гряда уходит до 2.6, потемнение идёт 2.5→3.0.
   * inkLightness: 0 (чёрная тушь) → 1 (светлая тушь ночи).
   * hazeBlend: 0 (вертикальный полёт) → 1 (замедление в ночную дымку).
   */
  readonly bgDarkness: number;
  readonly inkLightness: number;
  readonly hazeBlend: number;
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

  // Камера летит сквозь 3D-эшелоны облаков от z=0 до z=2.95
  const zCam = ramp(u, 0.45, 3.0) * 2.95;

  // 3D-облака проявляются после влёта в чашу буквы U (О2: 0.35..0.65) и рассеиваются к ночи (2.65..2.95)
  const cloudsEnter = ramp(u, 0.35, 0.65);
  const cloudsExit = 1 - ramp(u, 2.65, 2.95);
  const cloudsVisibility = cloudsEnter * cloudsExit;

  // О2–О6: Облака.
  // Дальняя гряда: входит на 0.4..0.9, уходит вниз до начала потемнения (к u = 2.5..2.6)
  const farEnter = ramp(u, 0.35, 0.7);
  const farExit = 1 - ramp(u, 2.3, 2.55);
  const farRidgeOpacity = Math.min(farEnter, farExit);
  // Параллакс: смещение по Y (в долях экрана)
  const farRidgeY = (u - 0.5) * 0.28;

  // Ближние облака: входят быстрее, уходят на u = 2.4..2.8
  const nearEnter = ramp(u, 0.45, 0.85);
  const nearExit = 1 - ramp(u, 2.45, 2.85);
  const nearCloudsOpacity = Math.min(nearEnter, nearExit);
  const nearCloudsY = (u - 0.5) * 0.65;

  // О4–О5: Дождь капель вверх (1.3–2.3 экрана)
  const rainStart = ramp(u, 1.25, 1.5);
  const rainEnd = 1 - ramp(u, 2.3, 2.7);
  const rainUpIntensity = Math.min(rainStart, rainEnd);
  // В О5 (1.8..2.3) капель больше: 0.5 в О4, до 1.0 в О5
  const rainCountFraction = ramp(u, 1.25, 1.9);

  // О6: Смена дня на ночь (2.3–3.0 экрана)
  // Потемнение фона: с 2.5 до 3.0 экрана
  const bgDarkness = ramp(u, 2.45, 3.0);
  const inkLightness = ramp(u, 2.45, 3.0);
  // Замедление капель в ночную дымку: с 2.4 до 3.0
  const hazeBlend = ramp(u, 2.4, 3.0);

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
    farRidgeY,
    farRidgeOpacity,
    nearCloudsY,
    nearCloudsOpacity,
    rainUpIntensity,
    rainCountFraction,
    bgDarkness,
    inkLightness,
    hazeBlend,
    phrases,
  };
}
