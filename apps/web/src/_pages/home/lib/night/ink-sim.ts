import { FIXED_POINT, INK_STRIDE } from './ink';
import { MAX_DROP_RADIUS_PX } from './ink-grid';
import { createRandom } from './stars';
import type { Cursor, Influence } from './cursor';
import type { InkGrid } from './ink-grid';
import { depthAt } from './projection';
import type { Bounds, Point } from './layout';
import type { Projected, Projector } from './projection';

/*
 * Движение капель туши ночной сцены. Считается на процессоре (как у бюста): шейдеру туши нужны готовые центры,
 * радиусы и вытянутость капель, разложенные по сетке (ink-grid.ts). За кадр ничего не создаётся — только
 * заранее выделенные типизированные массивы (требование 60 FPS). Формулы — в единицах ковша.
 *
 * СМЕНА ФИГУР — по времени, а не по скроллу (скролл только выбирает цель). Так смена всегда длится TRANSITION_MS,
 * как бы быстро ни крутили колесо. Если цель сменилась посреди перехода, капли поворачивают к новой цели
 * с того места, где они сейчас (снимок положений), — без рывка.
 *
 * ПЕРЕЛЁТ РОЕМ (решено владельцем 2026-11-12 вместо «галактики»-бублика). Путь капли i, τ = (t − t₀)/T:
 *   волна:   e = smoothstep((τ − 0.3·k_A − 0.12·h₁) / 0.58) — капли срываются волной слева направо
 *            (k_A — положение капли в старой фигуре по x, 0…1), каждая летит 0.58 перехода;
 *   кривая:  квадратичная Безье P = (1 − e)²·A + 2(1 − e)e·M + e²·B, M — личная промежуточная точка:
 *            M = (A + B)/2 + (s·SWEEP·(0.5 + h₂), 50·(h₃ − 0.5), 120·(h₁ − 0.5)) — общий снос s = ±1 в сторону,
 *            где встанет новая фигура (рой течёт с одной стороны на другую), плюс личный разброс по высоте и
 *            по глубине (часть роя летит к камере, часть от неё — объём);
 *   хаос:    поверх — турбулентность с горбом b = sin(πe): δ = b·(7·(sin(1.7t + 2πh₁) + 0.6·sin(3.9t + 2πh₂)),
 *            7·(cos(1.9t + 2πh₂) + 0.6·cos(3.3t + 2πh₃)), 10·sin(1.3t + 2πh₃)) — капли петляют, а не летят по линейке;
 *   капля:   r = mix(r_A, r_B, e)·(1 − 0.3·b) — в полёте чуть мельче; вытягивается по скорости (updateStretch).
 * «Подплывание» к линиям зрителя — напрямую, без сноса и почти без хаоса (M = (A + B)/2, турбулентность ×0.2).
 */

const TAU = Math.PI * 2;
const SEED = 11;
/** Длительность смены фигуры и «подплывания» к линиям зрителя, без анимации — быстрая смена на месте. */
const TRANSITION_MS = 3200;
const DIRECT_TRANSITION_MS = 1800;
const REDUCED_TRANSITION_MS = 900;
/** Общий снос роя вбок (единицы ковша), разброс промежуточных точек по высоте и глубине, амплитуды турбулентности. */
const SWEEP = 70;
const SCATTER_Y = 50;
const SCATTER_Z = 120;
const TURBULENCE_XY = 7;
const TURBULENCE_Z = 10;
const DIRECT_TURBULENCE = 0.2;
/** Толщина «листа» фигуры, единицы: разброс капель по глубине для объёма (мягкий, без разрыва контуров). */
const DEPTH_JITTER = 2;
/**
 * Рельеф фигуры (владелец 2026-11-12: «объект должен немного 3d-шиться»): густая тёмная тушь гравюры (крупная капля)
 * выступает к зрителю на RELIEF·r/r_max единиц, светлые места остаются глубже — как барельеф. Умеренная амплитуда
 * сохраняет объём при движении курсора, не искажая силуэт и колёса при ракурсе 20°.
 */
const RELIEF = 8;
/**
 * Дымка — состояние 0 (timeline.HAZE): капли висят облаком на глубине ±HAZE_DEPTH вокруг листа ковша
 * (владелец 2026-11-12: «больше глубины и в Н1, и в финале»). При покачивании камеры и движении мыши ближние капли
 * проплывают быстрее дальних — облако читается объёмным.
 */
