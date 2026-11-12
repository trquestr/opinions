import type { NightDetail } from '../../model/night-details';
import type { Point3, Projected, Projector } from './projection';
import type { NightFrame } from './timeline';

/*
 * Гравюрные детали ночной сцены: расчёт положения и прозрачности. Чистые функции — DOM пишет details-layer.ts.
 *
 * Деталь стоит на бесконечно далёкой сфере: направление по рысканию ψ и тангажу θ (взгляд вперёд — +z):
 *   d = (sin ψ·cos θ, sin θ, cos ψ·cos θ),  экран — projectSky(d);
 *   угловая ширина w даёт widthPx = f·tg(w), f — фокус в px;
 *   верхний левый угол = (sx − widthPx/2, sy − widthPx/aspect/2). За спиной камеры (k = 0) деталь скрыта.
 */

/**
 * Потолок прозрачности. Деталь — далёкий фон на небе: она видна только сквозь точечный растр (~35% площади),
 * так что и при таком потолке её средняя яркость в разы ниже туши. Итог с множителем детали не больше 1.
 * Деталь не гаснет при смене фигур: в кадр её вводит и выводит поворот неба (camera.ts, figureSkyTurn).
 */
export const DETAIL_ALPHA = 0.7;
/**
 * Потолок сплошной части маски. Целая гравюра — тоновая плашка, чужая рядом с точечной тушью, поэтому деталь
 * остаётся россыпью точек; слабая сплошная подложка лишь связывает точки в читаемый силуэт.
 */
export const SOLID_MAX = 0.12;
const DEG = Math.PI / 180;
/** Защита от деления на ноль, пока картинка не загружена. */
const MIN_ASPECT = 1e-6;

/** Рабочее место одной детали: вход (aspect) и результат расчёта. Меняется на месте — без аллокаций в rAF. */
export interface DetailSlot {
  /** Ширина/высота картинки; 0 — картинка ещё не загружена. */
  aspect: number;
  /** Верхний левый угол и ширина на экране, px. */
  x: number;
  y: number;
  widthPx: number;
  /** false — деталь не видна (за камерой или картинка не загружена). */
  isVisible: boolean;
  readonly projected: Projected;
  readonly direction: { x: number; y: number; z: number };
}

export function createDetailSlot(): DetailSlot {
  return {
    aspect: 0,
    x: 0,
    y: 0,
    widthPx: 0,
    isVisible: false,
    projected: { x: 0, y: 0, k: 0 },
    direction: { x: 0, y: 0, z: 1 },
  };
}

/** Направление детали по углам; пишет в out. */
export function detailDirection(detail: NightDetail, out: { x: number; y: number; z: number }): Point3 {
  const yaw = detail.yawDeg * DEG;
  const pitch = detail.pitchDeg * DEG;
  out.x = Math.sin(yaw) * Math.cos(pitch);
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * Math.cos(pitch);
  return out;
}

/** Деталь → экран: центр по направлению на сфере, ширина по угловой ширине, угол — по пропорциям картинки. */
export function placeDetail(projector: Projector, detail: NightDetail, slot: DetailSlot): void {
  const { projected } = slot;
  projector.projectSky(detailDirection(detail, slot.direction), projected);
  slot.isVisible = slot.aspect > 0 && projected.k > 0;
  slot.widthPx = projector.focal * Math.tan(detail.widthDeg * DEG);
  slot.x = projected.x - slot.widthPx / 2;
  slot.y = projected.y - slot.widthPx / Math.max(slot.aspect, MIN_ASPECT) / 2;
}

/** Видимость деталей v ∈ [0, 1]: проступают в Н1 и остаются. Ведёт и прозрачность, и подложку маски (--solid). */
export function detailVisibility(frame: NightFrame): number {
  return frame.sky;
}

/** Прозрачность детали: видимость × потолок × собственная яркость детали (alpha, по умолчанию 1). */
export function detailOpacity(frame: NightFrame, detail: NightDetail): number {
  return Math.min(1, detailVisibility(frame) * DETAIL_ALPHA * (detail.alpha ?? 1));
}

/**
 * Сплошная часть маски (--solid) по видимости v: SOLID_MAX · clamp(2v − 1, 0, 1). Появление в два этапа:
 * v от 0 до 0.5 — проступают одни точки (слой-плитка stipple.png) вместе с прозрачностью,
 * v от 0.5 до 1 — под точками набирается слабая подложка силуэта. Случайная россыпь не даёт заметной сетки.
 */
export function solidValue(visibility: number): number {
  return SOLID_MAX * Math.min(1, Math.max(0, 2 * visibility - 1));
}
