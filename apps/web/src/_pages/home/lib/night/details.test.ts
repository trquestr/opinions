import { describe, expect, it } from 'vitest';
import {
  createDetailSlot,
  DETAIL_ALPHA,
  detailDirection,
  detailOpacity,
  detailVisibility,
  placeDetail,
  solidValue,
} from './details';
import { Projector } from './projection';
import { frameAt } from './timeline';
import type { NightFrame } from './timeline';
import type { NightDetail } from '../../model/night-details';

/** Обзорная поза: камера смотрит прямо вперёд, опора в центре экрана 1000×800. */
function createProjector(): Projector {
  const projector = new Projector();
  projector.setView(1000, 800);
  projector.setPose({
    yaw: 0,
    pitch: 0,
    distance: 100,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    anchorX: 500,
    anchorY: 400,
    skyYaw: 0,
    skyPitch: 0,
  });
  return projector;
}

function nightDetail(patch: Partial<NightDetail> = {}): NightDetail {
  return { name: 'test', yawDeg: 0, pitchDeg: 0, widthDeg: 10, ...patch };
}

function loadedSlot(aspect: number) {
  const slot = createDetailSlot();
  slot.aspect = aspect;
  return slot;
}

/** Кадр с заданной видимостью неба; остальное — из таймлайна. */
function frameWith(patch: Partial<NightFrame>): NightFrame {
  return { ...frameAt(0), ...patch };
}

describe('placeDetail', () => {
  it('направление прямо вперёд ложится в центр экрана, ширина = f · tg(угол)', () => {
    const projector = createProjector();
    const slot = loadedSlot(1);

    placeDetail(projector, nightDetail(), slot);

    const width = projector.focal * Math.tan((10 * Math.PI) / 180);
    expect(slot.widthPx).toBeCloseTo(width);
    expect(slot.x + slot.widthPx / 2).toBeCloseTo(500);
    expect(slot.y + slot.widthPx / 2).toBeCloseTo(400);
    expect(slot.isVisible).toBe(true);
  });

  it('высота берётся из пропорций картинки: широкая деталь стоит по центру своей высоты', () => {
    const slot = loadedSlot(2);

    placeDetail(createProjector(), nightDetail(), slot);

    expect(slot.y + slot.widthPx / 2 / 2).toBeCloseTo(400);
  });

  it('положительное рыскание уводит деталь вправо, положительный тангаж — вниз', () => {
    const slot = loadedSlot(1);

    placeDetail(createProjector(), nightDetail({ yawDeg: 20, pitchDeg: 10 }), slot);

    expect(slot.x + slot.widthPx / 2).toBeGreaterThan(500);
    expect(slot.y + slot.widthPx / 2).toBeGreaterThan(400);
  });

  it('деталь за спиной камеры скрыта', () => {
    const slot = loadedSlot(1);

    placeDetail(createProjector(), nightDetail({ yawDeg: 170 }), slot);

    expect(slot.isVisible).toBe(false);
  });

  it('пока картинка не загружена (aspect = 0), деталь не видна и не даёт NaN', () => {
    const slot = createDetailSlot();

    placeDetail(createProjector(), nightDetail(), slot);

    expect(slot.isVisible).toBe(false);
    expect(Number.isFinite(slot.y)).toBe(true);
  });
});

describe('detailDirection', () => {
  it('нулевые углы дают взгляд вперёд (0, 0, 1)', () => {
    const out = { x: 9, y: 9, z: 9 };

    detailDirection(nightDetail(), out);

    expect(out).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('рыскание 90° даёт направление строго вправо', () => {
    const out = { x: 0, y: 0, z: 0 };

    detailDirection(nightDetail({ yawDeg: 90 }), out);

    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });
});

describe('прозрачность деталей', () => {
  it('деталь = видимость неба × потолок', () => {
    expect(detailOpacity(frameWith({ sky: 0.5 }), nightDetail())).toBeCloseTo(0.5 * DETAIL_ALPHA);
    expect(detailOpacity(frameWith({ sky: 1 }), nightDetail())).toBeCloseTo(DETAIL_ALPHA);
    expect(detailOpacity(frameWith({ sky: 0 }), nightDetail())).toBe(0);
  });

  it('собственная яркость детали (alpha) множит её прозрачность', () => {
    expect(detailOpacity(frameWith({ sky: 1 }), nightDetail({ alpha: 0.6 }))).toBeCloseTo(DETAIL_ALPHA * 0.6);
  });

  it('усиленная деталь не становится прозрачнее единицы', () => {
    expect(detailOpacity(frameWith({ sky: 1 }), nightDetail({ alpha: 5 }))).toBe(1);
  });

  it('видимость — значение sky таймлайна, от фигуры не зависит', () => {
    expect(detailVisibility(frameWith({ sky: 0.4, figure: 3 }))).toBe(0.4);
  });
});

describe('solidValue', () => {
  it('до половины видимости сплошной части нет, дальше она растёт до потолка подложки', () => {
    expect([0, 0.25, 0.5, 0.75, 1].map(solidValue)).toEqual([0, 0, 0, 0.06, 0.12]);
  });

  it('значения вне диапазона обрезаются', () => {
    expect(solidValue(-1)).toBe(0);
    expect(solidValue(3)).toBe(0.12);
  });
});