const HAZE_STATE = 0;
const HAZE_DEPTH = 80;
/** Просвет туши вокруг семи звёзд ковша: внутри CLEAR_INNER капли нет, к CLEAR_OUTER она полная (единицы). */
const CLEAR_INNER = 1.4;
const CLEAR_OUTER = 3.2;
/**
 * Вздрагивание у звезды под курсором: гауссово пятно σ² = 36 (σ = 6 единиц), амплитуда 0.9 единицы.
 * Это один толчок, а не дрожь: сила s спадает 1 → 0 за 0,6 с, смещение ∝ 4·s·(1 − s) — капли отходят и возвращаются.
 */
const HOVER_SIGMA2 = 36;
const HOVER_AMPLITUDE = 0.9;
/** Вытянутость капли по скорости: stretch = min(MAX, |v| · K), v — px за кадр 60 Гц; сглаживание — доля за кадр. */
const STRETCH_PER_PX = 0.09;
const STRETCH_MAX = 0.6;
const STRETCH_EASE = 0.25;
/** Доля, на которую снос капли курсором догоняет цель за кадр (как у бюста: 0.22). */
const OFFSET_EASE = 0.22;
/** Капли меньше этого радиуса не рисуются: это «растворённая» тушь. */
const MIN_VISIBLE_PX = 0.45;

export interface InkStep {
  /** Состояние, к которому идёт тушь (дымка, фигура, пунктир зрителя). */
  readonly target: number;
  /** Куда сносит рой при перелёте: +1 — вправо, −1 — влево (в сторону, где встанет новая фигура). */
  readonly sweep: number;
  /** Идти к цели напрямую, без сноса и почти без хаоса («подплывание» к линиям зрителя). */
  readonly isDirect: boolean;
  /** Амплитуда дрейфа в покое у цели, единицы: у дымки большая, у фигуры малая. */
  readonly drift: number;
  readonly isReducedMotion: boolean;
  readonly nowMs: number;
  /** Звезда под курсором (единицы) и сила вздрагивания 0…1. */
  readonly hover: Point;
  readonly hoverStrength: number;
  /** Курсор: капли фигуры у него набухают и сносятся, по щелчку идёт волна. */
  readonly cursor: Cursor;
}

export interface InkSimulationOptions {
  /** Центр ковша. */
  readonly center: Point;
  /** Семь звёзд ковша: вокруг них тушь расступается. */
  readonly dipper: readonly Point[];
  /** Общие границы фигур: по ним считается волна «слева направо». */
  readonly bounds: Bounds;
  /** Множитель радиуса капель на экране (см. scene.ts). */
  readonly radiusScale: number;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  r: number;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Чтение капли из состояния (int16, сотые доли единицы) в переданный скретч. */
function readInto(state: Int16Array, i: number, out: Placement): Placement {
  const at = i * INK_STRIDE;
  out.x = (state[at] ?? 0) / FIXED_POINT;
  out.y = (state[at + 1] ?? 0) / FIXED_POINT;
  out.r = (state[at + 2] ?? 0) / FIXED_POINT;
  return out;
}

export class InkSimulation {
  readonly count: number;
  private readonly states: (Int16Array | undefined)[] = [];
  private readonly seedA: Float32Array;
  private readonly seedB: Float32Array;
  private readonly seedC: Float32Array;
  /** Снимок положений в момент смены цели (откуда идёт переход) и последнее посчитанное положение. */
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly fromR: Float32Array;
  private readonly curX: Float32Array;
  private readonly curY: Float32Array;
  private readonly curR: Float32Array;
  private readonly prevX: Float32Array;
  private readonly prevY: Float32Array;
  private readonly stretch: Float32Array;
  private readonly dirX: Float32Array;
  private readonly dirY: Float32Array;
  /** Сглаженный снос капель курсором, px: капли тянутся за мышью и возвращаются, а не прыгают. */
  private readonly offX: Float32Array;
  private readonly offY: Float32Array;
  /** Скретчи: капля для сетки (r, stretch, dirX, dirY), её место, цель, влияние курсора. */
  private readonly drop = new Float32Array(4);
  private readonly place: Placement = { x: 0, y: 0, z: 0, r: 0 };
  private readonly goal: Placement = { x: 0, y: 0, z: 0, r: 0 };
  private readonly screen: Projected = { x: 0, y: 0, k: 0 };
  /** Глубина капель каждого состояния (считается раз при загрузке состояния). */
  private readonly depths: (Float32Array | undefined)[] = [];
  /** Сдвиг капель по x от смещения вдоль линии взгляда (см. setState). */
  private readonly shifts: (Float32Array | undefined)[] = [];
  private readonly fromZ: Float32Array;
  private readonly curZ: Float32Array;
  private readonly influence: Influence = { shiftX: 0, shiftY: 0, grow: 1 };
  private readonly options: InkSimulationOptions;
  private target = -1;
  private isDirect = false;
  private startMs = 0;
  private driftFrom = 0;
  private hasCurrent = false;
  private hasPrevious = false;
  /** Положение текущей капли до сноса курсором, px (поля, а не объект — без аллокаций на каплю). */
  private baseX = 0;
  /** Полёт текущей капли: доля пути, снос роя, время (с). */
  private flightE = 0;
  private flightSweep = 1;
  private flightT = 0;
  private baseY = 0;

