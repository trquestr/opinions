import type { CloudsFrame } from './timeline';
import { computeUBowlCenter } from './wordmark-zoom';

export interface CursorState {
  readonly x: number;
  readonly y: number;
  readonly isInside: boolean;
}

export interface SimContext {
  readonly cursor: CursorState;
  readonly width: number;
  readonly height: number;
}

export interface SimOptions {
  readonly count: number;
  readonly isSmallScreen: boolean;
}

const DRAG_COEFFICIENT = 2.8; // Коэффициент затухания инерции (1/с)
const SCROLL_IMPULSE_FACTOR = 3.6; // Множитель рывка от скорости скролла
const REPULSION_RADIUS_PX = 90;
const REPULSION_FORCE = 320;

interface StepEnv {
  readonly cx: number;
  readonly cy: number;
  readonly dt: number;
  readonly dragDecay: number;
  readonly ctx: SimContext;
  readonly frame: CloudsFrame;
}

interface ParticlePos {
  readonly x: number;
  readonly y: number;
}

/** Отклоняет каплю туши от курсора мыши при наведении. */
function applyCursorRepulsion(pos: ParticlePos, cursor: CursorState, dt: number): ParticlePos {
  if (!cursor.isInside) return pos;
  const dx = pos.x - cursor.x;
  const dy = pos.y - cursor.y;
  const d = Math.hypot(dx, dy);
  if (d < REPULSION_RADIUS_PX && d > 1) {
    const force = (1 - d / REPULSION_RADIUS_PX) * REPULSION_FORCE * dt;
    return { x: pos.x + (dx / d) * force, y: pos.y + (dy / d) * force };
  }
  return pos;
}

interface ParticleVelocity {
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
}

function computeParticleDir(ang: number, v: ParticleVelocity): { dx: number; dy: number } {
  if (v.speed > 4.0) {
    const vLen = Math.hypot(v.vx, v.vy) || 1;
    return { dx: v.vx / vLen, dy: v.vy / vLen };
  }
  const rawX = Math.cos(ang);
  const rawY = Math.sin(ang) * 0.78;
  const dLen = Math.hypot(rawX, rawY) || 1;
  return { dx: rawX / dLen, dy: rawY / dLen };
}

function updateStretchValue(current: number, crawlSpeed: number, dt: number): number {
  const targetStretch = Math.min(1.2, crawlSpeed / 200);
  const sEase = 1 - Math.pow(0.5, dt * 60);
  const next = current + (targetStretch - current) * sEase;
  return next < 0.005 ? 0 : next;
}

export interface ParticleSlice {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly alpha: Float32Array;
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;
  readonly stretch: Float32Array;
}

/**
 * Радиальная симуляция капель туши (разлёт из центра с разной скоростью, рывком и инерцией).
 * Память выделяется один раз во Float32Array (без аллокаций в rAF).
 * Частицы разделены на эшелон ПОД облаками (back) и эшелон НАД облаками (front).
 */
export class CloudsSimulation {
  readonly count: number;
  readonly backCount: number;
  readonly frontCount: number;
  readonly back: ParticleSlice;
  readonly front: ParticleSlice;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly alpha: Float32Array;
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;
  readonly stretch: Float32Array;

  // Радиальные координаты и динамика
  private readonly angle: Float32Array;
  private readonly dist: Float32Array;
  private readonly radialV: Float32Array;
  private readonly speedFactor: Float32Array;
  private readonly baseRadius: Float32Array;
  private readonly maxDist: Float32Array;

  constructor(options: SimOptions) {
    this.count = options.count;
    this.backCount = Math.floor(this.count * 0.42);
    this.frontCount = this.count - this.backCount;

    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.alpha = new Float32Array(this.count);
    this.dirX = new Float32Array(this.count);
    this.dirY = new Float32Array(this.count);
    this.stretch = new Float32Array(this.count);

    this.back = {
      count: this.backCount,
      x: this.x.subarray(0, this.backCount),
      y: this.y.subarray(0, this.backCount),
      radius: this.radius.subarray(0, this.backCount),
      alpha: this.alpha.subarray(0, this.backCount),
      dirX: this.dirX.subarray(0, this.backCount),
      dirY: this.dirY.subarray(0, this.backCount),
      stretch: this.stretch.subarray(0, this.backCount),
    };
    this.front = {
      count: this.frontCount,
      x: this.x.subarray(this.backCount, this.count),
      y: this.y.subarray(this.backCount, this.count),
      radius: this.radius.subarray(this.backCount, this.count),
      alpha: this.alpha.subarray(this.backCount, this.count),
      dirX: this.dirX.subarray(this.backCount, this.count),
      dirY: this.dirY.subarray(this.backCount, this.count),
      stretch: this.stretch.subarray(this.backCount, this.count),
    };

    this.angle = new Float32Array(this.count);
    this.dist = new Float32Array(this.count);
    this.radialV = new Float32Array(this.count);
    this.speedFactor = new Float32Array(this.count);
    this.baseRadius = new Float32Array(this.count);
    this.maxDist = new Float32Array(this.count);

    this.initParticles();
  }

