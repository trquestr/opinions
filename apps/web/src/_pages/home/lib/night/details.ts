import type { NightDetail } from '../../model/night-details';
import type { NightFrame } from './timeline';

/*
 * Гравюрные детали ночной сцены: расчёт положения и прозрачности. Чистые функции — DOM пишет details-layer.ts.
 *
 * Каждая деталь привязана к своему углу экрана (top-left или bottom-right) и проявляется вместе с фразой своей
 * фигуры. Пока камера едет к фигуре, деталь въезжает в свой угол вместе с небом — по направлению движения камеры:
 *   сдвиг (dx, dy) = −f · (Δψ_неба, Δθ_неба),
 * где Δ — отставание углов неба от цели хода (Camera.skyLag), f — фокус в px. Это тот же сдвиг, что у фоновых
 * звёзд при малых углах (projectSky: x ≈ C − f·ψ), поэтому деталь едет вместе со звёздами и встаёт, когда камера пришла.
 * Проявление: opacity = фраза · fade, fade = smoothstep((p − 0.25) / 0.75) по доле хода камеры p — медленнее фразы.
 */

const MIN_ASPECT = 1e-6;
/** Экран, под который заданы ширины и смещения деталей (px); на других ширинах они масштабируются. */
const BASE_WIDTH = 1440;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.2;
/** Потолок прозрачности гравюрных деталей: тусклый далёкий фон, не спорящий с созвездием и текстом. */
export const MAX_DETAIL_OPACITY = 0.4;

/** Движение деталей в кадре: проявление/угасание по ходу камеры и сдвиг вместе с небом. Меняется на месте, без аллокаций. */
export interface DetailMotion {
  /** Множитель прозрачности входящей фигуры 0…1. */
  fade: number;
  /** Сдвиг входящей фигуры от угла, px. */
  shiftX: number;
  shiftY: number;
  /** Номер уходящей фигуры на время перелёта камеры (1…4) или null. */
  leavingFigure: number | null;
  /** Прозрачность уходящей фигуры 0…1. */
  leavingFade: number;
  /** Сдвиг уходящей фигуры от своего угла, px. */
  leavingShiftX: number;
  leavingShiftY: number;
}

export function createDetailMotion(): DetailMotion {
  return {
    fade: 1,
    shiftX: 0,
    shiftY: 0,
    leavingFigure: null,
    leavingFade: 0,
    leavingShiftX: 0,
    leavingShiftY: 0,
  };
}

/** Рабочее место одной детали: вход (aspect) и результат расчёта. Меняется на месте — без аллокаций в rAF. */
export interface DetailSlot {
  /** Ширина/высота картинки; 0 — картинка ещё не загружена. */
  aspect: number;
  /** Верхний левый угол и ширина на экране, px. */
  x: number;
  y: number;
  widthPx: number;
  /** false — деталь не видна (картинка не загружена). */
  isVisible: boolean;
}

export function createDetailSlot(): DetailSlot {
  return { aspect: 0, x: 0, y: 0, widthPx: 0, isVisible: false };
}

interface View {
  readonly width: number;
  readonly height: number;
}

/** Деталь → экран: угол экрана + смещение, масштаб по ширине вьюпорта. Сдвиг движения камеры — shiftDetail. */
export function placeDetail(view: View, detail: NightDetail, slot: DetailSlot): void {
  slot.isVisible = slot.aspect > 0;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.width / BASE_WIDTH));
  const widthPx = Math.round(detail.widthPx * scale);
  const heightPx = Math.round(widthPx / Math.max(slot.aspect, MIN_ASPECT));
  slot.widthPx = widthPx;
  const [ox, oy] = detail.offset ?? [0, 0];
  const isTopLeft = detail.corner === 'top-left';
  slot.x = Math.round((isTopLeft ? 0 : view.width - widthPx) + ox * scale);
  slot.y = Math.round((isTopLeft ? 0 : view.height - heightPx) + oy * scale);
}

/** Сдвигает уже разложенную деталь вместе с небом (входящую — к углу, уходящую — от угла). */
export function shiftDetail(slot: DetailSlot, detail: NightDetail, motion: DetailMotion): void {
  const isLeaving = motion.leavingFigure === detail.figure;
  slot.x += Math.round(isLeaving ? motion.leavingShiftX : motion.shiftX);
  slot.y += Math.round(isLeaving ? motion.leavingShiftY : motion.shiftY);
}

/** Прозрачность детали: уходящая фигура гаснет по leavingFade, входящая — фраза × fade, в пределах detail.alpha или MAX_DETAIL_OPACITY. */
export function detailOpacity(frame: NightFrame, detail: NightDetail, motion: DetailMotion): number {
  const raw =
    motion.leavingFigure === detail.figure
      ? motion.leavingFade
      : (frame.phrases[detail.figure] ?? 0) * motion.fade;
  const maxAlpha = detail.alpha ?? MAX_DETAIL_OPACITY;
  return Math.min(1, Math.max(0, raw)) * maxAlpha;
}

/** smoothstep((p − 0.25) / 0.75): деталь начинает проступать на четверти хода камеры и набирается к его концу. */
export function detailFade(progress: number): number {
  const t = Math.min(1, Math.max(0, (progress - 0.25) / 0.75));
  return t * t * (3 - 2 * t);
}

/** 1 − smoothstep(p / 0.75): уходящая деталь плавно гаснет за первые три четверти хода камеры. */
export function detailOutFade(progress: number): number {
  const t = Math.min(1, Math.max(0, progress / 0.75));
  return 1 - t * t * (3 - 2 * t);
}