  constructor(count: number, options: InkSimulationOptions) {
    this.count = count;
    this.options = options;
    const random = createRandom(SEED);
    this.seedA = Float32Array.from({ length: count }, () => random());
    this.seedB = Float32Array.from({ length: count }, () => random());
    this.seedC = Float32Array.from({ length: count }, () => random());
    this.fromX = new Float32Array(count);
    this.fromY = new Float32Array(count);
    this.fromR = new Float32Array(count);
    this.curX = new Float32Array(count);
    this.curY = new Float32Array(count);
    this.curR = new Float32Array(count);
    this.fromZ = new Float32Array(count);
    this.curZ = new Float32Array(count);
    this.prevX = new Float32Array(count);
    this.prevY = new Float32Array(count);
    this.stretch = new Float32Array(count);
    this.offX = new Float32Array(count);
    this.offY = new Float32Array(count);
    this.dirX = new Float32Array(count).fill(1);
    this.dirY = new Float32Array(count);
  }

  /**
   * Состояние туши и его глубина. Капля лежит на листе, натянутом точно на семь звёзд (depthAt): в своём ракурсе
   * звёзды стоят ровно на своих местах фигуры. Объём сверх листа — смещение d вдоль линии взгляда ракурса фигуры
   * v = (sin ψ, 0, cos ψ), ψ — рыскание её кадра (heroYaw): поворот камеры x₁ = x·cos ψ − z·sin ψ даёт для v
   * Δx₁ = d·(sin ψ·cos ψ − cos ψ·sin ψ) = 0 — в своём ракурсе фигура чёткая, как запечённая гравюра, а объём
   * проявляется только при движении (курсор, покачивание, смена фигур). (Владелец 2026-11-12: смещение по одной z
   * под углом 20° смазывало детали и уводило звёзды с фигур.)
   *   фигура: d = −RELIEF·r/r_max + DEPTH_JITTER·(h₃ − 0.5) — барельеф по густоте туши и разброс;
   *   дымка (Н1, Н6–Н9): d = HAZE_DEPTH·(2h₁ − 1) — облако в объёме вокруг ковша.
   */
  setState(index: number, data: Int16Array, heroYaw = 0): void {
    this.states[index] = data;
    let maxRadius = 1;
    for (let at = 2; at < data.length; at += INK_STRIDE) maxRadius = Math.max(maxRadius, data[at] ?? 0);
    const volume = Float32Array.from({ length: this.count }, (_, i) => this.volumeOf({ index, data, i, maxRadius }));
    this.depths[index] = Float32Array.from(volume, (d, i) => {
      const at = i * INK_STRIDE;
      return depthAt((data[at] ?? 0) / FIXED_POINT, (data[at + 1] ?? 0) / FIXED_POINT) + d * Math.cos(heroYaw);
    });
    this.shifts[index] = Float32Array.from(volume, (d) => d * Math.sin(heroYaw));
  }

  /** Смещение капли сверх листа вдоль линии взгляда (см. setState). */
  private volumeOf(drop: { readonly index: number; readonly data: Int16Array; readonly i: number; readonly maxRadius: number }): number {
    const { index, data, i } = drop;
    if (index === HAZE_STATE) return ((this.seedA[i] ?? 0.5) * 2 - 1) * HAZE_DEPTH;
    const relief = -RELIEF * ((data[i * INK_STRIDE + 2] ?? 0) / drop.maxRadius);
    return relief + ((this.seedC[i] ?? 0.5) - 0.5) * DEPTH_JITTER;
  }

