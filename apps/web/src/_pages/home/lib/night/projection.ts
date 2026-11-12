import manifest from './night-manifest.json';
import { createRandom } from './stars';

/*
 * Перспективная проекция ночной сцены (3D-камера, решено владельцем 2026-11-12). Одна на всё: капли туши, звёзды,
 * линии, попадание курсора по звёздам. Шейдеры получают уже экранные координаты — формула не дублируется в GLSL.
 *
 * Мир — «единицы ковша»: x вправо, y вниз (как на экране), z — вглубь, от зрителя.
 * Камера смотрит на точку T и стоит от неё на расстоянии D; повёрнута по горизонтали на ψ (рыскание) и по вертикали
 * на θ (тангаж). Для точки P:
 *   q = P − T;
 *   рыскание (вокруг оси y):  x₁ = q.x·cos ψ − q.z·sin ψ,  z₁ = q.x·sin ψ + q.z·cos ψ;
 *   тангаж   (вокруг оси x):  y₁ = q.y·cos θ − z₁·sin θ,   z₂ = q.y·sin θ + z₁·cos θ;
 *   глубина  w = D + z₂ (> 0 — перед камерой);
 *   экран    (sx, sy) = A + f·(x₁, y₁)/w,  масштаб k = f/w пикселей на единицу (им растут капли и звёзды).
 * A — точка опоры на экране (куда проецируется T), f — фокусное расстояние в px: f = H / (2·tg(FOV/2)).
 * На T масштаб f/D — это и есть «масштаб кадра» плоской раскладки, поэтому D = f / масштаб.
 *
 * Небесная сфера (фоновые звёзды) — бесконечно далеко: на неё действует только поворот камеры, не сдвиг.
 * Звезда — направление u; после поворота u' = R·u, на экране C + f·(u'.x, u'.y)/u'.z (C — центр экрана).
 * Отсюда глубина: при повороте небо уходит целиком, а ковш смещается относительно него. Угол для неба — × SKY_FOLLOW.
 */
export const FOV_DEGREES = 35;
/**
 * Небо поворачивается только на долю угла камеры (владелец 2026-11-12: «фон слишком активно двигается»).
 * Честная бесконечность сдвигается на f·Δψ — при облёте фигур это сотни пикселей; треть — спокойно, а глубина читается.
 */
const SKY_FOLLOW = 0.33;
const MIN_DEPTH = 1;

/** Камера кадра. Меняется на месте (один объект на сцену, без аллокаций в rAF). */
export interface CameraPose {
  yaw: number;
  pitch: number;
  distance: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  anchorX: number;
  anchorY: number;
}

/** Точка мира или направление на небесной сфере. */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Результат проекции точки: экранные px и масштаб (px на единицу ковша). Переиспользуется без аллокаций. */
export interface Projected {
  x: number;
  y: number;
  k: number;
}

export function focalLength(viewHeight: number): number {
  return viewHeight / (2 * Math.tan(((FOV_DEGREES / 2) * Math.PI) / 180));
}

export class Projector {
  focal = 1;
  centerX = 0;
  centerY = 0;
  private pose: CameraPose = {
    yaw: 0,
    pitch: 0,
    distance: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    anchorX: 0,
    anchorY: 0,
  };
  private cosYaw = 1;
  private sinYaw = 0;
  private cosPitch = 1;
  private sinPitch = 0;
  /** Поворот для небесной сферы — та же поза, но угол × SKY_FOLLOW. */
  private skyCosYaw = 1;
  private skySinYaw = 0;
  private skyCosPitch = 1;
  private skySinPitch = 0;

  /** Размер экрана: фокус и центр небесной сферы. */
  setView(width: number, height: number): void {
    this.focal = focalLength(height);
    this.centerX = width / 2;
    this.centerY = height / 2;
  }

