import manifest from './night-manifest.json';
import { createRandom, DIPPER_CENTER, DRAWABLE_STARS, FIGURE_BOUNDS } from './stars';
import type { Point } from './layout';

/*
 * Состояния туши: на точку три int16 — x, y, r в сотых долях единицы ковша (FIXED_POINT), как в points-<N>.bin.
 * Во всех состояниях одинаковое число точек: i-я точка одного состояния летит в i-ю точку следующего.
 * Внутри состояния точки отсортированы по углу вокруг центра ковша — тогда перелёт читается как закрутка.
 */
export const FIXED_POINT = manifest.fixedPoint;
export const INK_STRIDE = 3;
const LOAD_TIMEOUT_MS = 15_000;
const HAZE_SEED = 7;
/** Видна только часть капель дымки, остальные «растворены» (r = 0) и проступают, когда собирается фигура. */
const HAZE_VISIBLE_SHARE = 0.25;

type Segment = readonly [number, number];

interface InkPoint {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

function encode(points: readonly InkPoint[]): Int16Array {
  const angle = (p: InkPoint) => Math.atan2(p.y - DIPPER_CENTER.y, p.x - DIPPER_CENTER.x);
  const sorted = [...points].sort((a, b) => angle(a) - angle(b));
  return Int16Array.from(sorted.flatMap((p) => [p.x, p.y, p.r].map((v) => Math.round(v * FIXED_POINT))));
}

/**
 * Дымка (Н1, Н6–Н9): мелкие капли вокруг фигур, плотность спадает к краям без резкой границы.
 * Расстояние от центра (в долях полуосей эллипса) — модуль двумерного гауссова вектора с σ = 0.45:
 *   d = 0.45 · √(−2 · ln(1 − 0.98·ξ)), ξ ∈ [0, 1) — половина капель ближе 0.53, хвост доходит до ~1.27.
 */
export function createHaze(count: number): Int16Array {
  const random = createRandom(HAZE_SEED);
  const b = FIGURE_BOUNDS;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const rx = ((b.maxX - b.minX) / 2) * 1.1;
  const ry = ((b.maxY - b.minY) / 2) * 1.1;
  const points = Array.from({ length: count }, () => {
    const a = random() * Math.PI * 2;
    const d = 0.45 * Math.sqrt(-2 * Math.log(1 - 0.98 * random()));
    return {
      x: cx + Math.cos(a) * d * rx,
      y: cy + Math.sin(a) * d * ry,
      r: random() < HAZE_VISIBLE_SHARE ? 0.06 + 0.1 * random() : 0,
    };
  });
  return encode(points);
}

/** Пунктир вдоль линий зрителя: шаг 1,4 единицы, четыре капли — две пропуска, у самих звёзд — зазор. */
const DOT_STEP = 1.4;
const DASH_ON = 4;
const DASH_PERIOD = 6;
const STAR_GAP = 2.5;
const DOT_RADIUS = 0.32;

function dashDots(a: Point, b: Point): InkPoint[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.floor((length - 2 * STAR_GAP) / DOT_STEP);
  return Array.from({ length: Math.max(0, steps + 1) }, (_, i) => i)
    .filter((i) => i % DASH_PERIOD < DASH_ON)
    .map((i) => {
      const t = (STAR_GAP + i * DOT_STEP) / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: DOT_RADIUS };
    });
}

function decode(state: Int16Array, index: number): InkPoint {
  const at = (k: number) => (state[index * INK_STRIDE + k] ?? 0) / FIXED_POINT;
  return { x: at(0), y: at(1), r: at(2) };
}

/**
 * Состояние «тушь обвела фигуру зрителя»: часть капель дымки встаёт пунктиром вдоль его линий, остальные висят где были.
 * Капли для пунктира берутся равномерно по всему запасу, чтобы подплывали со всех сторон.
 */
export function createOutline(haze: Int16Array, segments: readonly Segment[]): Int16Array {
  const count = haze.length / INK_STRIDE;
  const dots = segments
    .flatMap(([a, b]) => {
      const from = DRAWABLE_STARS[a];
      const to = DRAWABLE_STARS[b];
      return from && to ? dashDots(from, to) : [];
    })
    .slice(0, count);
  const step = dots.length > 0 ? count / dots.length : 0;
  const byIndex = new Map(dots.map((dot, i) => [Math.floor(i * step), dot]));
  const points = Array.from({ length: count }, (_, i) => byIndex.get(i) ?? decode(haze, i));
  return Int16Array.from(points.flatMap((p) => [p.x, p.y, p.r].map((v) => Math.round(v * FIXED_POINT))));
}

/** Число капель: на телефоне вдвое меньше (Раскадровка.md, «Бюджет»). */
export function pickInkCount(isSmallScreen: boolean): number {
  const [desktop, phone] = manifest.counts;
  return (isSmallScreen ? phone : desktop) ?? 0;
}

/** Загружает запечённые фигуры. Файл проверяется по размеру: битый или чужой — ошибка, сцена останется в дымке. */
export async function loadFigures(count: number, signal: AbortSignal): Promise<Int16Array[]> {
  const url = `/assets/night/points-${count}.bin`;
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(LOAD_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`Фигуры ночи не загрузились: ${url} → ${response.status}`);
  const buffer = await response.arrayBuffer();
  const values = count * INK_STRIDE;
  const expected = manifest.figures.length * values * Int16Array.BYTES_PER_ELEMENT;
  if (buffer.byteLength !== expected) {
    throw new Error(`Фигуры ночи: ${url} — ${buffer.byteLength} байт вместо ${expected}`);
  }
  return manifest.figures.map(
    (_, i) => new Int16Array(buffer, i * values * Int16Array.BYTES_PER_ELEMENT, values),
  );
}