  hasState(index: number): boolean {
    return this.states[index] !== undefined;
  }

  /** Сбрасывает память скоростей (после ресайза или прыжка скролла капли не должны «вытянуться» через весь экран). */
  resetMotion(): void {
    this.hasPrevious = false;
  }

  /** Идёт ли смена (нужны кадры, даже если зритель ничего не делает). */
  isTransitioning(nowMs: number, isReducedMotion: boolean): boolean {
    return nowMs - this.startMs < this.duration(isReducedMotion);
  }

  /** Считает все капли кадра и раскладывает их по сетке. */
  step(input: InkStep, projector: Projector, grid: InkGrid): void {
    grid.begin();
    const goal = this.states[input.target] ?? this.states[0];
    const goalDepth = this.depths[input.target] ?? this.depths[0];
    const goalShift = this.shifts[input.target] ?? this.shifts[0];
    if (goal && goalDepth) {
      this.retargetIfNeeded(input, goal, goalDepth);
      const tau = Math.min(1, (input.nowMs - this.startMs) / this.duration(input.isReducedMotion));
      const frame: DropFrame = { input, goal, goalDepth, goalShift, projector, grid, tau };
      for (let i = 0; i < this.count; i++) this.stepDrop(i, frame);
      this.hasCurrent = true;
      this.hasPrevious = true;
    }
    grid.end();
  }

  private duration(isReducedMotion: boolean): number {
    if (isReducedMotion) return REDUCED_TRANSITION_MS;
    return this.isDirect ? DIRECT_TRANSITION_MS : TRANSITION_MS;
  }

  /**
   * Новая цель (или цель только что загрузилась вместо дымки) — снимок текущих положений становится началом перехода.
   * Самый первый кадр начинается сразу в цели, без перехода.
   */
  private retargetIfNeeded(input: InkStep, goal: Int16Array, goalDepth: Float32Array): void {
    const effective = this.states[input.target] ? input.target : 0;
    if (effective === this.target) return;
    this.target = effective;
    this.isDirect = input.isDirect;
    this.driftFrom = this.hasCurrent ? this.driftFrom : input.drift;
    this.startMs = this.hasCurrent ? input.nowMs : -Infinity;
    if (this.hasCurrent) {
      this.fromX.set(this.curX);
      this.fromY.set(this.curY);
      this.fromR.set(this.curR);
      this.fromZ.set(this.curZ);
      return;
    }
    this.fromZ.set(goalDepth);
    for (let i = 0; i < this.count; i++) {
      readInto(goal, i, this.goal);
      this.fromX[i] = this.goal.x;
      this.fromY[i] = this.goal.y;
      this.fromR[i] = this.goal.r;
    }
  }

  private stepDrop(i: number, frame: DropFrame): void {
    const { projector, grid, input } = frame;
    const p = this.place;
    this.readGoal(i, frame);
    if (input.isReducedMotion) this.placeStill(i, frame.tau);
    else this.placeMoving(i, frame);
    this.curX[i] = p.x;
    this.curY[i] = p.y;
    this.curR[i] = p.r;
    this.curZ[i] = p.z;
    this.applyDrift(i, frame);
    this.applyHover(input, this.seedB[i] ?? 0);
    const clear = smoothstep((this.nearestStar(p.x, p.y) - CLEAR_INNER) / (CLEAR_OUTER - CLEAR_INNER));
    const screen = projector.project(p, this.screen);
    this.baseX = screen.x;
    this.baseY = screen.y;
    const pull = this.applyCursor(i, input.cursor);
    const x = this.baseX + (this.offX[i] ?? 0);
    const y = this.baseY + (this.offY[i] ?? 0);
    const refK = projector.referenceK;
    const kScale = refK > 0 ? Math.sqrt(screen.k * refK) : screen.k;
    const radius = Math.min(p.r * clear * kScale * this.options.radiusScale * pull, MAX_DROP_RADIUS_PX);
    this.updateStretch(i, x, y);
    if (radius < MIN_VISIBLE_PX) return;
    this.drop[0] = radius;
    this.drop[1] = this.stretch[i] ?? 0;
    this.drop[2] = this.dirX[i] ?? 1;
    this.drop[3] = this.dirY[i] ?? 0;
    grid.add(x, y, this.drop);
  }

