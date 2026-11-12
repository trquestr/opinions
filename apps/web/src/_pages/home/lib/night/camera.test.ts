import { describe, expect, it } from 'vitest';
import {
  Camera,
  CAMERA_MS,
  figureAnchor,
  figureBounds,
  figureShot,
  figureSide,
  figureSkyTurn,
  figureYaw,
  overviewShot,
} from './camera';
import manifest from './night-manifest.json';
import { Projector, SKY_FOLLOW } from './projection';
import type { Shot } from './camera';

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

describe('figureYaw', () => {
  it('слева положительное, справа отрицательное, по модулю равны и меньше 45°', () => {
    expect(figureYaw('left')).toBeGreaterThan(0);
    expect(figureYaw('right')).toBe(-figureYaw('left'));
    expect(figureYaw('left')).toBeLessThan(Math.PI / 4);
  });

  it('без фигуры (общий план) рыскание нулевое', () => {
    expect(figureYaw(null)).toBe(0);
  });

  it('кадр фигуры использует то же рыскание', () => {
    const shot = figureShot(
      { view: VIEW, focal: 1000, key: 1 },
      { state: 1, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, side: 'right' },
    );

    expect(shot.pose.yaw).toBe(figureYaw('right'));
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

describe('figureShot', () => {
  const bounds = { minX: -27.5, minY: -6.1, maxX: 107.8, maxY: 54.6 };
  const input = { view: VIEW, focal: 1000, key: 7 };

  it('смотрит в центр рамки фигуры, опора — на трети экрана', () => {
    const shot = figureShot(input, { state: 1, bounds, side: 'left' });

    expect(shot.key).toBe(7);
    expect(shot.pose.targetX).toBeCloseTo(40.15, 5);
    expect(shot.pose.targetY).toBeCloseTo(24.25, 5);
    expect(shot.pose.targetZ).toBe(0);
    expect(shot.pose.anchorX).toBeCloseTo(489.6, 3);
    expect(shot.pose.anchorY).toBeCloseTo(423, 3);
  });

  it('расстояние D = f / s: рамка шириной 135,3 занимает 56% ширины экрана', () => {
    const shot = figureShot(input, { state: 1, bounds, side: 'left' });

    // s = 0,56 · 1440 / 135,3 = 5,96009; D = 1000 / s
    expect(shot.pose.distance).toBeCloseTo(167.78, 1);
  });

  it('высокая рамка ограничена 66% высоты экрана', () => {
    const shot = figureShot(input, {
      state: 1,
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 200 },
      side: 'left',
    });

    // s = 594 / 200 = 2,97; D = 1000 / 2,97
    expect(shot.pose.distance).toBeCloseTo(336.7, 1);
  });

  it.each([
    ['left', 1],
    ['right', -1],
  ] as const)('фигура на стороне %s: знак рыскания %s, без наклона', (side, sign) => {
    const shot = figureShot(input, { state: 1, bounds, side });

    expect(Math.sign(shot.pose.yaw)).toBe(sign);
    expect(Math.abs(shot.pose.yaw)).toBeLessThan(Math.PI / 4);
    expect(shot.pose.pitch).toBe(0);
  });
});

describe('sway у кадров', () => {
  const input = { view: VIEW, focal: 1000, key: 1 };

  it('общий план качается, кадр фигуры — нет', () => {
    const overview = overviewShot(input, { originX: 0, originY: 0, scale: 5 });
    const figure = figureShot(input, {
      state: 1,
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      side: 'left',
    });

    expect(overview.sway).toBe(1);
    expect(figure.sway).toBe(0);
  });
});

describe('figureShot: перспектива', () => {
  const bounds = { minX: -27.5, minY: -6.1, maxX: 107.8, maxY: 54.6 };
  const input = { view: VIEW, focal: 1000, key: 1 };

  function edgeScales(side: 'left' | 'right'): { minEdge: number; maxEdge: number } {
    const projector = new Projector();
    projector.setView(VIEW.width, VIEW.height);
    projector.setPose(figureShot(input, { state: 1, bounds, side }).pose);
    const middleY = (bounds.minY + bounds.maxY) / 2;
    return {
      minEdge: projector.project({ x: bounds.minX, y: middleY, z: 0 }, { x: 0, y: 0, k: 0 }).k,
      maxEdge: projector.project({ x: bounds.maxX, y: middleY, z: 0 }, { x: 0, y: 0, k: 0 }).k,
    };
  }

  it('фигура слева: внешний (левый) край крупнее внутреннего', () => {
    const { minEdge, maxEdge } = edgeScales('left');

    expect(minEdge).toBeGreaterThan(maxEdge);
  });

  it('фигура справа: внешний (правый) край крупнее внутреннего', () => {
    const { minEdge, maxEdge } = edgeScales('right');

    expect(maxEdge).toBeGreaterThan(minEdge);
  });
});

describe('overviewShot', () => {
  it('смотрит прямо, опора в центре экрана, цель — место, которое плоская раскладка ставит в центр', () => {
    const shot = overviewShot(
      { view: { width: 1000, height: 800 }, focal: 1500, key: 3 },
      { originX: 100, originY: 50, scale: 10 },
    );

    expect(shot.key).toBe(3);
    expect(shot.pose.yaw).toBe(0);
    expect(shot.pose.pitch).toBe(0);
    expect(shot.pose.anchorX).toBe(500);
    expect(shot.pose.anchorY).toBe(400);
    expect(shot.pose.distance).toBeCloseTo(150, 8);
    expect(shot.pose.targetX).toBeCloseTo(40, 8);
    expect(shot.pose.targetY).toBeCloseTo(35, 8);
  });
});

const START: Shot = {
  key: 1,
  sway: 0,
  pose: {
    yaw: 0,
    pitch: 0,
    distance: 100,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    anchorX: 400,
    anchorY: 300,
    skyYaw: 0,
    skyPitch: 0,
  },
};
const TARGET: Shot = {
  key: 2,
  sway: 0,
  pose: {
    yaw: 0.4,
    pitch: 0.2,
    distance: 200,
    targetX: 10,
    targetY: 20,
    targetZ: 0,
    anchorX: 1000,
    anchorY: 500,
    skyYaw: 0,
    skyPitch: 0,
  },
};
const T0 = 1000;
const HOLD_MS = 8000;

function cameraAt(shot: Shot = START): Camera {
  const camera = new Camera();
  camera.snap(shot);
  return camera;
}

describe('Camera', () => {
  it('snap ставит ракурс как есть, без хода', () => {
    const camera = cameraAt();

    expect(camera.current).toEqual(START.pose);
    expect(camera.progress(0)).toBe(1);
    expect(camera.update(0)).toBe(false);
  });

  it('первый aim вместо хода ставит ракурс, как snap', () => {
    const camera = new Camera();

    camera.aim(START, 0);

    expect(camera.current).toEqual(START.pose);
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

  it('skyLag: в начале хода небо отстаёт на всю разницу углов, к концу хода отставание исчезает', () => {
    const camera = cameraAt();
    const target: Shot = { ...TARGET, pose: { ...TARGET.pose, skyYaw: 0.1, skyPitch: -0.05 } };
    camera.aim(target, T0);
    const lag = { yaw: 0, pitch: 0 };

    camera.update(T0);
    camera.skyLag(lag);
    expect(lag.yaw).toBeCloseTo(-(0.4 * SKY_FOLLOW + 0.1));
    expect(lag.pitch).toBeCloseTo(-(0.2 * SKY_FOLLOW - 0.05));

    camera.update(T0 + CAMERA_MS);
    camera.skyLag(lag);
    expect(lag.yaw).toBeCloseTo(0);
    expect(lag.pitch).toBeCloseTo(0);
  });

  it('в начале хода ракурс прежний, update сообщает о движении', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0);

    expect(isMoving).toBe(true);
    expect(camera.current).toEqual(START.pose);
  });

  it('на середине хода поля смешаны наполовину, а расстояние больше: камера отъехала', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    camera.update(T0 + CAMERA_MS / 2);

    expect(camera.current.yaw).toBeCloseTo(0.2, 8);
    expect(camera.current.pitch).toBeCloseTo(0.1, 8);
    expect(camera.current.targetX).toBeCloseTo(5, 8);
    expect(camera.current.anchorX).toBeCloseTo(700, 8);
    // смесь 150, дуга делит на 1 − 0,14 = 0,86
    expect(camera.current.distance).toBeCloseTo(174.4186, 3);
  });

  it('в момент прихода ракурс равен цели, а наезд ещё не начался', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS);

    expect(camera.current.distance).toBeCloseTo(200, 8);
    expect(camera.current.yaw).toBeCloseTo(0.4, 8);
    expect(camera.current.anchorX).toBeCloseTo(1000, 8);
    expect(isMoving).toBe(false);
  });

  it('на стоянке камера медленно наезжает и облетает, update сообщает о движении', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS + HOLD_MS / 2);

    // h = smoothstep(0,5) = 0,5: D = 200 / 1,0175; ψ = 0,4 + 0,03
    expect(camera.current.distance).toBeCloseTo(196.56, 2);
    expect(camera.current.yaw).toBeCloseTo(0.43, 8);
    expect(isMoving).toBe(true);
  });

  it('через 8 с стоянки наезд полный: D / 1,035 и облёт на 0,06 рад, камера успокаивается', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS + HOLD_MS);

    expect(camera.current.distance).toBeCloseTo(193.237, 2);
    expect(camera.current.yaw).toBeCloseTo(0.46, 8);
    expect(isMoving).toBe(false);
  });

  it('тот же ключ цели ничего не меняет', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    camera.aim({ ...START, key: TARGET.key }, T0 + 500);
    camera.update(T0 + CAMERA_MS);

    expect(camera.current.distance).toBeCloseTo(200, 8);
  });

  it('смена цели посреди хода начинается с текущего ракурса, а не с исходного', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);
    camera.update(T0 + CAMERA_MS / 2);
    const retarget: Shot = {
      key: 3,
      sway: 0,
      pose: {
        yaw: 0,
        pitch: 0,
        distance: 50,
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        anchorX: 0,
        anchorY: 0,
        skyYaw: 0,
        skyPitch: 0,
      },
    };

    camera.aim(retarget, T0 + CAMERA_MS / 2);
    camera.update(T0 + CAMERA_MS / 2);

    expect(camera.current.distance).toBeCloseTo(174.4186, 3);
    camera.update(T0 + CAMERA_MS / 2 + CAMERA_MS);
    expect(camera.current.distance).toBeCloseTo(50, 8);
  });
});

