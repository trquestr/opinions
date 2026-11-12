import { describe, expect, it } from 'vitest';
import {
  createDetailMotion,
  createDetailSlot,
  detailFade,
  detailOpacity,
  detailOutFade,
  MAX_DETAIL_OPACITY,
  placeDetail,
  shiftDetail,
} from './details';
import { DetailsLayer } from './details-layer';
import { frameAt } from './timeline';
import type { NightDetail } from '../../model/night-details';

const VIEW = { width: 1440, height: 900 };

function nightDetail(patch: Partial<NightDetail> = {}): NightDetail {
  return { name: 'test', figure: 1, corner: 'top-left', widthPx: 300, ...patch };
}

function loadedSlot(aspect: number) {
  const slot = createDetailSlot();
  slot.aspect = aspect;
  return slot;
}

function detailImage(index: number): HTMLImageElement {
  const image = document.createElement('img');
  image.dataset.index = String(index);
  Object.defineProperty(image, 'naturalWidth', { value: 800 });
  Object.defineProperty(image, 'naturalHeight', { value: 800 });
  return image;
}

describe('placeDetail', () => {
  it('угол top-left позиционирует деталь от верхнего левого края', () => {
    const slot = loadedSlot(1);

    placeDetail(VIEW, nightDetail({ corner: 'top-left', offset: [20, 10], widthPx: 300 }), slot);

    expect(slot).toMatchObject({ x: 20, y: 10, widthPx: 300, isVisible: true });
  });

  it('угол bottom-right позиционирует деталь от правого нижнего края', () => {
    const slot = loadedSlot(2);

    placeDetail(VIEW, nightDetail({ corner: 'bottom-right', widthPx: 400 }), slot);

    expect(slot.x).toBe(1440 - 400);
    expect(slot.y).toBe(900 - 200);
  });

  it('смещение offset выводит деталь за край экрана', () => {
    const slot = loadedSlot(1);

    placeDetail(VIEW, nightDetail({ corner: 'bottom-right', offset: [20, 20], widthPx: 300 }), slot);

    expect(slot.x).toBe(1440 - 300 + 20);
    expect(slot.y).toBe(900 - 300 + 20);
  });

  it('сдвиг движения камеры прибавляется к положению (входящая и уходящая фигуры раздельно)', () => {
    const slotIn = loadedSlot(1);
    const slotOut = loadedSlot(1);
    const detailIn = nightDetail({ figure: 2, offset: [20, 10] });
    const detailOut = nightDetail({ figure: 1, offset: [20, 10] });
    const motion = {
      ...createDetailMotion(),
      shiftX: -120,
      shiftY: 40,
      leavingFigure: 1,
      leavingShiftX: 85,
      leavingShiftY: -25,
    };

    placeDetail(VIEW, detailIn, slotIn);
    placeDetail(VIEW, detailOut, slotOut);
    shiftDetail(slotIn, detailIn, motion);
    shiftDetail(slotOut, detailOut, motion);

    expect(slotIn.x).toBe(20 - 120);
    expect(slotIn.y).toBe(10 + 40);
    expect(slotOut.x).toBe(20 + 85);
    expect(slotOut.y).toBe(10 - 25);
  });

  it('пока картинка не загружена (aspect = 0), деталь не видна', () => {
    const slot = createDetailSlot();

    placeDetail(VIEW, nightDetail(), slot);

    expect(slot.isVisible).toBe(false);
  });
});

