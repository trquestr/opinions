import { NIGHT_PHRASES } from '../../model/night-script';
import manifest from './night-manifest.json';
import type { Bounds, Layout, Point, Size } from './layout';
import { SKY_FOLLOW } from './projection';
import type { CameraPose } from './projection';

/*
 * 3D-камера ночной сцены (решено владельцем 2026-11-11, объём — 2026-11-12). Камера облетает ковш по сфере:
 * рыскание ψ (тангаж θ остаётся 0), расстояние D до точки взгляда T. На смене фигур Н2–Н5 она встаёт под своим углом к каждой
 * фигуре и ставит её в левую или правую треть экрана, текст — напротив. В Н1 и с Н6 — общий план, прямо.
 * Мир не меняется: семь звёзд неподвижны относительно мира, на экране они едут только вместе с камерой.
 *
 * Кадр фигуры: масштаб в точке взгляда s = min(0.56·W / w_f, 0.66·H / h_f), T — центр рамки фигуры,
 * опора A = (0.34·W или 0.66·W, 0.47·H), D = f / s (f — фокус проекции, projection.ts).
 * Ход за CAMERA_MS, τ ∈ [0, 1], e = τ²(3 − 2τ): ψ, θ, T, A и D смешиваются линейно, и поверх —
 *   дуга:    D' = D / (1 − 0.14·sin(πe)) — посреди хода камера отъезжает и снова наезжает;
 *   стоянка: после прихода за 8 с D' = D / (1 + 0.035·h) и ψ' = ψ + 0.06·h рад (h = smoothstep(t/8 с)) —
 *            медленный наезд с облётом на 3.5°: параллакс ковша на фоне неба виден и когда фигура стоит.
 * Новая цель посреди хода — новый ход начинается с текущего ракурса — без рывка.
 *
 * Свой участок неба у каждой фигуры (решено владельцем 2026-11-12): двух ракурсов (фигура слева / справа) на четыре
 * фигуры мало, поэтому небесная сфера дополнительно доворачивается — см. figureSkyTurn. Гравюры висят на небе
 * постоянно (model/night-details.ts) и входят в кадр только при «своём» довороте. Сама фигура при этом не наклоняется.
 */
export const SIDE_LAYOUT_QUERY = '(min-aspect-ratio: 6/5)';
export const CAMERA_MS = 3200;
// Ширина кадра фигуры; ближний край из-за перспективы крупнее — запас до края экрана нужен
const FIGURE_WIDTH_SHARE = 0.56;
const FIGURE_HEIGHT_SHARE = 0.66;
const FIGURE_CENTER_Y = 0.47;
const SIDE_CENTER_X = { left: 0.34, right: 0.66 } as const;
const ARC_PULL_BACK = 0.14;
const HOLD_PUSH_IN = 0.035;
const HOLD_ORBIT_RADIANS = 0.06;
const HOLD_MS = 8000;
const DEGREE = Math.PI / 180;
const SWAY_YAW = 5 * DEGREE;
const SWAY_PITCH = 2 * DEGREE;
const SWAY_YAW_PERIOD_S = 14;
const SWAY_PITCH_PERIOD_S = 19;

/**
 * Поворот фигуры (эскиз владельца 2026-11-12): как стена коридора — внешний край фигуры ближе и выше,
 * край к центру экрана уходит вглубь; только вокруг вертикали, без наклона. Фигура слева — ψ > 0
 * (точка справа от цели уходит вглубь: z₁ = x·sin ψ > 0), фигура справа — ψ < 0.
 * 20° (владелец 2026-11-12: 38° по пропорции эскиза — слишком глубоко); ближний край ≈ в 1.25 раза выше дальнего.
 */
const FIGURE_YAW_DEGREES = 20;
/**
 * Доворот неба в кадре фигуры. По горизонтали — в ту же сторону, что и ракурс (вместе с долей SKY_FOLLOW выходит
 * около ±11°), по вертикали — вверх у первых двух фигур и вниз у двух последних. Так у четырёх фигур четыре разных
 * участка неба: центры кадров расходятся на ~21° × 16° при поле зрения ~47° × 35°, и угол неба у каждой свой.
 */
const SKY_TURN_YAW_DEGREES = 4;
const SKY_TURN_PITCH_DEGREES = 8;
/** Фигуры с номером до этого смотрят в верхнюю половину неба, остальные — в нижнюю. */
const LAST_UPPER_SKY_FIGURE = 2;

export type Side = keyof typeof SIDE_CENTER_X;

/** Ракурс-цель: поза камеры и ключ (одна и та же цель второй раз хода не запускает). */
export interface Shot {
  readonly key: number;
  readonly pose: Readonly<CameraPose>;
  /** Вес покачивания: 1 — общий план (камера медленно покачивается, видно объём ковша), 0 — кадр фигуры. */
  readonly sway: number;
}

/** Рыскание ракурса фигуры, рад: + у фигуры слева, − справа, 0 — фигуры нет (общий план). */
export function figureYaw(side: Side | null): number {
  if (side === null) return 0;
  return (side === 'left' ? 1 : -1) * FIGURE_YAW_DEGREES * DEGREE;
}

