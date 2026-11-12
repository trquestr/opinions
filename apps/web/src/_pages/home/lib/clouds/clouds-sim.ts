import type { CloudsFrame } from './timeline';

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

/** Затухание рывка от скролла, 1/с: v = v·exp(−k·dt). */
const DRAG_COEFFICIENT = 2.8;
/** Рывок: скорость капель (px/с) на пиксель прокрутки. */
const SCROLL_IMPULSE_FACTOR = 3.6;
const MAX_IMPULSE_SPEED = 1800;
/** Курсор расталкивает капли в этом радиусе; сдвиг возвращается к нулю с затуханием OFFSET_DECAY (1/с). */
const REPULSION_RADIUS_PX = 110;
const REPULSION_SPEED = 620;
const OFFSET_DECAY = 2.2;
/** Капля появляется и исчезает за краем экрана и проступает на первых FADE_PX пути. */
const EDGE_MARGIN_PX = 48;
const FADE_PX = 70;
/** Доля капель дальнего плана (под облаками): они мельче и медленнее. */
const BACK_SHARE = 0.42;
/** Капля включается по своей очереди плавно, на этом отрезке доли капель. */
const RANK_FADE = 0.08;

function sliceOf(arrays: ParticleSlice, from: number, to: number): ParticleSlice {
  return {
    count: to - from,
    x: arrays.x.subarray(from, to),
    y: arrays.y.subarray(from, to),
    radius: arrays.radius.subarray(from, to),
    alpha: arrays.alpha.subarray(from, to),
    dirX: arrays.dirX.subarray(from, to),
    dirY: arrays.dirY.subarray(from, to),
    stretch: arrays.stretch.subarray(from, to),
  };
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

interface StepEnv {
  readonly dt: number;
  readonly ctx: SimContext;
  readonly frame: CloudsFrame;
  /** Высота пути капли: экран плюс поля за краями. */
  readonly travelPx: number;
  readonly offsetDecay: number;
}

/**
 * Капли туши поднимаются снизу вверх (мотив сцены: мысли поднимаются снизу).
 *
 * Каждая капля идёт по своей дорожке lane (доля ширины) и хранит место на пути travel ∈ [0, 1): 0 — под нижним
 * краем, 1 — над верхним. Скорость вверх (px/с):
 *   v = base·rise + impulse·factor
 * base — своя скорость всплытия, rise — множитель из таймлайна; impulse — общий рывок от скролла со знаком
 * (скролл назад ведёт капли вниз), затухает как exp(−DRAG·dt). Дойдя до края, капля входит с другого на новой дорожке.
 * Память выделяется один раз во Float32Array (без аллокаций в rAF).
 * Капли разделены на эшелон ПОД облаками (back) и эшелон НАД облаками (front).
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

  private readonly lane: Float32Array;
  private readonly travel: Float32Array;
  private readonly baseSpeed: Float32Array;
  private readonly speedFactor: Float32Array;
  private readonly swayAmp: Float32Array;
  private readonly swayFreq: Float32Array;
  private readonly swayPhase: Float32Array;
  private readonly offsetX: Float32Array;
  private readonly offsetY: Float32Array;
  /** Очередь включения: капля видна, когда доля капель кадра больше её rank. */
  private readonly rank: Float32Array;
  private impulse = 0;
  private timeSeconds = 0;

  constructor(options: SimOptions) {
    this.count = options.count;
    this.backCount = Math.floor(this.count * BACK_SHARE);
    this.frontCount = this.count - this.backCount;

    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.alpha = new Float32Array(this.count);
    this.dirX = new Float32Array(this.count);
    this.dirY = new Float32Array(this.count);
    this.stretch = new Float32Array(this.count);
    this.back = sliceOf(this, 0, this.backCount);
    this.front = sliceOf(this, this.backCount, this.count);

    this.lane = new Float32Array(this.count);
    this.travel = new Float32Array(this.count);
    this.baseSpeed = new Float32Array(this.count);
    this.speedFactor = new Float32Array(this.count);
    this.swayAmp = new Float32Array(this.count);
    this.swayFreq = new Float32Array(this.count);
    this.swayPhase = new Float32Array(this.count);
    this.offsetX = new Float32Array(this.count);
    this.offsetY = new Float32Array(this.count);
    this.rank = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.initParticle(i);
    }
  }

  private initParticle(i: number): void {
    const isBack = i < this.backCount;
    const groupStart = isBack ? 0 : this.backCount;
    const groupCount = isBack ? this.backCount : this.frontCount;
    // Очередь внутри своего эшелона: при любой доле капель оба плана заполнены поровну
    this.rank[i] = ((i - groupStart) / Math.max(1, groupCount)) * (1 - RANK_FADE);
    this.lane[i] = Math.random();
    this.travel[i] = Math.random();
    this.baseSpeed[i] = isBack ? 18 + Math.random() * 32 : 30 + Math.random() * 60;
    this.speedFactor[i] = isBack ? 0.45 + Math.random() * 0.9 : 0.8 + Math.random() * 1.4;
    this.radius[i] = isBack ? 1.2 + Math.random() * 1.5 : 1.8 + Math.random() * 2.4;
    this.swayAmp[i] = 6 + Math.random() * 16;
    this.swayFreq[i] = 0.25 + Math.random() * 0.5;
    this.swayPhase[i] = Math.random() * Math.PI * 2;
    this.dirX[i] = 0;
    this.dirY[i] = -1;
  }

  /** Рывок от скролла: вниз по странице — капли вверх, назад — вниз. */
  addScrollImpulse(deltaScrollPx: number): void {
    const next = this.impulse + deltaScrollPx * SCROLL_IMPULSE_FACTOR;
    this.impulse = Math.min(MAX_IMPULSE_SPEED, Math.max(-MAX_IMPULSE_SPEED, next));
  }

  step(dt: number, frame: CloudsFrame, ctx: SimContext): void {
    if (frame.stage <= 0) {
      this.alpha.fill(0);
      return;
    }
    this.timeSeconds += dt;
    this.impulse *= Math.exp(-DRAG_COEFFICIENT * dt);
    if (Math.abs(this.impulse) < 0.1) this.impulse = 0;

    const env: StepEnv = {
      dt,
      ctx,
      frame,
      travelPx: ctx.height + EDGE_MARGIN_PX * 2,
      offsetDecay: Math.exp(-OFFSET_DECAY * dt),
    };
    for (let i = 0; i < this.count; i++) {
      this.stepParticle(i, env);
    }
  }

  /** Двигает каплю по пути и возвращает её скорость вверх, px/с. */
  private advance(i: number, env: StepEnv): number {
    const speed = (this.baseSpeed[i] ?? 0) * env.frame.rise + this.impulse * (this.speedFactor[i] ?? 1);
    const next = (this.travel[i] ?? 0) + (speed * env.dt) / env.travelPx;
    if (next < 0 || next >= 1) {
      this.lane[i] = Math.random();
      this.offsetX[i] = 0;
      this.offsetY[i] = 0;
    }
    this.travel[i] = wrap01(next);
    return speed;
  }

  /** Курсор отталкивает каплю; накопленный сдвиг плавно возвращается к нулю. */
  private repel(i: number, env: StepEnv): void {
    const { cursor } = env.ctx;
    const dx = (this.x[i] ?? 0) - cursor.x;
    const dy = (this.y[i] ?? 0) - cursor.y;
    const distance = Math.hypot(dx, dy);
    if (cursor.isInside && distance < REPULSION_RADIUS_PX && distance > 1) {
      const push = (1 - distance / REPULSION_RADIUS_PX) * REPULSION_SPEED * env.dt;
      this.offsetX[i] = (this.offsetX[i] ?? 0) + (dx / distance) * push;
      this.offsetY[i] = (this.offsetY[i] ?? 0) + (dy / distance) * push;
    }
    this.offsetX[i] = (this.offsetX[i] ?? 0) * env.offsetDecay;
    this.offsetY[i] = (this.offsetY[i] ?? 0) * env.offsetDecay;
  }

  private place(i: number, env: StepEnv): void {
    const sway = Math.sin((this.swayPhase[i] ?? 0) + this.timeSeconds * (this.swayFreq[i] ?? 0));
    this.x[i] = (this.lane[i] ?? 0) * env.ctx.width + sway * (this.swayAmp[i] ?? 0) + (this.offsetX[i] ?? 0);
    const pathY = env.ctx.height + EDGE_MARGIN_PX - (this.travel[i] ?? 0) * env.travelPx;
    this.y[i] = pathY + (this.offsetY[i] ?? 0);
  }

  /** Капля вытягивается вдоль хода: stretch → min(1.2, |v| / 200), сглаженно; острым концом назад. */
  private shape(i: number, speed: number, dt: number): void {
    const target = Math.min(1.2, Math.abs(speed) / 200);
    const eased = (this.stretch[i] ?? 0) + (target - (this.stretch[i] ?? 0)) * (1 - Math.pow(0.5, dt * 60));
    this.stretch[i] = eased < 0.005 ? 0 : eased;
    this.dirY[i] = speed < 0 ? 1 : -1;
  }

  private fade(i: number, env: StepEnv): void {
    const pathPx = (this.travel[i] ?? 0) * env.travelPx;
    const edgeFade = Math.min(1, pathPx / FADE_PX, (env.travelPx - pathPx) / FADE_PX);
    const rankFade = Math.min(1, Math.max(0, (env.frame.dropsFraction - (this.rank[i] ?? 0)) / RANK_FADE));
    this.alpha[i] = Math.max(0, edgeFade) * rankFade * env.frame.dropsVisibility * env.frame.stage;
  }

  private stepParticle(i: number, env: StepEnv): void {
    const speed = this.advance(i, env);
    this.repel(i, env);
    this.place(i, env);
    this.shape(i, speed, env.dt);
    this.fade(i, env);
  }
}
