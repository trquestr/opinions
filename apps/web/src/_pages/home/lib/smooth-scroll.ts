/**
 * Ступенчатый скролл колёсиком: один щелчок проигрывает целый «шаг сцены» — страница сама, по времени,
 * доезжает до следующей остановки (позиции, где фраза и картинка полностью показаны).
 */

export interface SmoothScrollOptions {
  /** Абсолютные позиции остановок (px), отсортированные по возрастанию. Читается в момент каждого шага. */
  readonly getStops: () => readonly number[];
}

type Direction = 1 | -1;

/** Длительность шага на один экран пути, мс. */
const MS_PER_SCREEN = 2200;
/** Короткий шаг не должен быть рывком. */
const MIN_STEP_MS = 900;
/** Длинный шаг не должен тянуться бесконечно. */
const MAX_STEP_MS = 2400;
/** Остановка ближе этого расстояния (px) считается той, на которой мы уже стоим. */
const STOP_EPSILON_PX = 2;
/**
 * Тишина (мс) без колёсных событий в том же направлении, после которой новый щелчок снова запускает шаг.
 * Пока тишины нет, это хвост инерции тачпада — его глотаем, иначе один жест прокрутит несколько шагов.
 */
const GESTURE_GAP_MS = 160;

function isInsideScrollable(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function shouldSkipSmoothScroll(): boolean {
  if (typeof window === 'undefined') return true;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isTouch || isReduced;
}

/** События, которые остаются родными: зум, нулевая дельта, прокручиваемый блок под курсором. */
function isNativeWheel(e: WheelEvent): boolean {
  return e.ctrlKey || e.metaKey || e.deltaY === 0 || isInsideScrollable(e.target);
}

/**
 * Ближайшая остановка строго за `fromPx` (дальше чем на 2 px) в заданном направлении или null.
 */
export function nextStop(stops: readonly number[], fromPx: number, direction: Direction): number | null {
  let best: number | null = null;
  for (const stop of stops) {
    const delta = (stop - fromPx) * direction;
    if (delta <= STOP_EPSILON_PX) continue;
    if (best === null || delta < (best - fromPx) * direction) best = stop;
  }
  return best;
}

/** Длительность шага: пропорциональна пути, но в пределах [MIN_STEP_MS, MAX_STEP_MS]. */
export function stepDurationMs(distancePx: number, viewportHeightPx: number): number {
  const raw = (distancePx / Math.max(1, viewportHeightPx)) * MS_PER_SCREEN;
  return Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, raw));
}

/** easeInOutSine: 0.5 − 0.5·cos(π·p), мягкий разгон и торможение. */
function ease(progress: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * progress);
}

class StepScroller {
  private isAnimating = false;
  private direction: Direction = 1;
  private fromPx = 0;
  private toPx = 0;
  private startedAt = 0;
  private durationMs = 0;
  private rafId = 0;
  private lastWheelAt = Number.NEGATIVE_INFINITY;
  private lastWheelDirection: Direction = 1;

  constructor(private readonly getStops: () => readonly number[]) {}

  start(): () => void {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    return () => this.dispose();
  }

  private beginStep(toPx: number, direction: Direction): void {
    this.fromPx = window.scrollY;
    this.toPx = toPx;
    this.direction = direction;
    this.startedAt = performance.now();
    this.durationMs = stepDurationMs(Math.abs(toPx - this.fromPx), window.innerHeight);
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.rafId = requestAnimationFrame(this.frame);
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.isAnimating) return;
    const progress = Math.min(1, Math.max(0, (now - this.startedAt) / this.durationMs));
    if (progress >= 1) {
      window.scrollTo(0, this.toPx);
      this.isAnimating = false;
      return;
    }
    window.scrollTo(0, this.fromPx + (this.toPx - this.fromPx) * ease(progress));
    this.rafId = requestAnimationFrame(this.frame);
  };

  /** Хвост жеста: то же направление и ещё не было тишины. */
  private isGestureTail(direction: Direction, now: number): boolean {
    return direction === this.lastWheelDirection && now - this.lastWheelAt < GESTURE_GAP_MS;
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (isNativeWheel(e)) return;
    const direction: Direction = e.deltaY > 0 ? 1 : -1;
    const now = performance.now();
    const target = nextStop(this.getStops(), window.scrollY, direction);
    if (target === null && !this.isAnimating) return;
    e.preventDefault();

    const isSwallowed = this.isAnimating ? direction === this.direction : this.isGestureTail(direction, now);
    const shouldStep = target !== null && !isSwallowed;
    this.lastWheelAt = now;
    this.lastWheelDirection = direction;
    if (shouldStep) this.beginStep(target, direction);
  };

  private readonly onTouchStart = (): void => {
    this.isAnimating = false;
    cancelAnimationFrame(this.rafId);
  };

  private dispose(): void {
    this.isAnimating = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('touchstart', this.onTouchStart);
  }
}

/** Включает ступенчатый скролл колёсиком; возвращает функцию отписки. */
export function startSmoothScroll(options: SmoothScrollOptions): () => void {
  if (shouldSkipSmoothScroll()) return () => {};
  return new StepScroller(options.getStops).start();
}
