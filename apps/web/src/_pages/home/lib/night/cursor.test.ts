import { describe, expect, it } from 'vitest';
import { Cursor, CURSOR_RADIUS_PX } from './cursor';
import type { Influence } from './cursor';

function influenceAt(cursor: Cursor, x: number, y: number): Influence {
  const out: Influence = { shiftX: 0, shiftY: 0, grow: 1 };
  cursor.influence(x, y, out);
  return out;
}

/** Курсор, прошедший от (90, 100) к (100, 100): vx = 10 · 0,35 = 3,5. */
function movingCursor(): Cursor {
  const cursor = new Cursor();
  cursor.move(90, 100);
  cursor.move(100, 100);
  return cursor;
}

describe('Cursor: скорость', () => {
  it('первое движение скорости не даёт', () => {
    const cursor = new Cursor();

    cursor.move(50, 50);

    expect(cursor.vx).toBe(0);
    expect(cursor.isInside).toBe(true);
  });

  it('сглаживает скорость: за кадр набирается 35% разности положений', () => {
    const cursor = movingCursor();

    expect(cursor.vx).toBeCloseTo(3.5, 5);
    expect(cursor.vy).toBe(0);
  });

  it('скорость затухает на каждом кадре до 85%', () => {
    const cursor = movingCursor();

    cursor.tick(32);

    expect(cursor.vx).toBeCloseTo(2.975, 5);
  });
});

describe('Cursor: влияние на каплю', () => {
  it('под курсором капля набухает на 35% и сносится на 0,7 скорости', () => {
    const out = influenceAt(movingCursor(), 100, 100);

    expect(out.grow).toBeCloseTo(1.35, 5);
    expect(out.shiftX).toBeCloseTo(2.45, 5);
    expect(out.shiftY).toBe(0);
  });

  it('на полпути к границе влияние слабее', () => {
    const out = influenceAt(movingCursor(), 160, 100);

    expect(out.grow).toBeCloseTo(1.14716, 4);
    expect(out.shiftX).toBeCloseTo(1.225, 5);
  });

  it('за радиусом влияния нет', () => {
    const out = influenceAt(movingCursor(), 100 + CURSOR_RADIUS_PX, 100);

    expect(out).toEqual({ shiftX: 0, shiftY: 0, grow: 1 });
  });

  it('после leave влияния нет', () => {
    const cursor = movingCursor();

    cursor.leave();

    expect(influenceAt(cursor, 100, 100)).toEqual({ shiftX: 0, shiftY: 0, grow: 1 });
  });

  it('снос ограничен 36 px', () => {
    const cursor = new Cursor();
    cursor.move(0, 0);
    cursor.move(1000, 0);

    expect(influenceAt(cursor, 1000, 0).shiftX).toBeCloseTo(36, 5);
  });
});

describe('Cursor: волна щелчка', () => {
  it('на половине жизни толкает каплю у фронта наружу и раздувает её', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 0);
    cursor.tick(425);

    const out = influenceAt(cursor, 250, 0);

    expect(out.shiftX).toBeCloseTo(40, 1);
    expect(out.shiftY).toBe(0);
    expect(out.grow).toBeCloseTo(1.175, 3);
  });

  it('толкает в сторону от центра волны', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 0);
    cursor.tick(425);

    expect(influenceAt(cursor, -250, 0).shiftX).toBeCloseTo(-40, 1);
  });

  it('каплю далеко от фронта волна не трогает', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 0);
    cursor.tick(425);

    expect(influenceAt(cursor, 10, 0)).toEqual({ shiftX: 0, shiftY: 0, grow: 1 });
  });

  it('через 850 мс волны нет', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 0);
    cursor.tick(850);

    expect(influenceAt(cursor, 250, 0)).toEqual({ shiftX: 0, shiftY: 0, grow: 1 });
  });
});

describe('Cursor: активность', () => {
  it('до первого события неактивен', () => {
    expect(new Cursor().isActive()).toBe(false);
  });

  it('сразу после щелчка активен, пока идёт волна', () => {
    const cursor = new Cursor();
    cursor.click(10, 10, 0);
    cursor.tick(849);

    expect(cursor.isActive()).toBe(true);
  });
});

describe('Cursor: активность после волны', () => {
  it('через 850 мс после щелчка неактивен', () => {
    const cursor = new Cursor();
    cursor.click(10, 10, 0);
    cursor.tick(850);

    expect(cursor.isActive()).toBe(false);
  });

  it('движение мыши без щелчка активность не включает', () => {
    const cursor = new Cursor();
    cursor.move(10, 10);
    cursor.tick(0);

    expect(cursor.isActive()).toBe(false);
  });
});

describe('Cursor: крайние случаи волны', () => {
  it('волна, начавшаяся в будущем, ещё не действует', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 500);
    cursor.tick(0);

    expect(influenceAt(cursor, 100, 0)).toEqual({ shiftX: 0, shiftY: 0, grow: 1 });
  });

  it('в самом центре волны капля не сдвигается', () => {
    const cursor = new Cursor();
    cursor.click(0, 0, 0);
    cursor.tick(100);

    expect(influenceAt(cursor, 0, 0).shiftX).toBe(0);
  });
});
