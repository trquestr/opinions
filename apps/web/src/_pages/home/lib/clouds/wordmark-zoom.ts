/**
 * Геометрия вордмарка UNTESIS и расчёт трансформации влёта в чашу буквы U (Раскадровка.md, О1).
 * Формулы согласованы с buildWordAndDrops() в apps/web/public/js/landing.js.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface UZoomTransform {
  readonly transform: string;
  readonly origin: string;
  readonly opacity: number;
  readonly isVisible: boolean;
}

export interface WordmarkCameraZoom {
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly opacity: number;
  readonly isVisible: boolean;
}

declare global {
  interface Window {
    __setWordmarkCameraZoom?: (params: WordmarkCameraZoom) => void;
    __pendingWordmarkZoom?: WordmarkCameraZoom | null;
  }
}

interface LetterSpec {
  readonly ch: string;
  readonly w: number;
}

const LETTER_SPECS: readonly LetterSpec[] = [
  { ch: 'U', w: 0.82 },
  { ch: 'N', w: 0.38 },
  { ch: 'T', w: 0.48 },
  { ch: 'E', w: 0.36 },
  { ch: 'S', w: 0.46 },
  { ch: 'I', w: 0.12 },
  { ch: 'S', w: 0.46 },
];

const PAIR_KERN: Record<string, number> = {
  UN: -0.04,
  NT: -0.05,
  TE: -0.05,
  ES: -0.02,
  SI: -0.03,
  IS: -0.03,
};

/**
 * Считает высоту H и общую ширину totalW вордмарка в пикселях
 * в точности по формулам landing.js (line 314-349).
 */
function computeWordmarkMetrics(width: number, height: number): { h: number; totalW: number } {
  const h = Math.max(1, Math.min(width * 0.11, (width - 40) / 5.9, height * 0.26, 130));
  const tracking = h * 0.46;

  let totalW = 0;
  for (let i = 0; i < LETTER_SPECS.length; i++) {
    const spec = LETTER_SPECS[i];
    if (!spec) continue;
    totalW += spec.w * h;
    if (i < LETTER_SPECS.length - 1) {
      const nextSpec = LETTER_SPECS[i + 1];
      const pair = nextSpec ? `${spec.ch}${nextSpec.ch}` : '';
      const kernFraction = PAIR_KERN[pair] ?? 0;
      totalW += tracking + kernFraction * h;
    }
  }

  return { h, totalW };
}

/**
 * Координаты (x, y) центра чаши буквы U на экране (в пикселях).
 * Чаша буквы U — сосуд и первая рифма к ковшу Большой Медведицы.
 */
export function computeUBowlCenter(width: number, height: number): Point2D {
  const { h, totalW } = computeWordmarkMetrics(width, height);
  const curX = (width - totalW) * 0.5;
  const topY = (height - h) * 0.5;

  // Буква U: ширина 0.82 * H, центр чаши — 0.41 * H от левого края, вертикально — 0.45 * H от верха
  const uWidth = (LETTER_SPECS[0]?.w ?? 0.82) * h;
  const uX = curX + uWidth * 0.5;
  const uY = topY + h * 0.45;

  return { x: uX, y: uY };
}

export interface UZoomParams {
  readonly u: number;
  readonly scale: number;
  readonly opacity: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Вычисляет нативные параметры камеры для WebGL-шейдера вордмарка.
 * Шейдер рендерит аналитический SDF буквы U на нативном разрешении экрана (1:1),
 * поэтому даже при 16-кратном приближении края остаются абсолютно векторно-чёткими
 * без малейшего размытия и пикселизации.
 */
export function computeWordmarkCameraZoom(params: UZoomParams): WordmarkCameraZoom {
  const { u, scale, opacity, width, height } = params;

  if (u > 0.55 || opacity <= 0.001) {
    return {
      scale: 1,
      originX: 0,
      originY: 0,
      translateX: 0,
      translateY: 0,
      opacity: 0,
      isVisible: false,
    };
  }

  const bowl = computeUBowlCenter(width, height);
  const p = Math.min(1, Math.max(0, u / 0.5));
  const tx = (width * 0.5 - bowl.x) * p;
  const ty = (height * 0.5 - bowl.y) * p;

  return {
    scale,
    originX: bowl.x,
    originY: bowl.y,
    translateX: tx,
    translateY: ty,
    opacity,
    isVisible: true,
  };
}

/**
 * Вычисляет CSS transform и transform-origin для слоя героя (дрейфующие облака пролога).
 */
export function computeUZoomTransform(params: UZoomParams): UZoomTransform {
  const { u, scale, opacity, width, height } = params;

  if (u > 0.55 || opacity <= 0.001) {
    return {
      transform: 'none',
      origin: '50% 50%',
      opacity: 0,
      isVisible: false,
    };
  }

  const bowl = computeUBowlCenter(width, height);
  const p = Math.min(1, Math.max(0, u / 0.5));
  const tx = (width * 0.5 - bowl.x) * p;
  const ty = (height * 0.5 - bowl.y) * p;

  return {
    transform: `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(2)})`,
    origin: `${bowl.x.toFixed(1)}px ${bowl.y.toFixed(1)}px`,
    opacity,
    isVisible: true,
  };
}
