import type { NightDetail } from '../../model/night-details';
import type { NightFrame } from './timeline';

/*
 * Гравюрные детали ночной сцены: расчёт положения и прозрачности. Чистые функции — DOM пишет details-layer.ts.
 *
 * Каждая деталь привязана к своему углу экрана (top-left или bottom-right) и видна, пока её фигура активна.
 * Пока камера едет к фигуре, деталь въезжает в свой угол вместе с небом — по направлению движения камеры:
 *   сдвиг (dx, dy) = −f · (Δψ_неба, Δθ_неба),
 * где Δ — отставание углов неба от цели хода (Camera.skyLag), f — фокус в px. Это тот же сдвиг, что у фоновых
 * звёзд при малых углах (projectSky: x ≈ C − f·ψ), поэтому деталь едет вместе со звёздами и встаёт, когда камера пришла.
 * Проявление: opacity = fade по доле хода камеры p (detailFade), уходящая — detailOutFade; см. ниже.
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
  /** Верхний левый угол, ширина и высота на экране, px. */
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  /** Сдвиг от угла движением камеры, px (shiftDetail). */
  shiftX: number;
  shiftY: number;
  /** Масштаб «ухода вглубь» (depthDetail), 1 — в покое. */
  depthScale: number;
  /** false — деталь не видна (картинка не загружена). */
  isVisible: boolean;
}

export function createDetailSlot(): DetailSlot {
  return {
    aspect: 0,
    x: 0,
    y: 0,
    widthPx: 0,
    heightPx: 0,
    shiftX: 0,
    shiftY: 0,
    depthScale: 1,
    isVisible: false,
  };
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
  slot.heightPx = heightPx;
  const [ox, oy] = detail.offset ?? [0, 0];
  const isTopLeft = detail.corner === 'top-left';
  slot.x = Math.round((isTopLeft ? 0 : view.width - widthPx) + ox * scale);
  slot.y = Math.round((isTopLeft ? 0 : view.height - heightPx) + oy * scale);
}

/** Сдвигает уже разложенную деталь вместе с небом (входящую — к углу, уходящую — от угла). */
export function shiftDetail(slot: DetailSlot, detail: NightDetail, motion: DetailMotion): void {
  const isLeaving = motion.leavingFigure === detail.figure;
  slot.shiftX = isLeaving ? motion.leavingShiftX : motion.shiftX;
  slot.shiftY = isLeaving ? motion.leavingShiftY : motion.shiftY;
  slot.x += Math.round(slot.shiftX);
  slot.y += Math.round(slot.shiftY);
}

/*
 * Уход вглубь вслед за движением камеры: чем дальше деталь от своего угла (сдвиг s в долях экрана,
 * sx = shiftX / W, sy = shiftY / H), тем глубже она в небе и тем меньше:
 *   scale = 1 − DEPTH_DROP · smoothstep(|s| / DEPTH_REACH),
 * DEPTH_REACH — сдвиг, на котором деталь ушла вглубь полностью. В покое (s = 0) — натуральная величина.
 */
const DEPTH_REACH = 0.25;
const DEPTH_DROP = 0.1;

/** Уход вглубь по сдвигу детали (после shiftDetail). */
export function depthDetail(view: View, slot: DetailSlot): void {
  const sx = slot.shiftX / Math.max(view.width, 1);
  const sy = slot.shiftY / Math.max(view.height, 1);
  const t = Math.min(1, Math.hypot(sx, sy) / DEPTH_REACH);
  slot.depthScale = 1 - DEPTH_DROP * t * t * (3 - 2 * t);
}

/**
 * Прозрачность детали: уходящая фигура гаснет по leavingFade, активная (frame.figure) — по fade, в пределах
 * detail.alpha или MAX_DETAIL_OPACITY. От фразы не зависит: фраза гаснет до смены фигуры, и деталь мигнула бы.
 */
export function detailOpacity(frame: NightFrame, detail: NightDetail, motion: DetailMotion): number {
  const isActive = frame.figure === detail.figure;
  const raw = motion.leavingFigure === detail.figure ? motion.leavingFade : Number(isActive) * motion.fade;
  const maxAlpha = detail.alpha ?? MAX_DETAIL_OPACITY;
  return Math.min(1, Math.max(0, raw)) * maxAlpha;
}

/*
 * Сдвиг детали ∝ (1 − smoothstep(p)) — ход камеры. Сцены сменяют друг друга по очереди, чтобы на экране почти не
 * было гравюр прошлой и наступающей фигуры сразу: уходящая гаснет за первые 45 % хода (успев уплыть на ~40 % пути),
 * входящая проступает с 45 % до 85 % хода — в этот момент ей ещё ехать ~57 % пути, так что въезд виден.
 */

/** smoothstep((p − 0.45) / 0.4): деталь проступает, когда уходящая уже погасла, и видна целиком к 85 % хода. */
export function detailFade(progress: number): number {
  const t = Math.min(1, Math.max(0, (progress - 0.45) / 0.4));
  return t * t * (3 - 2 * t);
}

/** 1 − smoothstep(p / 0.45): уходящая деталь гаснет за первые 45 % хода камеры, уплывая вместе с небом. */
export function detailOutFade(progress: number): number {
  const t = Math.min(1, Math.max(0, progress / 0.45));
  return 1 - t * t * (3 - 2 * t);
}