const SWAYING: Shot = { ...START, key: 5, sway: 1 };
const DEGREES_5 = (5 * Math.PI) / 180;
const DEGREES_2 = (2 * Math.PI) / 180;

describe('Camera: покачивание общего плана', () => {
  it('в момент 3,5 с рыскание отклоняется ровно на 5° (четверть периода 14 с)', () => {
    const camera = cameraAt(SWAYING);

    const isMoving = camera.update(3500);

    expect(camera.current.yaw).toBeCloseTo(DEGREES_5, 8);
    expect(Math.abs(camera.current.pitch)).toBeLessThanOrEqual(DEGREES_2);
    expect(camera.current.pitch).not.toBe(0);
    expect(isMoving).toBe(true);
  });

  it('поза со временем меняется', () => {
    const camera = cameraAt(SWAYING);

    camera.update(0);
    const before = camera.current.yaw;
    camera.update(3500);

    expect(camera.current.yaw).not.toBeCloseTo(before, 3);
  });

  it('кадр фигуры не качается и после прихода камера успокаивается', () => {
    const camera = cameraAt(START);

    const isMoving = camera.update(3500);

    expect(camera.current.yaw).toBe(0);
    expect(camera.current.pitch).toBe(0);
    expect(isMoving).toBe(false);
  });

  it('isStill отключает покачивание и сообщает о покое', () => {
    const camera = cameraAt(SWAYING);

    const isMoving = camera.update(3500, true);

    expect(camera.current.yaw).toBe(0);
    expect(camera.current.pitch).toBe(0);
    expect(isMoving).toBe(false);
  });

  it('isStill отключает и наезд стоянки: расстояние остаётся целевым', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const isMoving = camera.update(T0 + CAMERA_MS + HOLD_MS, true);

    expect(camera.current.distance).toBeCloseTo(200, 8);
    expect(camera.current.yaw).toBeCloseTo(0.4, 8);
    expect(isMoving).toBe(false);
  });

  it('при ходе от общего плана к фигуре покачивание гаснет вместе с ходом: на середине вес 0,5', () => {
    const camera = cameraAt(SWAYING);
    camera.aim(TARGET, 1900);

    camera.update(3500);

    // база 0,2 (середина между 0 и 0,4) + вес 0,5 · 5° · sin(π/2)
    expect(camera.current.yaw).toBeCloseTo(0.2 + 0.5 * DEGREES_5, 8);
  });

  it('новый ход после покачивания начинается с текущего веса', () => {
    const camera = cameraAt(SWAYING);
    camera.aim(TARGET, 1900);
    camera.update(3500);

    camera.aim({ ...SWAYING, key: 9 }, 3500);
    camera.update(3500);

    // старт нового хода: текущий ракурс (0,2 + 0,5·5°) и вес 0,5 даёт ещё 0,5·5° поверх
    expect(camera.current.yaw).toBeCloseTo(0.2 + DEGREES_5, 8);
  });
});

