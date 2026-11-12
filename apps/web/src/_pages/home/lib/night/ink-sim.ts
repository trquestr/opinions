import { FIXED_POINT, INK_STRIDE } from './ink';
import { MAX_DROP_RADIUS_PX } from './ink-grid';
import { createRandom } from './stars';
import type { Cursor, Influence } from './cursor';
import type { InkGrid } from './ink-grid';
import type { Bounds, Layout, Point } from './layout';

/*
 * Движение капель туши ночной сцены. Считается на процессоре (как у бюста): шейдеру туши нужны готовые центры,
 * радиусы и вытянутость капель, разложенные по сетке (ink-grid.ts). За кадр ничего не создаётся — только
 * заранее выделенные типизированные массивы (требование 60 FPS). Формулы — в единицах ковша.
 *
 * СМЕНА ФИГУР — по времени, а не по скроллу (скролл только выбирает цель). Так смена всегда длится TRANSITION_MS,
 * как бы быстро ни крутили колесо. Если цель сменилась посреди перехода, капли поворачивают к новой цели
 * с того места, где они сейчас (снимок положений), — без рывка.
 *
 * Путь капли i за переход, τ = (t − t₀)/T ∈ [0, 1]:
 *   уход:    λ = smoothstep(0, 1, (τ − 0.26·k_A − 0.06·h₁) / 0.32) — капли отрываются волной слева направо
 *            (k_A — положение капли в старой фигуре по x, 0…1);
 *   приход:  α = smoothstep(0, 1, (τ − 0.34 − 0.26·k_B − 0.06·h₂) / 0.32) — оседают так же, волной слева направо;
 *   место:   P = mix(mix(A, V(t), λ), B, α), радиус r = mix(mix(r_A, r_V, λ), r_B, α).
 * V(t) — галактика с двумя спиральными рукавами вокруг центра ковша C: кольцо радиуса ρᵢ = R_V·(0.25 + 0.75·√lᵢ),
 *   угол θ = θ₀ᵢ + ωᵢ·t, ωᵢ = 0.9 / (0.35 + lᵢ) рад/с — внутренние кольца быстрее внешних (закрутка, как у
 *   Кеплера), диск сплющен по вертикали в 0.32 раза — видим его под углом;
 *   V = C + (ρ·cos θ, 0.32·ρ·sin θ + 6·(h₁ − 0.5)); в галактике капля — пыль: r_V = (0.10 + 0.12·h₂) · глубина,
 *   глубина = 0.8 + 0.4·(0.5 + 0.5·sin θ) — ближняя сторона диска крупнее.
 * «Подплывание» к линиям зрителя идёт напрямую, без галактики (λ = 0, приход волной на всём отрезке).
 */

const TAU = Math.PI * 2;
const SEED = 11;
/** Длительность смены фигуры и «подплывания» к линиям зрителя, без анимации — быстрая смена на месте. */
const TRANSITION_MS = 3200;
const DIRECT_TRANSITION_MS = 1800;
const REDUCED_TRANSITION_MS = 900;
/** Радиус галактики в долях ширины общих границ фигур. */
const VORTEX_RADIUS_SHARE = 0.42;
const VORTEX_FLATTEN = 0.32;
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
  /** Идти к цели напрямую, без галактики («подплывание» к линиям зрителя). */
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
  /** Центр галактики — центр ковша. */
  readonly center: Point;
  /** Семь звёзд ковша: вокруг них тушь расступается. */
  readonly dipper: readonly Point[];
  /** Общие границы фигур: по ним считается волна «слева направо» и радиус галактики. */
  readonly bounds: Bounds;
  /** Множитель радиуса капель на экране (см. scene.ts). */
  readonly radiusScale: number;
}

interface Placement {
  x: number;
  y: number;
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
  private readonly place: Placement = { x: 0, y: 0, r: 0 };
  private readonly goal: Placement = { x: 0, y: 0, r: 0 };
  private readonly influence: Influence = { shiftX: 0, shiftY: 0, grow: 1 };
  private readonly options: InkSimulationOptions;
  private readonly vortexRadius: number;
  private target = -1;
  private isDirect = false;
  private startMs = 0;
  private driftFrom = 0;
  private hasCurrent = false;
  private hasPrevious = false;
  /** Положение текущей капли до сноса курсором, px (поля, а не объект — без аллокаций на каплю). */
  private baseX = 0;
  private baseY = 0;

  constructor(count: number, options: InkSimulationOptions) {
    this.count = count;
    this.options = options;
    this.vortexRadius = (options.bounds.maxX - options.bounds.minX) * VORTEX_RADIUS_SHARE;
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
    this.prevX = new Float32Array(count);
    this.prevY = new Float32Array(count);
    this.stretch = new Float32Array(count);
    this.offX = new Float32Array(count);
    this.offY = new Float32Array(count);
    this.dirX = new Float32Array(count).fill(1);
    this.dirY = new Float32Array(count);
  }

