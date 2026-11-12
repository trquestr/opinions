import { NIGHT_PHRASES } from '../../model/night-script';
import manifest from './night-manifest.json';
import type { Bounds, Layout, Point, Size } from './layout';

/*
 * Камера ночной сцены (решено владельцем 2026-11-11): на смене фигур Н2–Н5 камера едет так, что фигура встаёт
 * в левую или правую треть экрана, а напротив неё — текст. В Н1 и с Н6 — общий план по центру.
 * Мир при этом не меняется: семь звёзд неподвижны относительно мира и едут на экране только вместе с камерой.
 *
 * Кадр фигуры: масштаб s = min(0.56·W / w_f, 0.66·H / h_f) по рамке фигуры (w_f × h_f, единицы ковша),
 * центр рамки — в точке опоры A = (0.34·W или 0.66·W, 0.47·H). У общего плана опора — центр экрана.
 *
 * Ход камеры за CAMERA_MS, τ ∈ [0, 1], e = τ²(3 − 2τ):
 *   основа  — линейная смесь кадров: O = mix(O₀, O₁, e), s = mix(s₀, s₁, e), опора A = mix(A₀, A₁, e);
 *   дуга    — посреди хода камера отъезжает и снова наезжает: k_arc = 1 − 0.14·sin(πe)
 *             (на середине видно на 14% больше — галактику смены целиком, как отъезд объектива);
 *   стоянка — после прихода медленный наезд, как на долгом плане: k_hold = 1 + 0.035·smoothstep(0, 1, t_hold / 8 с);
 *   итог    — масштаб вокруг опоры: s' = s·k, O' = A + (O − A)·k, k = k_arc·k_hold.
 * Новая цель посреди хода — новый ход начинается с текущего кадра (вместе с дугой и наездом) — без рывка.
 * Сбоку текст помещается только на широком экране (SIDE_LAYOUT_QUERY); на узком камера всегда в общем плане.
 */
export const SIDE_LAYOUT_QUERY = '(min-aspect-ratio: 6/5)';
export const CAMERA_MS = 3200;
const FIGURE_WIDTH_SHARE = 0.56;
const FIGURE_HEIGHT_SHARE = 0.66;
const FIGURE_CENTER_Y = 0.47;
const SIDE_CENTER_X = { left: 0.34, right: 0.66 } as const;
const ARC_PULL_BACK = 0.14;
const HOLD_PUSH_IN = 0.035;
const HOLD_MS = 8000;

export type Side = keyof typeof SIDE_CENTER_X;

/** Кадр камеры: где ковш на экране и в каком масштабе, ключ цели и точка, вокруг которой камера наезжает. */
export interface Shot {
  readonly frame: Layout;
  readonly key: number;
  readonly anchor: Point;
}

/** Сторона экрана, где стоит фигура состояния туши: напротив текста её фразы. null — фигуры нет (общий план). */
export function figureSide(state: number): Side | null {
  const phrase = NIGHT_PHRASES.find((p) => p.figure === state);
  if (!phrase?.side) return null;
  return phrase.side === 'left' ? 'right' : 'left';
}

/** Рамка фигуры состояния туши (1…4) или null. */
export function figureBounds(state: number): Bounds | null {
  return manifest.figureBounds[state - 1] ?? null;
}

/** Точка опоры кадра фигуры: центр её рамки на экране. */
export function figureAnchor(view: Size, side: Side): Point {
  return { x: view.width * SIDE_CENTER_X[side], y: view.height * FIGURE_CENTER_Y };
}

export function figureFrame(view: Size, bounds: Bounds, side: Side): Layout {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min((view.width * FIGURE_WIDTH_SHARE) / width, (view.height * FIGURE_HEIGHT_SHARE) / height);
  const anchor = figureAnchor(view, side);
  return {
    scale,
    originX: anchor.x - (bounds.minX + width / 2) * scale,
    originY: anchor.y - (bounds.minY + height / 2) * scale,
  };
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Кадр и опора — то, что смешивается при ходе. Мутируемые поля: объекты живут всю сцену. */
interface Pose {
  originX: number;
  originY: number;
  scale: number;
  anchorX: number;
  anchorY: number;
}

function setPose(target: Pose, shot: Shot): void {
  target.originX = shot.frame.originX;
  target.originY = shot.frame.originY;
  target.scale = shot.frame.scale;
  target.anchorX = shot.anchor.x;
  target.anchorY = shot.anchor.y;
}

export class Camera {
  /** Текущий кадр. Один объект на всю сцену, меняется на месте (без аллокаций в rAF). */
  readonly current = { originX: 0, originY: 0, scale: 1 };
  private readonly from: Pose = { originX: 0, originY: 0, scale: 1, anchorX: 0, anchorY: 0 };
  private readonly to: Pose = { originX: 0, originY: 0, scale: 1, anchorX: 0, anchorY: 0 };
  /** Опора текущего кадра — нужна, чтобы новый ход начался ровно оттуда, где камера сейчас. */
  private anchorX = 0;
  private anchorY = 0;
  private startMs = -Infinity;
  private aimKey: number | null = null;

  /** Сразу встать в кадр без хода (первый кадр, ресайз, без анимации). */
  snap(shot: Shot): void {
    setPose(this.to, shot);
    setPose(this.from, shot);
    this.aimKey = shot.key;
    this.startMs = -Infinity;
    this.apply(1, 1 + HOLD_PUSH_IN);
  }

  /** Новая цель: ход от текущего кадра. Та же цель — ничего не делает; самая первая — встать сразу. */
  aim(shot: Shot, nowMs: number): void {
    if (shot.key === this.aimKey) return;
    if (this.aimKey === null) {
      this.snap(shot);
      return;
    }
    const { from, current } = this;
    from.originX = current.originX;
    from.originY = current.originY;
    from.scale = current.scale;
    from.anchorX = this.anchorX;
    from.anchorY = this.anchorY;
    setPose(this.to, shot);
    this.aimKey = shot.key;
    this.startMs = nowMs;
  }

  /** Доля пройденного хода к текущей цели, 0…1 (1 — камера пришла). */
  progress(nowMs: number): number {
    return Math.min(1, Math.max(0, (nowMs - this.startMs) / CAMERA_MS));
  }

  /** Двигает камеру; возвращает, меняется ли кадр (ход или медленный наезд на стоянке). */
  update(nowMs: number): boolean {
    const e = smoothstep(this.progress(nowMs));
    const holdMs = nowMs - this.startMs - CAMERA_MS;
    const arc = 1 - ARC_PULL_BACK * Math.sin(Math.PI * e);
    const hold = holdMs > 0 ? 1 + HOLD_PUSH_IN * smoothstep(holdMs / HOLD_MS) : 1;
    this.apply(e, arc * hold);
    return e < 1 || holdMs < HOLD_MS;
  }

  /** Смесь кадров с долей e и масштабирование вокруг опоры в k раз. */
  private apply(e: number, k: number): void {
    const { from, to, current } = this;
    this.anchorX = lerp(from.anchorX, to.anchorX, e);
    this.anchorY = lerp(from.anchorY, to.anchorY, e);
    current.scale = lerp(from.scale, to.scale, e) * k;
    current.originX = this.anchorX + (lerp(from.originX, to.originX, e) - this.anchorX) * k;
    current.originY = this.anchorY + (lerp(from.originY, to.originY, e) - this.anchorY) * k;
  }
}
