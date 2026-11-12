/*
 * Курсор и тушь фигур ночной сцены — поведение как у бюста до a89f4a3. Сами капли курсора (клякса) — cursor-field.ts.
 * Звёзд это не касается: сюда приходят только капли туши.
 *
 * Влияние на каплю на расстоянии d от курсора (px), близость prox = 1 − d/R при d < R:
 *   набухание:  r ← r · (1 + GROW · prox^1.25);
 *   снос:       цель смещения = v · 0.7 · prox (v — скорость курсора, px за кадр), длина ограничена 0.3·R;
 *               смещение капли догоняет цель экспоненциально (OFFSET_EASE за кадр) — капли тянутся и возвращаются;
 *   волна щелчка: фронт f = Rw · (1 − (1 − τ)^2.2), τ — доля прожитой волны; в полосе |d − f| < band
 *               пульс p = cos((d − f)/band · π/2) · (1 − τ) толкает каплю от центра на p · 0.25·Rw и раздувает её.
 */
export const CURSOR_RADIUS_PX = 120;
const GROW = 0.35;
const DRAG = 0.7;
const MAX_SHIFT_PX = CURSOR_RADIUS_PX * 0.3;
const WAVE_MS = 850;
const WAVE_RADIUS_PX = 320;
const MAX_WAVES = 4;
/** Скорость курсора сглаживается и затухает, когда он стоит (доля за кадр). */
const VELOCITY_EASE = 0.35;
const VELOCITY_DECAY = 0.85;

/** Влияние курсора на одну каплю: смещение (px) и множитель радиуса. Скретч — переиспользуется без аллокаций. */
export interface Influence {
  shiftX: number;
  shiftY: number;
  grow: number;
}

export class Cursor {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  isInside = false;
  private readonly waveX = new Float32Array(MAX_WAVES);
  private readonly waveY = new Float32Array(MAX_WAVES);
  private readonly waveStart = new Float64Array(MAX_WAVES).fill(-Infinity);
  private nextWave = 0;
  private now = 0;
  /** Точка, для которой сейчас считается влияние (чтобы не создавать объект на каждую каплю). */
  private sampleX = 0;
  private sampleY = 0;

  /** Движение мыши: скорость — сглаженная разность положений. */
  move(x: number, y: number): void {
    if (this.isInside) {
      this.vx += (x - this.x - this.vx) * VELOCITY_EASE;
      this.vy += (y - this.y - this.vy) * VELOCITY_EASE;
    }
    this.x = x;
    this.y = y;
    this.isInside = true;
  }

  leave(): void {
    this.isInside = false;
  }

  click(x: number, y: number, now: number): void {
    this.waveX[this.nextWave] = x;
    this.waveY[this.nextWave] = y;
    this.waveStart[this.nextWave] = now;
    this.nextWave = (this.nextWave + 1) % MAX_WAVES;
  }

  /** Начало кадра: время для волн и следа, затухание скорости. */
  tick(now: number): void {
    this.now = now;
    this.vx *= VELOCITY_DECAY;
    this.vy *= VELOCITY_DECAY;
  }

  /** Идёт ли волна щелчка (нужен следующий кадр). */
  isActive(): boolean {
    let latest = -Infinity;
    for (const at of this.waveStart) latest = Math.max(latest, at);
    return this.now - latest < WAVE_MS;
  }

  /** Влияние на каплю в точке (x, y) px; пишет в out. */
  influence(x: number, y: number, out: Influence): void {
    out.shiftX = 0;
    out.shiftY = 0;
    out.grow = 1;
    this.sampleX = x;
    this.sampleY = y;
    if (this.isInside) this.applyPointer(out);
    for (let w = 0; w < MAX_WAVES; w++) this.applyWave(w, out);
  }

  private applyPointer(out: Influence): void {
    const d = Math.hypot(this.sampleX - this.x, this.sampleY - this.y);
    if (d >= CURSOR_RADIUS_PX) return;
    const prox = 1 - d / CURSOR_RADIUS_PX;
    out.grow *= 1 + GROW * prox ** 1.25;
    const sx = this.vx * DRAG;
    const sy = this.vy * DRAG;
    const length = Math.hypot(sx, sy);
    const limit = length > MAX_SHIFT_PX ? MAX_SHIFT_PX / length : 1;
    out.shiftX += sx * limit * prox;
    out.shiftY += sy * limit * prox;
  }

  private applyWave(w: number, out: Influence): void {
    const tau = (this.now - (this.waveStart[w] ?? -Infinity)) / WAVE_MS;
    if (tau < 0 || tau >= 1) return;
    const dx = this.sampleX - (this.waveX[w] ?? 0);
    const dy = this.sampleY - (this.waveY[w] ?? 0);
    const d = Math.hypot(dx, dy);
    const band = WAVE_RADIUS_PX * 0.28;
    const offset = d - WAVE_RADIUS_PX * (1 - (1 - tau) ** 2.2);
    if (d < 0.1 || Math.abs(offset) >= band) return;
    const pulse = Math.cos((offset / band) * (Math.PI / 2)) * (1 - tau);
    out.shiftX += (dx / d) * pulse * WAVE_RADIUS_PX * 0.25;
    out.shiftY += (dy / d) * pulse * WAVE_RADIUS_PX * 0.25;
    out.grow *= 1 + 0.35 * pulse;
  }
}
