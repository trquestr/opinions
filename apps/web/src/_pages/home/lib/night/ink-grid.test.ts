import { describe, expect, it } from 'vitest';
import { CELL_PX, InkGrid, SLOTS } from './ink-grid';

/** Экран 100×50: 6×4 ячеек, 64 строки текселей на ячейку, текстура 6×256. */
function createGrid(): InkGrid {
  const grid = new InkGrid();
  grid.resize({ width: 100, height: 50 });
  return grid;
}

/** Капля: r = 5, stretch = 0.25, dir = (0.75, 0.5) — все значения точно представимы во float32. */
function drop(r = 5): Float32Array {
  return Float32Array.of(r, 0.25, 0.75, 0.5);
}

/** Индекс первого числа текселя (x, row) в data при ширине сетки 6. */
function texel(x: number, row: number): number {
  return (row * 6 + x) * 4;
}

describe('InkGrid.resize', () => {
  it('считает размер сетки как ceil(размер / 22) + 1', () => {
    const grid = createGrid();

    expect(CELL_PX).toBe(22);
    expect(grid.width).toBe(6);
    expect(grid.height).toBe(4);
  });

  it('для размера, кратного ячейке, тоже добавляет одну ячейку запаса', () => {
    const grid = new InkGrid();

    grid.resize({ width: 44, height: 22 });

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
  });

  it('выделяет текстуру 4 числа на тексель, 64 строки на ячейку', () => {
    const grid = createGrid();

    expect(SLOTS).toBe(32);
    expect(grid.textureHeight).toBe(256);
    expect(grid.data).toHaveLength(6 * 256 * 4);
  });
});

describe('InkGrid.add', () => {
  it('пишет центр, радиус и вытянутость в первый тексель слота', () => {
    const grid = createGrid();
    grid.begin();

    grid.add(30, 25, drop());

    // ячейка (1, 1), слот 0 → строка 64
    expect(Array.from(grid.data.slice(texel(1, 64), texel(1, 64) + 4))).toEqual([30, 25, 5, 0.25]);
  });

  // Известная ошибка исходника: add пишет направление сразу за вытянутостью, то есть в тексель (x + 1, строка),
  // а шейдер и заголовок ink-grid.ts ждут его в тексель (x, строка + 1). Тест описывает задуманное поведение.
  it('пишет направление во второй тексель слота', () => {
    const grid = createGrid();
    grid.begin();

    grid.add(30, 25, drop());

    expect(Array.from(grid.data.slice(texel(1, 65), texel(1, 65) + 2))).toEqual([0.75, 0.5]);
  });

  it('вторую каплю той же ячейки кладёт в следующий слот', () => {
    const grid = createGrid();
    grid.begin();

    grid.add(30, 25, drop(5));
    grid.add(31, 26, drop(6));

    expect(Array.from(grid.data.slice(texel(1, 66), texel(1, 66) + 4))).toEqual([31, 26, 6, 0.25]);
  });

  it.each([
    [-1, 5],
    [5, -1],
    [1000, 5],
    [5, 1000],
  ])('игнорирует каплю вне экрана (%s, %s)', (x, y) => {
    const grid = createGrid();
    grid.begin();

    grid.add(x, y, drop());
    grid.end();

    expect(grid.data.every((value) => value === 0)).toBe(true);
  });

  it('игнорирует 33-ю каплю в одной ячейке', () => {
    const grid = createGrid();
    grid.begin();

    Array.from({ length: 32 }, (_, i) => i + 1).forEach((r) => grid.add(5, 5, drop(r)));
    grid.add(5, 5, drop(99));
    grid.end();

    // 32-й слот ячейки (0, 0) → строка 62; 99 нигде не записано
    expect(grid.data[texel(0, 62) + 2]).toBe(32);
    expect(grid.data.includes(99)).toBe(false);
  });
});

describe('InkGrid.end и begin', () => {
  it('ставит r = 0 после последней капли неполной ячейки', () => {
    const grid = createGrid();
    grid.begin();
    grid.add(5, 5, drop(3));
    grid.add(6, 6, drop(4));
    grid.begin();
    grid.add(5, 5, drop(7));

    grid.end();

    // слот 0 перезаписан, слот 1 хранил старую r = 4 и закрыт терминатором
    expect(grid.data[texel(0, 0) + 2]).toBe(7);
    expect(grid.data[texel(0, 2) + 2]).toBe(0);
  });

  it('begin сбрасывает счётчики: пустая ячейка закрывается терминатором в нулевом слоте', () => {
    const grid = createGrid();
    grid.begin();
    grid.add(5, 5, drop(3));
    grid.end();

    grid.begin();
    grid.end();

    expect(grid.data[texel(0, 0) + 2]).toBe(0);
  });

  it('не пишет терминатор в полную ячейку', () => {
    const grid = createGrid();
    grid.begin();
    // ячейка (0, 1) начинается со строки 64 — сразу за последним слотом полной ячейки (0, 0)
    grid.add(5, 30, drop(9));
    Array.from({ length: 32 }, (_, i) => i + 1).forEach((r) => grid.add(5, 5, drop(r)));

    grid.end();

    expect(grid.data[texel(0, 62) + 2]).toBe(32);
    expect(grid.data[texel(0, 64) + 2]).toBe(9);
  });
});

describe('InkGrid.add с неполной каплей', () => {
  it('недостающие поля капли заполняются безопасными значениями', () => {
    const grid = createGrid();
    grid.begin();

    // Пустая капля: радиус и вытянутость → 0, направление по умолчанию (1, 0)
    grid.add(30, 25, new Float32Array(0));

    expect(Array.from(grid.data.slice(texel(1, 64), texel(1, 64) + 4))).toEqual([30, 25, 0, 0]);
    expect(Array.from(grid.data.slice(texel(1, 65), texel(1, 65) + 2))).toEqual([1, 0]);
  });
});