  private initParticles(): void {
    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, 0.15 + (i / this.count) * 0.70);
    }
  }

  /**
   * Сбрасывает частицу в центр (или на случайное начальное расстояние при старте).
   */
  private resetParticle(i: number, initialProgress = 0): void {
    this.angle[i] = Math.random() * Math.PI * 2;
    const isBack = i < this.backCount;
    this.speedFactor[i] = isBack ? 0.45 + Math.random() * 1.6 : 0.6 + Math.random() * 2.0;
    this.baseRadius[i] = isBack ? 1.2 + Math.random() * 1.5 : 1.8 + Math.random() * 2.2;
    this.maxDist[i] = 450 + Math.random() * 450;
    this.dist[i] = initialProgress * (this.maxDist[i] ?? 600);
    this.radialV[i] = 0;
    this.alpha[i] = 0;
    this.x[i] = 0;
    this.y[i] = 0;
    this.dirX[i] = Math.cos(this.angle[i] ?? 0);
    this.dirY[i] = Math.sin(this.angle[i] ?? 0);
    this.stretch[i] = 0;
  }

  /**
   * Передаёт импульс от скролла («рывок»): частицы получают радиальное ускорение наружу,
   * пропорциональное скорости прокрутки и индивидуальному фактору скорости.
   */
  addScrollImpulse(deltaScrollPx: number): void {
    const impulse = Math.min(1400, Math.abs(deltaScrollPx) * SCROLL_IMPULSE_FACTOR);
    for (let i = 0; i < this.count; i++) {
      const speed = this.speedFactor[i] ?? 1;
      const currentV = this.radialV[i] ?? 0;
      this.radialV[i] = Math.min(2200, currentV + impulse * speed);
    }
  }

  /**
   * Шаг физики за время dt:
   * 1) инерция затухает по закону v = v * exp(-drag * dt);
   * 2) радиус растёт только от скорости импульса: r += v * dt (в покое частицы стоят);
   * 3) частицы, вылетевшие за край экрана, возрождаются в центре.
   */
  step(dt: number, frame: CloudsFrame, ctx: SimContext): void {
    if (frame.stage <= 0) {
      this.alpha.fill(0);
      return;
    }

    const { cx, cy } = this.computeCenterOrigin(frame, ctx);
    const dragDecay = Math.exp(-DRAG_COEFFICIENT * dt);
    const env: StepEnv = { cx, cy, dt, dragDecay, ctx, frame };

    for (let i = 0; i < this.count; i++) {
      this.stepParticle(i, env);
    }
  }

  private computeCenterOrigin(frame: CloudsFrame, ctx: SimContext): { cx: number; cy: number } {
    if (frame.u <= 0.55) {
      const bowl = computeUBowlCenter(ctx.width, ctx.height);
      const p = Math.min(1, Math.max(0, frame.u / 0.5));
      return {
        cx: bowl.x + (ctx.width * 0.5 - bowl.x) * p,
        cy: bowl.y + (ctx.height * 0.5 - bowl.y) * p,
      };
    }
    return {
      cx: ctx.width * 0.5,
      cy: ctx.height * 0.48,
    };
  }

  private advanceRadialDistance(i: number, dt: number, dragDecay: number): number {
    const currentV = (this.radialV[i] ?? 0) * dragDecay;
    this.radialV[i] = currentV < 0.1 ? 0 : currentV;
    let r = (this.dist[i] ?? 0) + this.radialV[i] * dt;
    const maxR = this.maxDist[i] ?? 650;
    if (r >= maxR) {
      this.resetParticle(i, 0.05);
      r = this.dist[i] ?? 20;
    }
    this.dist[i] = r;
    return r;
  }

  private computeScreenCoord(i: number, r: number, env: StepEnv): ParticlePos {
    const ang = this.angle[i] ?? 0;
    const rawX = env.cx + Math.cos(ang) * r;
    const rawY = env.cy + Math.sin(ang) * r * 0.78;
    return applyCursorRepulsion({ x: rawX, y: rawY }, env.ctx.cursor, env.dt);
  }

  private applyFluidMotion(i: number, pos: ParticlePos, dt: number): void {
    const isFirstStep = (this.x[i] ?? 0) === 0 && (this.y[i] ?? 0) === 0;
    const prevX = isFirstStep ? pos.x : (this.x[i] ?? pos.x);
    const prevY = isFirstStep ? pos.y : (this.y[i] ?? pos.y);
    const vx = pos.x - prevX;
    const vy = pos.y - prevY;
    const speed = Math.hypot(vx, vy) / Math.max(0.001, dt);

    const dir = computeParticleDir(this.angle[i] ?? 0, { vx, vy, speed });
    this.dirX[i] = dir.dx;
    this.dirY[i] = dir.dy;
    this.stretch[i] = updateStretchValue(this.stretch[i] ?? 0, speed, dt);
    this.x[i] = pos.x;
    this.y[i] = pos.y;
  }

  private applyParticleAppearance(i: number, r: number, frame: CloudsFrame): void {
    const maxR = this.maxDist[i] ?? 650;
    const bRad = this.baseRadius[i] ?? 2.5;
    this.radius[i] = bRad * (1.0 + Math.min(0.3, r / 500));

    const enterFade = Math.min(1, r / 35);
    const exitFade = Math.min(1, Math.max(0, (maxR - r) / (maxR * 0.15)));
    const cloudsFade = frame.cloudsVisibility > 0 ? frame.cloudsVisibility : 1.0 - frame.wordmarkOpacity;
    this.alpha[i] = enterFade * exitFade * frame.stage * Math.max(0.4, cloudsFade);
  }

  private stepParticle(i: number, env: StepEnv): void {
    const r = this.advanceRadialDistance(i, env.dt, env.dragDecay);
    const pos = this.computeScreenCoord(i, r, env);
    this.applyFluidMotion(i, pos, env.dt);
    this.applyParticleAppearance(i, r, env.frame);
  }
}