/** Доворот неба в кадре фигуры, рад: по горизонтали — по стороне, по вертикали — по номеру фигуры. */
export function figureSkyTurn(state: number, side: Side): { readonly yaw: number; readonly pitch: number } {
  return {
    yaw: (side === 'left' ? 1 : -1) * SKY_TURN_YAW_DEGREES * DEGREE,
    pitch: (state <= LAST_UPPER_SKY_FIGURE ? -1 : 1) * SKY_TURN_PITCH_DEGREES * DEGREE,
  };
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

/** Точка опоры кадра фигуры на экране. */
export function figureAnchor(view: Size, side: Side): Point {
  return { x: view.width * SIDE_CENTER_X[side], y: view.height * FIGURE_CENTER_Y };
}

interface ShotInput {
  readonly view: Size;
  readonly focal: number;
  readonly key: number;
}

/** Доворот неба без поворота: общий план без фигуры. */
const NO_SKY_TURN = { yaw: 0, pitch: 0 } as const;

/**
 * Общий план: прямо, точка взгляда — то место мира, что плоская раскладка ставит в центр экрана.
 * sky — доворот неба (на узком экране у фигуры тот же, что у её бокового ракурса): фон едет при смене фигуры,
 * а сама фигура остаётся в центре.
 */
export function overviewShot(
  input: ShotInput,
  overview: Layout,
  sky: { readonly yaw: number; readonly pitch: number } = NO_SKY_TURN,
): Shot {
  const { view, focal, key } = input;
  const anchorX = view.width / 2;
  const anchorY = view.height / 2;
  return {
    key,
    sway: 1,
    pose: {
      yaw: 0,
      pitch: 0,
      distance: focal / overview.scale,
      targetX: (anchorX - overview.originX) / overview.scale,
      targetY: (anchorY - overview.originY) / overview.scale,
      targetZ: 0,
      anchorX,
      anchorY,
      skyYaw: sky.yaw,
      skyPitch: sky.pitch,
    },
  };
}

/** Кадр фигуры: под своим углом, сбоку экрана. */
export function figureShot(
  input: ShotInput,
  figure: { readonly state: number; readonly bounds: Bounds; readonly side: Side },
): Shot {
  const { view, focal, key } = input;
  const { bounds } = figure;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min(
    (view.width * FIGURE_WIDTH_SHARE) / width,
    (view.height * FIGURE_HEIGHT_SHARE) / height,
  );
  const anchor = figureAnchor(view, figure.side);
  const yaw = figureYaw(figure.side);
  const sky = figureSkyTurn(figure.state, figure.side);
  return {
    key,
    sway: 0,
    pose: {
      yaw,
      pitch: 0,
      distance: focal / scale,
      targetX: bounds.minX + width / 2,
      targetY: bounds.minY + height / 2,
      targetZ: 0,
      anchorX: anchor.x,
      anchorY: anchor.y,
      skyYaw: sky.yaw,
      skyPitch: sky.pitch,
    },
  };
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

const POSE_KEYS = [
  'yaw',
  'pitch',
  'distance',
  'targetX',
  'targetY',
  'targetZ',
  'anchorX',
  'anchorY',
  'skyYaw',
  'skyPitch',
] as const;

function emptyPose(): CameraPose {
  return {
    yaw: 0,
    pitch: 0,
    distance: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    anchorX: 0,
    anchorY: 0,
    skyYaw: 0,
    skyPitch: 0,
  };
}

function copyPose(target: CameraPose, source: Readonly<CameraPose>): void {
  for (const key of POSE_KEYS) target[key] = source[key];
}

export class Camera {
  /** Текущий ракурс. Один объект на всю сцену, меняется на месте (без аллокаций в rAF). */
  readonly current: CameraPose = emptyPose();
  private readonly from: CameraPose = emptyPose();
  private readonly to: CameraPose = emptyPose();
  /** Ракурс без дуги и стоянки — с него начинается следующий ход. */
  private readonly base: CameraPose = emptyPose();
  private startMs = -Infinity;
  private aimKey: number | null = null;
  private fromSway = 0;
  private toSway = 0;
  /** Текущий вес покачивания — с него начинается следующий ход. */
  private sway = 0;
  /** Поворот за курсором (рад), см. setLook; в снимок хода не входит. */
  private lookYaw = 0;
  private lookPitch = 0;
  /** Отклонение покачивания в последнем кадре (рад); в снимок хода не входит — его добавит applySway. */
  private swayYaw = 0;
  private swayPitch = 0;

  /** Сразу встать в ракурс без хода (первый кадр, ресайз, без анимации). */
  snap(shot: Shot): void {
    copyPose(this.from, shot.pose);
    copyPose(this.to, shot.pose);
    copyPose(this.base, shot.pose);
    copyPose(this.current, shot.pose);
    this.fromSway = shot.sway;
    this.toSway = shot.sway;
    this.sway = shot.sway;
    this.aimKey = shot.key;
    this.startMs = -Infinity;
  }

  /** Новая цель: ход от текущего ракурса. Та же цель — ничего не делает; самая первая — встать сразу. */
  aim(shot: Shot, nowMs: number): void {
    if (shot.key === this.aimKey) return;
    if (this.aimKey === null) {
      this.snap(shot);
      return;
    }
    copyPose(this.from, this.current);
    // Поворот за курсором и покачивание живут поверх хода: в начало хода их не запекаем, иначе они применятся
    // дважды и небо в первый кадр хода прыгнет на величину покачивания (до 5°)
    this.from.yaw -= this.lookYaw + this.swayYaw;
    this.from.pitch -= this.lookPitch + this.swayPitch;
    copyPose(this.to, shot.pose);
    this.fromSway = this.sway;
    this.toSway = shot.sway;
    this.aimKey = shot.key;
    this.startMs = nowMs;
  }

  /** Доля пройденного хода к текущей цели, 0…1 (1 — камера пришла). */
  progress(nowMs: number): number {
    return Math.min(1, Math.max(0, (nowMs - this.startMs) / CAMERA_MS));
  }

  /**
   * Отставание неба от цели хода, рад: углы неба базового ракурса (без стоянки, покачивания и взгляда за курсором)
   * минус углы неба цели. ψ_неба = ψ·SKY_FOLLOW + skyYaw, θ_неба = θ·SKY_FOLLOW + skyPitch (projection.ts).
   * Пишет в out; когда камера пришла — (0, 0).
   */
  skyLag(out: { yaw: number; pitch: number }): void {
    out.yaw = (this.base.yaw - this.to.yaw) * SKY_FOLLOW + (this.base.skyYaw - this.to.skyYaw);
    out.pitch = (this.base.pitch - this.to.pitch) * SKY_FOLLOW + (this.base.skyPitch - this.to.skyPitch);
  }

  /**
   * Сдвиг неба от начала хода (from), рад: базовый ракурс минус стартовый ракурс перехода.
   * На старте (0, 0), к концу хода совпадает с общим поворотом неба — уходящие детали плывут в ту же сторону.
   */
  skyDrift(out: { yaw: number; pitch: number }): void {
    out.yaw = (this.base.yaw - this.from.yaw) * SKY_FOLLOW + (this.base.skyYaw - this.from.skyYaw);
    out.pitch = (this.base.pitch - this.from.pitch) * SKY_FOLLOW + (this.base.skyPitch - this.from.skyPitch);
  }

  /**
   * Двигает камеру; возвращает, меняется ли ракурс (ход, стоянка, покачивание).
   * isStill — без анимации (prefers-reduced-motion): ни покачивания, ни наезда на стоянке.
   */
  update(nowMs: number, isStill = false): boolean {
    const e = smoothstep(this.progress(nowMs));
    for (const key of POSE_KEYS) this.base[key] = lerp(this.from[key], this.to[key], e);
    copyPose(this.current, this.base);
    const hold = isStill ? 0 : this.holdAt(nowMs);
    this.current.distance =
      this.base.distance / ((1 - ARC_PULL_BACK * Math.sin(Math.PI * e)) * (1 + HOLD_PUSH_IN * hold));
    this.current.yaw = this.base.yaw + HOLD_ORBIT_RADIANS * hold;
    this.sway = lerp(this.fromSway, this.toSway, e);
    const isSwaying = !isStill && this.sway > 0;
    this.swayYaw = 0;
    this.swayPitch = 0;
    if (isSwaying) this.applySway(nowMs / 1000);
    this.current.yaw += this.lookYaw;
    this.current.pitch += this.lookPitch;
    return e < 1 || (hold > 0 && hold < 1) || isSwaying;
  }

  /** Поворот ракурса за курсором, рад (сглаживает сцена): добавляется к ракурсу поверх хода, дуги и покачивания. */
  setLook(yaw: number, pitch: number): void {
    this.lookYaw = yaw;
    this.lookPitch = pitch;
  }

  /** Доля стоянки после прихода, 0…1 (0 — ещё едет или встала без хода). */
  private holdAt(nowMs: number): number {
    const holdMs = nowMs - this.startMs - CAMERA_MS;
    return holdMs > 0 && Number.isFinite(holdMs) ? smoothstep(holdMs / HOLD_MS) : 0;
  }

  /**
   * Покачивание общего плана: ψ += w·5°·sin(2πt/14), θ += w·2°·sin(2πt/19 + 1) — два несоизмеримых периода,
   * движение не повторяется; при повороте звёзды ковша на разной глубине смещаются друг относительно друга.
   */
  private applySway(t: number): void {
    this.swayYaw = this.sway * SWAY_YAW * Math.sin((2 * Math.PI * t) / SWAY_YAW_PERIOD_S);
    this.swayPitch = this.sway * SWAY_PITCH * Math.sin((2 * Math.PI * t) / SWAY_PITCH_PERIOD_S + 1);
    this.current.yaw += this.swayYaw;
    this.current.pitch += this.swayPitch;
  }
}