  /** Новый кадр камеры: синусы и косинусы считаются раз на кадр, а не на точку. */
  setPose(pose: CameraPose): void {
    this.pose = pose;
    this.cosYaw = Math.cos(pose.yaw);
    this.sinYaw = Math.sin(pose.yaw);
    this.cosPitch = Math.cos(pose.pitch);
    this.sinPitch = Math.sin(pose.pitch);
    this.skyCosYaw = Math.cos(pose.yaw * SKY_FOLLOW);
    this.skySinYaw = Math.sin(pose.yaw * SKY_FOLLOW);
    this.skyCosPitch = Math.cos(pose.pitch * SKY_FOLLOW);
    this.skySinPitch = Math.sin(pose.pitch * SKY_FOLLOW);
  }

  /** Масштаб в точке взгляда (px на единицу): f / D (базовый масштаб кадра без z₂). */
  get referenceK(): number {
    return this.focal / Math.max(MIN_DEPTH, this.pose.distance);
  }

  /** Точка мира → экран. Пишет в out и возвращает его. */
  project(point: Point3, out: Projected): Projected {
    const { pose } = this;
    const qx = point.x - pose.targetX;
    const qy = point.y - pose.targetY;
    const qz = point.z - pose.targetZ;
    const x1 = qx * this.cosYaw - qz * this.sinYaw;
    const z1 = qx * this.sinYaw + qz * this.cosYaw;
    const y1 = qy * this.cosPitch - z1 * this.sinPitch;
    const z2 = qy * this.sinPitch + z1 * this.cosPitch;
    const k = this.focal / Math.max(MIN_DEPTH, pose.distance + z2);
    out.x = pose.anchorX + x1 * k;
    out.y = pose.anchorY + y1 * k;
    out.k = k;
    return out;
  }

  /** Направление на небесной сфере → экран (только поворот). k = 0 — направление за спиной камеры. */
  projectSky(direction: Point3, out: Projected): Projected {
    const x1 = direction.x * this.skyCosYaw - direction.z * this.skySinYaw;
    const z1 = direction.x * this.skySinYaw + direction.z * this.skyCosYaw;
    const y1 = direction.y * this.skyCosPitch - z1 * this.skySinPitch;
    const z2 = direction.y * this.skySinPitch + z1 * this.skyCosPitch;
    const isAhead = z2 > 0.05;
    out.x = isAhead ? this.centerX + (this.focal * x1) / z2 : -1e4;
    out.y = isAhead ? this.centerY + (this.focal * y1) / z2 : -1e4;
    out.k = isAhead ? 1 : 0;
    return out;
  }
}

/** Семь звёзд ковша в мире: x, y из ТЗ, z — по настоящим расстояниям (scripts/bake_night.py). */
export const DIPPER_DEPTHS: readonly number[] = manifest.stars.map((s) => s.z);

/**
 * Поле глубины, натянутое на семь звёзд: z(p) = Σ wᵢ zᵢ / Σ wᵢ, wᵢ = 1/(|p − Sᵢ|² + 25).
 * Фигура — изогнутый лист через звёзды: при любом ракурсе звезда остаётся на своём месте фигуры.
 */
export function depthAt(x: number, y: number): number {
  let sum = 0;
  let weights = 0;
  manifest.stars.forEach((star) => {
    const w = 1 / ((x - star.x) ** 2 + (y - star.y) ** 2 + 25);
    sum += w * star.z;
    weights += w;
  });
  return weights > 0 ? sum / weights : 0;
}

const SKY_SEED = 31;
/** Фоновые звёзды — направления в конусе ±HALF_SPAN рад вокруг взгляда: с запасом на повороты камеры. */
const SKY_HALF_SPAN = 0.62;

/**
 * Направления фоновых звёзд: на звезду три числа (единичный вектор u). Углы по горизонтали — в 1.6 раза шире,
 * чем по вертикали (экран широкий); u = normalize(tg α, tg β, 1).
 */
export function createSkyDirections(count: number): Float32Array {
  const random = createRandom(SKY_SEED);
  return Float32Array.from(
    Array.from({ length: count }, () => {
      const x = Math.tan((random() * 2 - 1) * SKY_HALF_SPAN * 1.6);
      const y = Math.tan((random() * 2 - 1) * SKY_HALF_SPAN);
      const length = Math.hypot(x, y, 1);
      return [x / length, y / length, 1 / length];
    }).flat(),
  );
}
