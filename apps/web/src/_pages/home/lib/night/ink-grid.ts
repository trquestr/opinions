import type { Size } from './layout';

/*
 * Сетка капель для полноэкранного шейдера туши (тот же приём, что у бюста до a89f4a3).
 * Экран делится на ячейки CELL_PX × CELL_PX; в каждой до SLOTS капель. Пиксель смотрит только свою ячейку и 8 соседних,
 * поэтому стоимость пикселя не зависит от общего числа капель.
 * Хранится как текстура RGBA32F ширины gridWidth и высоты gridHeight · SLOTS · 2:
 *   тексель (x, y·SLOTS·2 + 2s)     = (cx, cy, r, stretch) — центр капли в CSS-px, радиус, вытянутость;
 *   тексель (x, y·SLOTS·2 + 2s + 1) = (dirX, dirY, 0, 0)  — направление вытягивания (единичный вектор).
 * Пустой слот — r = 0: шейдер на нём останавливается, поэтому после последней капли ячейки пишется ноль.
 */
export const CELL_PX = 22;
export const SLOTS = 32;
const TEXEL = 4;
/** Капля больше ячейки не помещается в окрестность 3×3 — радиус ограничен. */
export const MAX_DROP_RADIUS_PX = CELL_PX * 0.9;

export class InkGrid {
  width = 0;
  height = 0;
  data = new Float32Array(0);
  private counts = new Uint8Array(0);

  resize(view: Size): void {
    this.width = Math.ceil(view.width / CELL_PX) + 1;
    this.height = Math.ceil(view.height / CELL_PX) + 1;
    this.data = new Float32Array(this.width * this.height * SLOTS * 2 * TEXEL);
    this.counts = new Uint8Array(this.width * this.height);
  }

  /** Высота текстуры в текселях. */
  get textureHeight(): number {
    return this.height * SLOTS * 2;
  }

  begin(): void {
    this.counts.fill(0);
  }

  /** Добавляет каплю; вне экрана или в переполненной ячейке — пропускает. */
  add(x: number, y: number, drop: Float32Array): void {
    const row = this.reserveRow(x, y);
    if (row < 0) return;
    const gx = Math.floor(x / CELL_PX);
    const at = this.texelIndex(gx, row);
    const next = this.texelIndex(gx, row + 1);
    this.data[at] = x;
    this.data[at + 1] = y;
    this.data[at + 2] = drop[0] ?? 0;
    this.data[at + 3] = drop[1] ?? 0;
    // Направление — во второй тексель слота: та же колонка, следующая строка текстуры (не соседний тексель)
    this.data[next] = drop[2] ?? 1;
    this.data[next + 1] = drop[3] ?? 0;
  }

  /** Занимает слот в ячейке точки и возвращает строку его первого текселя; −1 — вне экрана или ячейка полна. */
  private reserveRow(x: number, y: number): number {
    const gx = Math.floor(x / CELL_PX);
    const gy = Math.floor(y / CELL_PX);
    if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return -1;
    const cell = gy * this.width + gx;
    const slot = this.counts[cell] ?? SLOTS;
    if (slot >= SLOTS) return -1;
    this.counts[cell] = slot + 1;
    return gy * SLOTS * 2 + slot * 2;
  }

  /** Ставит терминатор r = 0 после последней капли каждой неполной ячейки (данные прошлого кадра не читаются). */
  end(): void {
    for (let cell = 0; cell < this.counts.length; cell++) {
      const slot = this.counts[cell] ?? SLOTS;
      if (slot >= SLOTS) continue;
      const gx = cell % this.width;
      const gy = (cell - gx) / this.width;
      this.data[this.texelIndex(gx, gy * SLOTS * 2 + slot * 2) + 2] = 0;
    }
  }

  private texelIndex(x: number, row: number): number {
    return (row * this.width + x) * TEXEL;
  }
}