describe('detailOpacity, detailFade и detailOutFade', () => {
  it('деталь своей фигуры видна вместе с фразой, умноженной на проявление и потолок яркости', () => {
    const bearFrame = frameAt(1.2);
    const full = createDetailMotion();
    const half = { ...createDetailMotion(), fade: 0.5 };

    expect(detailOpacity(bearFrame, nightDetail({ figure: 1 }), full)).toBeCloseTo(MAX_DETAIL_OPACITY);
    expect(detailOpacity(bearFrame, nightDetail({ figure: 1 }), half)).toBeCloseTo(0.5 * MAX_DETAIL_OPACITY);
    expect(detailOpacity(bearFrame, nightDetail({ figure: 1, alpha: 0.85 }), full)).toBeCloseTo(0.85);
    expect(detailOpacity(bearFrame, nightDetail({ figure: 2 }), full)).toBe(0);
  });

  it('уходящая фигура остаётся видимой по leavingFade, даже когда фраза в таймлайне уже обнулилась', () => {
    const ploughFrame = frameAt(2.0);
    const motion = { ...createDetailMotion(), fade: 0.4, leavingFigure: 1, leavingFade: 0.6 };

    expect(detailOpacity(ploughFrame, nightDetail({ figure: 1 }), motion)).toBeCloseTo(
      0.6 * MAX_DETAIL_OPACITY,
    );
    expect(detailOpacity(ploughFrame, nightDetail({ figure: 2 }), motion)).toBeCloseTo(
      0.4 * MAX_DETAIL_OPACITY,
    );
  });

  it('в общем плане детали скрыты', () => {
    expect(detailOpacity(frameAt(0.4), nightDetail({ figure: 1 }), createDetailMotion())).toBe(0);
  });

  it('проявление начинается на четверти хода камеры и плавно доходит до 1', () => {
    expect(detailFade(0)).toBe(0);
    expect(detailFade(0.25)).toBe(0);
    expect(detailFade(0.625)).toBeCloseTo(0.5);
    expect(detailFade(1)).toBe(1);
  });

  it('угасание уходящей фигуры начинается с 1 и доходит до 0 на трёх четвертях хода', () => {
    expect(detailOutFade(0)).toBe(1);
    expect(detailOutFade(0.375)).toBeCloseTo(0.5);
    expect(detailOutFade(0.75)).toBe(0);
    expect(detailOutFade(1)).toBe(0);
  });
});

describe('DetailsLayer', () => {
  it('применяет scaleX(-1) для деталей с flipX', () => {
    const image = detailImage(1); // ionic-capital (flipX)

    new DetailsLayer([image]).update(VIEW, frameAt(1.2), createDetailMotion());

    expect(image.style.transform).toContain('scaleX(-1)');
    expect(image.style.visibility).toBe('visible');
    expect(image.style.opacity).toBe(String(MAX_DETAIL_OPACITY));
  });

  it('без flipX зеркала нет, но поворот rotationDeg применяется', () => {
    const image = detailImage(2); // wheat (rotationDeg: 25)

    new DetailsLayer([image]).update(VIEW, frameAt(2.0), createDetailMotion());

    expect(image.style.transform).not.toContain('scaleX(-1)');
    expect(image.style.transform).toContain('rotate(25deg)');
  });

  it('проявление по ходу камеры множит прозрачность', () => {
    const image = detailImage(0);

    new DetailsLayer([image]).update(VIEW, frameAt(1.2), { ...createDetailMotion(), fade: 0.5 });

    expect(image.style.opacity).toBe(String(Math.round(0.5 * MAX_DETAIL_OPACITY * 100) / 100));
  });

  it('при нулевом проявлении деталь скрыта', () => {
    const image = detailImage(0);
    const layer = new DetailsLayer([image]);
    layer.update(VIEW, frameAt(1.2), createDetailMotion());

    layer.update(VIEW, frameAt(1.2), { ...createDetailMotion(), fade: 0 });

    expect(image.style.visibility).toBe('hidden');
  });

  it('уходящая деталь сдвигается на leavingShift и гаснет по leavingFade', () => {
    const bearImage = detailImage(0); // figure 1
    const layer = new DetailsLayer([bearImage]);
    layer.update(VIEW, frameAt(1.2), createDetailMotion());
    const startTransform = bearImage.style.transform;

    layer.update(VIEW, frameAt(2.0), {
      ...createDetailMotion(),
      fade: 0.3,
      leavingFigure: 1,
      leavingFade: 0.7,
      leavingShiftX: 90,
      leavingShiftY: -30,
    });

    expect(bearImage.style.visibility).toBe('visible');
    expect(bearImage.style.opacity).toBe(String(Math.round(0.7 * MAX_DETAIL_OPACITY * 100) / 100));
    expect(bearImage.style.transform).not.toBe(startTransform);
  });
});
