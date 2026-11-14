import { NIGHT_PHRASES } from '../../model/night-script';

/*
 * Таймлайн ночной сцены: всё, что видно на экране, — чистая функция от u, числа экранов, пройденных от начала сцены.
 * Поэтому скролл назад работает сам собой. Кадры — Раскадровка.md, Н1–Н9.
 */

/** Индекс состояния туши «дымка»; фигуры — 1…4 в порядке появления (медведица, плуг, колесница, процессия). */
export const HAZE = 0;
export const FIGURE_COUNT = 4;
/** Длина сцены и хвост после неё, в экранах: в хвосте последний кадр стоит (дальше будет 転). */
export const NIGHT_SCREENS = 6.5;
export const TRACK_SCREENS = 7;
/**
 * Ночная сцена проступает в самом конце 起: к этому моменту вуаль сумерек уже закрыла весь лист
 * (VEIL_END в lib/clouds/timeline.ts = 2,88 экрана из 3), а капли дня уже сели на звёзды (lib/sky-landing.ts): ночь рисует на их местах такие же капли.
 */
const DAY_TO_NIGHT_SCREENS = 0.12;
/**
 * За экран до начала сцена уже считает камеру и места звёзд: на них садятся капли дня (lib/sky-landing.ts),
 * хотя самой ночи ещё не видно.
 */
const PREPARE_SCREENS = 1;
/** Пыль вылетает из севших капель, как только ночь почти проступила: паузы между посадкой и дымкой нет. */
const INK_OUT_START = -0.04;
/** Фразы проступают и уходят за 0,1 экрана. */
export const PHRASE_FADE_SCREENS = 0.1;
/** С этого экрана зрителю можно провести своё созвездие (Н9), до конца сцены. */
export const DRAWING_START = 5.4;

interface Transition {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
}

/** Вихри: дымка → медведица → плуг → колесница → процессия → дымка. Вихрь занимает начало кадра, потом фигура стоит. */
const VORTEX_SCREENS = 0.35;
const FIRST_TRANSITION: Transition = { from: HAZE, to: 1, start: 0.8, duration: VORTEX_SCREENS };
const TRANSITIONS: readonly Transition[] = [
  FIRST_TRANSITION,
  { from: 1, to: 2, start: 1.6, duration: VORTEX_SCREENS },
  { from: 2, to: 3, start: 2.4, duration: VORTEX_SCREENS },
  { from: 3, to: 4, start: 3.2, duration: VORTEX_SCREENS },
  // Н6: фигура распадается в дымку, последние 0,2 экрана кадра — пауза
  { from: 4, to: HAZE, start: 4.0, duration: 0.3 },
];

/** Привычный контур ковша (Н8): проступает и гаснет. */
const OUTLINE_WINDOW = { from: 5.0, to: 5.4, fade: 0.12 } as const;

export interface NightFrame {
  /** Непрозрачность всей сцены (переход от дня к ночи). */
  readonly stage: number;
  /** Сцена ещё не видна, но уже отдаёт места звёзд каплям дня. */
  readonly isPreparing: boolean;
  readonly backgroundStars: number;
  readonly dipperStars: number;
  /** Гравюры на небе: проступают в Н1 вслед за звёздами и больше не уходят. */
  readonly sky: number;
  /**
   * Пыль вылетела: севшие на ковш капли рассыпаются в дымку (ink-sim.ts). Скролл только запускает вылет —
   * сам он идёт по времени (scene.ts), как смена фигур.
   */
  readonly isInkOut: boolean;
  /**
   * Какая фигура (состояние туши) сейчас должна стоять. Сама смена идёт по времени (ink-sim.ts):
   * скролл только выбирает цель, поэтому быстрое колесо не проматывает вихрь за доли секунды.
   */
  readonly figure: number;
  readonly outline: number;
  /** Приглашение: тусклые звёзды рядом с ковшом разгораются (Н9). */
  readonly invite: number;
  readonly phrases: readonly number[];
  readonly isDrawing: boolean;
}

/** Линейный подъём 0→1 на отрезке [a, b], с обрезкой. */
export function ramp(u: number, a: number, b: number): number {
  if (b <= a) return u >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (u - a) / (b - a)));
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

interface Window {
  readonly from: number;
  readonly to: number;
  readonly fade: number;
}

/** Окно: проступает за fade от начала, уходит за fade до конца. */
export function windowOpacity(u: number, w: Window): number {
  return Math.min(ramp(u, w.from, w.from + w.fade), 1 - ramp(u, w.to - w.fade, w.to));
}

function figureAt(u: number): number {
  return TRANSITIONS.findLast((tr) => tr.start <= u)?.to ?? FIRST_TRANSITION.from;
}

export function frameAt(u: number): NightFrame {
  return {
    stage: smooth(ramp(u, -DAY_TO_NIGHT_SCREENS, 0)),
    isPreparing: u > -PREPARE_SCREENS && u <= -DAY_TO_NIGHT_SCREENS,
    // Н1: сначала фоновые звёзды, потом семь ярких, потом гравюры на небе (вход по smoothstep без скачка)
    backgroundStars: smooth(ramp(u, 0, 0.45)),
    dipperStars: smooth(ramp(u, 0.15, 0.55)),
    sky: ramp(u, 0.3, 0.8),
    isInkOut: u >= INK_OUT_START,
    figure: figureAt(u),
    outline: windowOpacity(u, OUTLINE_WINDOW),
    invite: ramp(u, DRAWING_START, DRAWING_START + 0.2),
    phrases: NIGHT_PHRASES.map((p) =>
      windowOpacity(u, { from: p.from, to: p.to, fade: PHRASE_FADE_SCREENS }),
    ),
    isDrawing: u >= DRAWING_START,
  };
}