describe('Camera: взгляд за курсором', () => {
  it('setLook добавляется к рысканию и наклону позы', () => {
    const camera = cameraAt();
    camera.setLook(0.1, 0.05);

    camera.update(0);

    expect(camera.current.yaw).toBeCloseTo(0.1, 8);
    expect(camera.current.pitch).toBeCloseTo(0.05, 8);
  });

  it('новый ход после setLook не удваивает взгляд', () => {
    const camera = cameraAt();
    camera.setLook(0.1, 0.05);
    camera.update(0);

    camera.aim(TARGET, T0);
    camera.update(T0);

    expect(camera.current.yaw).toBeCloseTo(0.1, 8);
    expect(camera.current.pitch).toBeCloseTo(0.05, 8);
  });

  it('взгляд, возвращённый в ноль, возвращает позу', () => {
    const camera = cameraAt();
    camera.setLook(0.1, 0.05);
    camera.update(0);

    camera.setLook(0, 0);
    camera.update(0);

    expect(camera.current).toEqual(START.pose);
  });
});

describe('figureSkyTurn', () => {
  const DEGREE = Math.PI / 180;

  it('у каждой из четырёх фигур свой угол неба: стороны по горизонтали, первые две — вверх, последние — вниз', () => {
    expect(figureSkyTurn(1, 'left')).toEqual({ yaw: 4 * DEGREE, pitch: -8 * DEGREE });
    expect(figureSkyTurn(2, 'right')).toEqual({ yaw: -4 * DEGREE, pitch: -8 * DEGREE });
    expect(figureSkyTurn(3, 'left')).toEqual({ yaw: 4 * DEGREE, pitch: 8 * DEGREE });
    expect(figureSkyTurn(4, 'right')).toEqual({ yaw: -4 * DEGREE, pitch: 8 * DEGREE });
  });

  it('кадр фигуры несёт её доворот неба, общий план — нулевой', () => {
    const input = { view: { width: 1600, height: 900 }, focal: 1400, key: 1 };
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 60 };

    const figure = figureShot(input, { state: 3, bounds, side: 'left' });
    const overview = overviewShot(input, { scale: 4, originX: 100, originY: 50 });

    expect(figure.pose.skyYaw).toBeCloseTo(4 * DEGREE);
    expect(figure.pose.skyPitch).toBeCloseTo(8 * DEGREE);
    expect(overview.pose.skyYaw).toBe(0);
    expect(overview.pose.skyPitch).toBe(0);
  });
});

describe('Camera: skyDrift', () => {
  it('на старте перехода равен нулю, а по мере хода равен сдвигу неба от исходной позы', () => {
    const camera = cameraAt();
    camera.aim(TARGET, T0);

    const drift = { yaw: 0, pitch: 0 };
    camera.update(T0);
    camera.skyDrift(drift);
    expect(drift.yaw).toBeCloseTo(0, 8);
    expect(drift.pitch).toBeCloseTo(0, 8);

    camera.update(T0 + 5000);
    camera.skyDrift(drift);
    const expectedYaw = (TARGET.pose.yaw - START.pose.yaw) * 0.33 + (TARGET.pose.skyYaw - START.pose.skyYaw);
    const expectedPitch =
      (TARGET.pose.pitch - START.pose.pitch) * 0.33 + (TARGET.pose.skyPitch - START.pose.skyPitch);
    expect(drift.yaw).toBeCloseTo(expectedYaw, 6);
    expect(drift.pitch).toBeCloseTo(expectedPitch, 6);
  });
});