  /** Цель капли: место из состояния, глубина листа и сдвиг объёма вдоль линии взгляда. */
  private readGoal(i: number, frame: DropFrame): void {
    readInto(frame.goal, i, this.goal);
    this.goal.z = frame.goalDepth[i] ?? 0;
    this.goal.x += frame.goalShift?.[i] ?? 0;
  }

  /** Доля положения по x в общих границах фигур: 0 — левый край, 1 — правый. */
  private keyOf(x: number): number {
    const { minX, maxX } = this.options.bounds;
    return Math.min(1, Math.max(0, (x - minX) / (maxX - minX)));
  }

  /** Перелёт роем по личной кривой с турбулентностью (формулы — в заголовке файла). */
  private placeMoving(i: number, { tau, input }: DropFrame): void {
    const h1 = this.seedA[i] ?? 0;
    const g = this.goal;
    const fromX = this.fromX[i] ?? 0;
    const e = this.isDirect
      ? smoothstep((tau - 0.3 * this.keyOf(g.x) - 0.1 * (this.seedB[i] ?? 0)) / 0.6)
      : smoothstep((tau - 0.3 * this.keyOf(fromX) - 0.12 * h1) / 0.58);
    // Параметры полёта — в полях, а не в объекте: placeMoving вызывается для каждой капли каждый кадр
    this.flightE = e;
    this.flightSweep = input.sweep;
    this.flightT = input.nowMs / 1000;
    this.placeOnCurve(i);
    this.applyTurbulence(i);
  }

  /** Квадратичная Безье от снимка к цели через личную промежуточную точку M. */
  private placeOnCurve(i: number): void {
    const e = this.flightE;
    const p = this.place;
    const g = this.goal;
    const ax = this.fromX[i] ?? 0;
    const ay = this.fromY[i] ?? 0;
    const az = this.fromZ[i] ?? 0;
    const scatter = this.isDirect ? 0 : 1;
    const mx = (ax + g.x) / 2 + scatter * this.flightSweep * SWEEP * (0.5 + (this.seedB[i] ?? 0));
    const my = (ay + g.y) / 2 + scatter * SCATTER_Y * ((this.seedC[i] ?? 0) - 0.5);
    const mz = (az + g.z) / 2 + scatter * SCATTER_Z * ((this.seedA[i] ?? 0) - 0.5);
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    p.x = a * ax + b * mx + c * g.x;
    p.y = a * ay + b * my + c * g.y;
    p.z = a * az + b * mz + c * g.z;
    p.r = ((this.fromR[i] ?? 0) * (1 - e) + g.r * e) * (1 - 0.3 * Math.sin(Math.PI * e));
  }

  /** Турбулентность с горбом sin(πe): в начале и в конце пути капля точно на месте, посередине — петляет. */
  private applyTurbulence(i: number): void {
    const bump = Math.sin(Math.PI * this.flightE) * (this.isDirect ? DIRECT_TURBULENCE : 1);
    if (bump <= 0) return;
    const t = this.flightT;
    const p1 = TAU * (this.seedA[i] ?? 0);
    const p2 = TAU * (this.seedB[i] ?? 0);
    const p3 = TAU * (this.seedC[i] ?? 0);
    const p = this.place;
    p.x += bump * TURBULENCE_XY * (Math.sin(1.7 * t + p1) + 0.6 * Math.sin(3.9 * t + p2));
    p.y += bump * TURBULENCE_XY * (Math.cos(1.9 * t + p2) + 0.6 * Math.cos(3.3 * t + p3));
    p.z += bump * TURBULENCE_Z * Math.sin(1.3 * t + p3);
  }

  /** Без анимации: капля гаснет на старом месте и проступает на новом, без полёта. */
  private placeStill(i: number, tau: number): void {
    const p = this.place;
    const g = this.goal;
    const isLeaving = tau < 0.5;
    p.x = isLeaving ? (this.fromX[i] ?? 0) : g.x;
    p.y = isLeaving ? (this.fromY[i] ?? 0) : g.y;
    p.z = isLeaving ? (this.fromZ[i] ?? 0) : g.z;
    p.r = (isLeaving ? (this.fromR[i] ?? 0) : g.r) * Math.abs(1 - 2 * tau);
  }

