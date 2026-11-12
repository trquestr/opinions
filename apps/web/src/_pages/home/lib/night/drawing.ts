import { unitsToPx } from './layout';
import { DRAWABLE_STARS } from './stars';
import type { Layout, Point } from './layout';

/*
 * Рисование своего созвездия (Н9). Только от звезды к звезде: семь звёзд ковша и тусклые рядом, свободной линии нет.
 * Компьютер: нажать на звезду, линия тянется за курсором, нажать на следующую. Телефон: касаться звёзд по очереди.
 * Логика та же — «якорь» (последняя звезда) и нажатие на следующую.
 */
export type Segment = readonly [number, number];

export interface Drawing {
  readonly segments: readonly Segment[];
  /** Звезда, от которой тянется линия, или null. */
  readonly anchor: number | null;
}

export const EMPTY_DRAWING: Drawing = { segments: [], anchor: null };
export const MAX_SEGMENTS = 24;
/** Фигура закончена через 2,5 с без новой линии (или когда зритель скроллит дальше). */
export const FINISH_IDLE_MS = 2500;
/** Радиус попадания по звезде: пальцу — больше. */
export const HIT_RADIUS_MOUSE_PX = 24;
export const HIT_RADIUS_TOUCH_PX = 32;

function hasSegment(segments: readonly Segment[], a: number, b: number): boolean {
  return segments.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Нажатие на звезду: первая становится якорем, следующая — концом новой линии и новым якорем. */
export function pressStar(drawing: Drawing, star: number): Drawing {
  const { segments, anchor } = drawing;
  if (anchor === null) return { segments, anchor: star };
  if (anchor === star) return { segments, anchor: null };
  if (hasSegment(segments, anchor, star)) return { segments, anchor: star };
  if (segments.length >= MAX_SEGMENTS) return { segments, anchor: null };
  return { segments: [...segments, [anchor, star]], anchor: star };
}

/** Нажатие мимо звёзд отпускает линию. */
export function releaseAnchor(drawing: Drawing): Drawing {
  return { segments: drawing.segments, anchor: null };
}

interface HitQuery {
  readonly point: Point;
  readonly radiusPx: number;
}

/** Ближайшая звезда в радиусе попадания или null. */
export function findStarAt(layout: Layout, query: HitQuery): number | null {
  let best: number | null = null;
  let bestDistance = query.radiusPx;
  DRAWABLE_STARS.forEach((star, index) => {
    const px = unitsToPx(layout, star);
    const distance = Math.hypot(px.x - query.point.x, px.y - query.point.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
