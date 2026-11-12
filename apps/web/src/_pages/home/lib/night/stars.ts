import manifest from './night-manifest.json';
import type { Bounds, Point } from './layout';

/*
 * Звёзды ночной сцены. Они в запас туши не входят и под курсором не двигаются: их положение задаёт только
 * этот модуль, шейдер звёзд вообще не получает данных о курсоре.
 */

/** Семь звёзд ковша, единицы ковша (ТЗ-генерация.md, сцена 2; копия в манифесте пишется скриптом запекания). */
export const DIPPER_STARS: readonly Point[] = manifest.stars.map(({ x, y }) => ({ x, y }));

/** Тусклые звёзды рядом с ковшом для рисования в Н9 (решено 2026-11-11: семь). */
export const INVITE_STARS: readonly Point[] = [
  { x: -16, y: -12 },
  { x: 22, y: -18 },
  { x: 16, y: 52 },
  { x: 58, y: 2 },
  { x: 56, y: 44 },
  { x: 114, y: 22 },
  { x: 122, y: 64 },
];

/** Звёзды, между которыми зритель проводит линии: сначала ковш, потом тусклые. */
export const DRAWABLE_STARS: readonly Point[] = [...DIPPER_STARS, ...INVITE_STARS];

/** Привычный контур ковша (Н8): чаша Дубхе–Мерак–Фекда–Мегрец и ручка Мегрец–Алиот–Мицар–Алькаид. */
export const DIPPER_OUTLINE: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [3, 4],
  [4, 5],
  [5, 6],
];

export const FIGURE_BOUNDS: Bounds = manifest.bounds;

function boundsOf(points: readonly Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Центр ковша — центр рамки семи звёзд; вокруг него закручивается вихрь (тот же центр у скрипта запекания). */
export const DIPPER_CENTER: Point = (() => {
  const b = boundsOf(DIPPER_STARS);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
})();

/** Генератор псевдослучайных чисел mulberry32: одно зерно — одно и то же небо при каждом заходе. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STAR_KIND = { background: 0, dipper: 1, invite: 2 } as const;
/** На звезду 7 чисел: x, y, размер ядра (px), яркость, вид (STAR_KIND), голубизна 0…1, поворот лучей (рад). */
export const STAR_STRIDE = 7;
const BACKGROUND_STAR_COUNT = 150;
const BACKGROUND_SEED = 20261111;

/**
 * Облик семи звёзд ковша — по настоящим данным, чтобы они были разными, как в небе.
 * Видимая звёздная величина m (меньше — ярче): размер ядра s = 2.6 + 1.3·(3.4 − m) px, яркость 0.75 + 0.15·(3.4 − m)/1.6.
 * Голубизна — по спектральному классу, но в холодной гамме (решение владельца 2026-11-11: звёзды голубоватые):
 * Алькаид (B3) — самый синий, белые A-звёзды — посередине, Дубхе (на деле оранжевый гигант K0) — самый бледный.
 * Поворот лучей — у каждой свой.
 */
const DIPPER_LOOK: Readonly<Record<string, { readonly magnitude: number; readonly blue: number; readonly rays: number }>> = {
  Dubhe: { magnitude: 1.79, blue: 0.15, rays: 0.12 },
  Merak: { magnitude: 2.37, blue: 0.7, rays: -0.2 },
  Phecda: { magnitude: 2.44, blue: 0.75, rays: 0.32 },
  Megrez: { magnitude: 3.31, blue: 0.55, rays: -0.05 },
  Alioth: { magnitude: 1.77, blue: 0.65, rays: 0.22 },
  Mizar: { magnitude: 2.04, blue: 0.7, rays: -0.3 },
  Alkaid: { magnitude: 1.86, blue: 1, rays: 0.05 },
};
const DEFAULT_LOOK = { magnitude: 2.4, blue: 0.6, rays: 0 } as const;

/** Фоновые звёзды — в долях экрана (0…1), а не в единицах ковша: они заполняют всё небо при любом масштабе. */
function backgroundStars(): number[] {
  const random = createRandom(BACKGROUND_SEED);
  return Array.from({ length: BACKGROUND_STAR_COUNT }, () => {
    const brightness = 0.2 + 0.5 * random() ** 2;
    return [random(), random(), 0.6 + 0.8 * random(), brightness, STAR_KIND.background, 0.4 + 0.5 * random(), 0];
  }).flat();
}

function dipperStars(): number[] {
  return manifest.stars.flatMap(({ name, x, y }) => {
    const look = DIPPER_LOOK[name] ?? DEFAULT_LOOK;
    const lift = 3.4 - look.magnitude;
    return [x, y, 2.6 + 1.3 * lift, 0.75 + (0.15 * lift) / 1.6, STAR_KIND.dipper, look.blue, look.rays];
  });
}

/** Таблица всех звёзд для шейдера: фоновые, семь ярких, тусклые. */
export function buildStarTable(): Float32Array {
  const invite = INVITE_STARS.flatMap((s) => [s.x, s.y, 2.3, 0.9, STAR_KIND.invite, 0.6, 0]);
  return new Float32Array([...backgroundStars(), ...dipperStars(), ...invite]);
}
