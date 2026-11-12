import { describe, expect, it } from 'vitest';
import { Camera, CAMERA_MS, figureAnchor, figureBounds, figureFrame, figureSide } from './camera';
import type { Shot } from './camera';
import { unitsToPx } from './layout';
import manifest from './night-manifest.json';

const VIEW = { width: 1440, height: 900 };

describe('figureSide', () => {
  it.each([
    [1, 'left'],
    [2, 'right'],
    [3, 'left'],
    [4, 'right'],
  ])('фигура %s стоит на стороне %s — напротив текста', (state, side) => {
    expect(figureSide(state)).toBe(side);
  });

  it.each([0, 5])('у состояния %s фигуры нет — общий план', (state) => {
    expect(figureSide(state)).toBeNull();
  });
});

describe('figureBounds', () => {
  it('рамка медведицы — первая запись манифеста', () => {
    expect(figureBounds(1)).toEqual(manifest.figureBounds[0]);
  });

  it.each([0, 5])('у состояния %s рамки нет', (state) => {
    expect(figureBounds(state)).toBeNull();
  });
});

describe('figureFrame', () => {
  const bounds = { minX: -27.5, minY: -6.1, maxX: 107.8, maxY: 54.6 };

  it('масштаб ограничен 56% ширины: рамка 135,3 единицы занимает 806,4 px', () => {
    const layout = figureFrame(VIEW, bounds, 'left');

    expect(layout.scale).toBeCloseTo(5.9601, 3);
    expect(135.3 * layout.scale).toBeCloseTo(806.4, 1);
  });

  it('центр рамки слева стоит в (489,6; 423) на экране 1440×900', () => {
    const layout = figureFrame(VIEW, bounds, 'left');

    const center = unitsToPx(layout, { x: 40.15, y: 24.25 });

    expect(center.x).toBeCloseTo(489.6, 3);
    expect(center.y).toBeCloseTo(423, 3);
  });

  it('центр рамки справа стоит в (950,4; 423)', () => {
    const layout = figureFrame(VIEW, bounds, 'right');

    const center = unitsToPx(layout, { x: 40.15, y: 24.25 });

    expect(center.x).toBeCloseTo(950.4, 3);
  });

  it('высокая рамка ограничена 66% высоты: 200 единиц занимают 594 px', () => {
    const layout = figureFrame(VIEW, { minX: 0, minY: 0, maxX: 100, maxY: 200 }, 'left');

    expect(layout.scale).toBeCloseTo(2.97, 5);
    expect(200 * layout.scale).toBeCloseTo(594, 3);
  });
});

describe('figureAnchor', () => {
  it('слева — (0,34·W; 0,47·H), справа — (0,66·W; 0,47·H)', () => {
    const left = figureAnchor(VIEW, 'left');
    const right = figureAnchor(VIEW, 'right');

    expect(left.x).toBeCloseTo(489.6, 3);
    expect(left.y).toBeCloseTo(423, 3);
    expect(right.x).toBeCloseTo(950.4, 3);
  });
});

/** Кадр общего плана: масштаб 2, опора (400, 300). */
const START: Shot = { frame: { originX: 100, originY: 200, scale: 2 }, key: 1, anchor: { x: 400, y: 300 } };
/** Кадр фигуры: масштаб 4, опора (1000, 500). */
const TARGET: Shot = { frame: { originX: 300, originY: 100, scale: 4 }, key: 2, anchor: { x: 1000, y: 500 } };
const T0 = 1000;
const HOLD_MS = 8000;

function cameraAt(shot: Shot = START): Camera {
  const camera = new Camera();
  camera.snap(shot);
  return camera;
}

describe('Camera', () => {
  it('snap ставит кадр с полным наездом стоянки k = 1,035 вокруг опоры', () => {
    const camera = cameraAt();

    // s' = 2·1,035; O' = A + (O − A)·1,035
    expect(camera.current.scale).toBeCloseTo(2.07, 5);
    expect(camera.current.originX).toBeCloseTo(89.5, 5);
    expect(camera.current.originY).toBeCloseTo(196.5, 5);
  });

  it('после snap ход закончен: progress равен 1, а наезд ещё не идёт', () => {
    const camera = cameraAt();

    expect(camera.progress(0)).toBe(1);
    expect(camera.update(0)).toBe(false);
  });

  it('первый aim вместо хода ставит кадр, как snap', () => {
    const camera = new Camera();

    camera.aim(START, 0);

    expect(camera.current.scale).toBeCloseTo(2.07, 5);
    expect(camera.progress(0)).toBe(1);
  });

  it('progress растёт от 0 до 1 за 3200 мс и не выходит за пределы', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    expect(camera.progress(T0 - 500)).toBe(0);
    expect(camera.progress(T0)).toBe(0);
    expect(camera.progress(T0 + CAMERA_MS / 2)).toBeCloseTo(0.5, 5);
    expect(camera.progress(T0 + CAMERA_MS * 3)).toBe(1);
  });

  it('в начале хода кадр прежний, update сообщает о движении', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0);

    expect(isMoving).toBe(true);
    expect(camera.current.scale).toBeCloseTo(2.07, 5);
  });

  it('на середине хода камера отъехала: масштаб меньше смеси кадров', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    camera.update(T0 + CAMERA_MS / 2);

    // смесь (2,07 + 4)/2 = 3,035; дуга 1 − 0,14 = 0,86
    expect(camera.current.scale).toBeCloseTo(2.6101, 4);
  });

  it('в момент прихода кадр равен цели с k = 1, наезд только начинается', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS);

    expect(camera.current.scale).toBeCloseTo(4, 5);
    expect(camera.current.originX).toBeCloseTo(300, 5);
    expect(camera.current.originY).toBeCloseTo(100, 5);
    expect(isMoving).toBe(true);
  });

  it('через 8 с стоянки кадр наехал на 1,035 вокруг опоры и update сообщает покой', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS + HOLD_MS);

    // O' = A + (O − A)·1,035 = (1000 − 724,5; 500 − 414)
    expect(camera.current.scale).toBeCloseTo(4.14, 5);
    expect(camera.current.originX).toBeCloseTo(275.5, 5);
    expect(camera.current.originY).toBeCloseTo(86, 5);
    expect(isMoving).toBe(false);
  });

  it('тот же ключ цели ничего не меняет', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    camera.aim({ ...START, key: TARGET.key }, T0 + 500);
    camera.update(T0 + CAMERA_MS);

    expect(camera.current.scale).toBeCloseTo(4, 5);
  });

  it('смена цели посреди хода начинается с текущего кадра, а не с исходного', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);
    camera.update(T0 + CAMERA_MS / 2);
    const retarget: Shot = { frame: { originX: 0, originY: 0, scale: 1 }, key: 3, anchor: { x: 0, y: 0 } };

    camera.aim(retarget, T0 + CAMERA_MS / 2);
    camera.update(T0 + CAMERA_MS / 2);

    expect(camera.current.scale).toBeCloseTo(2.6101, 4);
    camera.update(T0 + CAMERA_MS / 2 + CAMERA_MS);
    expect(camera.current.scale).toBeCloseTo(1, 5);
  });
});
