/**
 * Плавный инерционный скролл (smooth momentum scrolling) для страницы.
 * Превращает ступенчатые щелчки колёсика мыши в шелковистое ускорение и мягкое замедление с инерцией.
 */

export interface SmoothScrollOptions {
  /** Коэффициент затухания инерции (1/с). Меньше = дольше катится по инерции. */
  readonly damping?: number;
  /** Чувствительность к колёсику мыши. */
  readonly multiplier?: number;
}

const DEFAULT_DAMPING = 8.5;
const DEFAULT_MULTIPLIER = 1.0;

function isInsideScrollable(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function normalizeDelta(e: WheelEvent): number {
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dy *= 24;
  } else if (e.deltaMode === 2) {
    dy *= window.innerHeight;
  }
  return dy;
}

function shouldSkipSmoothScroll(): boolean {
  if (typeof window === 'undefined') return true;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isTouch || isReduced;
}

class SmoothScroller {
  private targetY = 0;
  private currentY = 0;
  private isRunning = false;
  private lastTime = 0;
  private rafId = 0;
  private readonly damping: number;
  private readonly multiplier: number;

  constructor(options: SmoothScrollOptions) {
    this.damping = options.damping ?? DEFAULT_DAMPING;
    this.multiplier = options.multiplier ?? DEFAULT_MULTIPLIER;
    this.targetY = window.scrollY || window.pageYOffset || 0;
    this.currentY = this.targetY;
  }

  start(): () => void {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    return () => this.dispose();
  }

  private readonly step = (now: number): void => {
    if (!this.isRunning) return;
    const dt = Math.min(0.08, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const diff = this.targetY - this.currentY;
    if (Math.abs(diff) < 0.4) {
      this.currentY = this.targetY;
      window.scrollTo(0, this.currentY);
      this.isRunning = false;
      return;
    }

    const factor = 1 - Math.exp(-this.damping * dt);
    this.currentY += diff * factor;
    window.scrollTo(0, this.currentY);
    this.rafId = requestAnimationFrame(this.step);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey || e.metaKey || isInsideScrollable(e.target)) return;
    e.preventDefault();

    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const dy = normalizeDelta(e) * this.multiplier;
    this.targetY = Math.max(0, Math.min(maxScroll, this.targetY + dy));

    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.step);
    }
  };

  private readonly onScroll = (): void => {
    if (!this.isRunning) {
      this.targetY = window.scrollY || window.pageYOffset || 0;
      this.currentY = this.targetY;
    }
  };

  private readonly onTouchStart = (): void => {
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    this.targetY = window.scrollY || window.pageYOffset || 0;
    this.currentY = this.targetY;
  };

  private dispose(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('touchstart', this.onTouchStart);
  }
}

export function startSmoothScroll(options: SmoothScrollOptions = {}): () => void {
  if (shouldSkipSmoothScroll()) return () => {};
  const scroller = new SmoothScroller(options);
  return scroller.start();
}