  /** Дрейф в покое: две синусоиды на ось с личными фазами; амплитуда перетекает от старой цели к новой. */
  private applyDrift(i: number, { input, tau }: DropFrame): void {
    if (input.isReducedMotion) return;
    if (tau >= 1) this.driftFrom = input.drift;
    const h1 = this.seedA[i] ?? 0;
    const h2 = this.seedB[i] ?? 0;
    const amplitude = this.driftFrom + (input.drift - this.driftFrom) * smoothstep(tau);
    const t = input.nowMs / 1000;
    this.place.x += amplitude * (Math.sin(t * 0.55 + TAU * h1) + 0.5 * Math.sin(t * 1.3 + TAU * h2));
    this.place.y += amplitude * (Math.cos(t * 0.47 + TAU * h2) + 0.5 * Math.cos(t * 1.1 + TAU * h1));
  }

  /** Сдвиг вдоль направления от звезды: δ = n̂ · 4s(1 − s) · A · exp(−d²/σ²) · (0.6 + 0.4·h₂). */
  private applyHover(input: InkStep, h2: number): void {
    if (input.hoverStrength <= 0) return;
    const p = this.place;
    const dx = p.x - input.hover.x;
    const dy = p.y - input.hover.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    const s = input.hoverStrength;
    const shake = 4 * s * (1 - s) * HOVER_AMPLITUDE * Math.exp(-d2 / HOVER_SIGMA2) * (0.6 + 0.4 * h2);
    p.x += (dx / d) * shake;
    p.y += (dy / d) * shake;
  }

  /** Снос и набухание от курсора: смещение догоняет цель на OFFSET_EASE за кадр. Возвращает множитель радиуса. */
  private applyCursor(i: number, cursor: Cursor): number {
    const { influence } = this;
    cursor.influence(this.baseX, this.baseY, influence);
    const offX = this.offX[i] ?? 0;
    const offY = this.offY[i] ?? 0;
    this.offX[i] = offX + (influence.shiftX - offX) * OFFSET_EASE;
    this.offY[i] = offY + (influence.shiftY - offY) * OFFSET_EASE;
    return influence.grow;
  }

  private nearestStar(x: number, y: number): number {
    let nearest = Infinity;
    for (const star of this.options.dipper) nearest = Math.min(nearest, Math.hypot(x - star.x, y - star.y));
    return nearest;
  }

  /** Вытягивание по скорости: цель min(MAX, |v|·K), сглаживание и направление — по шагу за кадр. */
  private updateStretch(i: number, x: number, y: number): void {
    // Без памяти о прошлом кадре (первый кадр, после ресайза) скорость считаем нулевой
    const prevX = this.hasPrevious ? (this.prevX[i] ?? x) : x;
    const prevY = this.hasPrevious ? (this.prevY[i] ?? y) : y;
    this.prevX[i] = x;
    this.prevY[i] = y;
    const vx = x - prevX;
    const vy = y - prevY;
    const speed = Math.hypot(vx, vy);
    const current = this.stretch[i] ?? 0;
    this.stretch[i] = current + (Math.min(STRETCH_MAX, speed * STRETCH_PER_PX) - current) * STRETCH_EASE;
    if (speed >= 0.05) this.turnDirection(i, vx / speed, vy / speed);
  }

  /** Направление вытягивания плавно поворачивается к направлению скорости (ux, uy) и нормируется. */
  private turnDirection(i: number, ux: number, uy: number): void {
    const dirX = this.dirX[i] ?? 1;
    const dirY = this.dirY[i] ?? 0;
    const dx = dirX + (ux - dirX) * STRETCH_EASE;
    const dy = dirY + (uy - dirY) * STRETCH_EASE;
    const length = Math.hypot(dx, dy) || 1;
    this.dirX[i] = dx / length;
    this.dirY[i] = dy / length;
  }
}

/** Всё, что общее для капель кадра. Создаётся раз на кадр, не на каплю. */
interface DropFrame {
  readonly input: InkStep;
  readonly goal: Int16Array;
  readonly goalDepth: Float32Array;
  readonly goalShift: Float32Array | undefined;
  readonly projector: Projector;
  readonly grid: InkGrid;
  readonly tau: number;
}