  setState(index: number, data: Int16Array): void {
    this.states[index] = data;
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
  step(input: InkStep, layout: Layout, grid: InkGrid): void {
    grid.begin();
    const goal = this.states[input.target] ?? this.states[0];
    if (goal) {
      this.retargetIfNeeded(input, goal);
      const tau = Math.min(1, (input.nowMs - this.startMs) / this.duration(input.isReducedMotion));
      const frame: DropFrame = { input, goal, layout, grid, tau };
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
  private retargetIfNeeded(input: InkStep, goal: Int16Array): void {
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
      return;
    }
    for (let i = 0; i < this.count; i++) {
      readInto(goal, i, this.goal);
      this.fromX[i] = this.goal.x;
      this.fromY[i] = this.goal.y;
      this.fromR[i] = this.goal.r;
    }
  }

  private stepDrop(i: number, frame: DropFrame): void {
    const { layout, grid, input } = frame;
    const p = this.place;
    readInto(frame.goal, i, this.goal);
    if (input.isReducedMotion) this.placeStill(i, frame.tau);
    else this.placeMoving(i, frame);
    this.curX[i] = p.x;
    this.curY[i] = p.y;
    this.curR[i] = p.r;
    this.applyDrift(i, frame);
    this.applyHover(input, this.seedB[i] ?? 0);
    const clear = smoothstep((this.nearestStar(p.x, p.y) - CLEAR_INNER) / (CLEAR_OUTER - CLEAR_INNER));
    this.baseX = layout.originX + p.x * layout.scale;
    this.baseY = layout.originY + p.y * layout.scale;
    const pull = this.applyCursor(i, input.cursor);
    const x = this.baseX + (this.offX[i] ?? 0);
    const y = this.baseY + (this.offY[i] ?? 0);
    const radius = Math.min(p.r * clear * layout.scale * this.options.radiusScale * pull, MAX_DROP_RADIUS_PX);
    this.updateStretch(i, x, y);
    if (radius < MIN_VISIBLE_PX) return;
    this.drop[0] = radius;
    this.drop[1] = this.stretch[i] ?? 0;
    this.drop[2] = this.dirX[i] ?? 1;
    this.drop[3] = this.dirY[i] ?? 0;
    grid.add(x, y, this.drop);
  }

  /** Доля положения по x в общих границах фигур: 0 — левый край, 1 — правый. */
  private keyOf(x: number): number {
    const { minX, maxX } = this.options.bounds;
    return Math.min(1, Math.max(0, (x - minX) / (maxX - minX)));
  }

  /** Уход в галактику и приход в цель волнами (формулы — в заголовке файла). */
  private placeMoving(i: number, { tau, input }: DropFrame): void {
    const h1 = this.seedA[i] ?? 0;
    const h2 = this.seedB[i] ?? 0;
    const fromX = this.fromX[i] ?? 0;
    const fromY = this.fromY[i] ?? 0;
    const fromR = this.fromR[i] ?? 0;
    const g = this.goal;
    const arrive = this.isDirect
      ? smoothstep((tau - 0.3 * this.keyOf(g.x) - 0.1 * h2) / 0.6)
      : smoothstep((tau - 0.34 - 0.26 * this.keyOf(g.x) - 0.06 * h2) / 0.32);
    const leave = this.isDirect ? 0 : smoothstep((tau - 0.26 * this.keyOf(fromX) - 0.06 * h1) / 0.32);
    const p = this.place;
    this.vortexAt(i, input.nowMs / 1000, fromR > 0 || g.r > 0);
    const midX = fromX + (p.x - fromX) * leave;
    const midY = fromY + (p.y - fromY) * leave;
    const midR = fromR + (p.r - fromR) * leave;
    p.x = midX + (g.x - midX) * arrive;
    p.y = midY + (g.y - midY) * arrive;
    p.r = midR + (g.r - midR) * arrive;
  }

  /** Место капли в галактике в момент t (с): пишет в place. Невидимая в обеих фигурах капля и тут невидима. */
  private vortexAt(i: number, t: number, isVisible: boolean): void {
    const h1 = this.seedA[i] ?? 0;
    const h2 = this.seedB[i] ?? 0;
    const layer = this.seedC[i] ?? 0;
    const rho = this.vortexRadius * (0.25 + 0.75 * Math.sqrt(layer));
    // Два спиральных рукава: θ₀ = π·(рукав) + 0.5·(h₁ − 0.5)·π/2 + 2.2·ln(ρ/ρ_min); дифференциальное вращение их докручивает
    const arm = h2 < 0.5 ? 0 : Math.PI;
    const theta0 = arm + (h1 - 0.5) * 0.8 + 2.2 * Math.log(rho / (this.vortexRadius * 0.25));
    const theta = theta0 + (0.9 / (0.35 + layer)) * t;
    const depth = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin(theta));
    const p = this.place;
    p.x = this.options.center.x + Math.cos(theta) * rho;
    p.y = this.options.center.y + Math.sin(theta) * rho * VORTEX_FLATTEN + 6 * (h1 - 0.5);
    p.r = isVisible ? (0.1 + 0.12 * h2) * depth : 0;
  }

  /** Без анимации: капля гаснет на старом месте и проступает на новом, без полёта. */
  private placeStill(i: number, tau: number): void {
    const p = this.place;
    const g = this.goal;
    const isLeaving = tau < 0.5;
    p.x = isLeaving ? (this.fromX[i] ?? 0) : g.x;
    p.y = isLeaving ? (this.fromY[i] ?? 0) : g.y;
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
  readonly layout: Layout;
  readonly grid: InkGrid;
  readonly tau: number;
}
