import { describe, expect, it } from 'vitest';
import { computeUBowlCenter, computeUZoomTransform, computeWordmarkCameraZoom } from './wordmark-zoom';

describe('wordmark-zoom', () => {
  it('вычисляет координаты чаши U левее центра экрана', () => {
    const bowl = computeUBowlCenter(1440, 900);
    // На 1440px чаша U находится примерно на 27-28% ширины
    expect(bowl.x).toBeGreaterThan(350);
    expect(bowl.x).toBeLessThan(450);
    // По вертикали чаша U расположена в центре экрана
    expect(bowl.y).toBeGreaterThan(420);
    expect(bowl.y).toBeLessThan(460);
  });

  it('на малом экране сохраняет пропорции', () => {
    const bowl = computeUBowlCenter(375, 667);
    expect(bowl.x).toBeGreaterThan(50);
    expect(bowl.x).toBeLessThan(120);
    expect(bowl.y).toBeGreaterThan(310);
    expect(bowl.y).toBeLessThan(350);
  });

  it('при u=0 даёт единичный масштаб и нулевое смещение', () => {
    const result = computeUZoomTransform({
      u: 0,
      scale: 1.0,
      opacity: 1.0,
      width: 1440,
      height: 900,
    });
    expect(result.isVisible).toBe(true);
    expect(result.transform).toContain('translate3d(0.0px, 0.0px, 0)');
    expect(result.transform).toContain('scale(1.00)');
    expect(result.opacity).toBe(1.0);
  });

  it('при u=0.5 смещает чашу U точно в центр экрана и увеличивает масштаб', () => {
    const width = 1440;
    const height = 900;
    const bowl = computeUBowlCenter(width, height);
    const expectedTx = (width * 0.5 - bowl.x).toFixed(1);
    const expectedTy = (height * 0.5 - bowl.y).toFixed(1);

    const result = computeUZoomTransform({
      u: 0.5,
      scale: 16.0,
      opacity: 0.1,
      width,
      height,
    });
    expect(result.isVisible).toBe(true);
    expect(result.transform).toContain(`translate3d(${expectedTx}px, ${expectedTy}px, 0)`);
    expect(result.transform).toContain('scale(16.00)');
  });

  it('computeWordmarkCameraZoom возвращает нативные параметры камеры для шейдера', () => {
    const width = 1440;
    const height = 900;
    const cam = computeWordmarkCameraZoom({
      u: 0.25,
      scale: 4.0,
      opacity: 0.9,
      width,
      height,
    });
    expect(cam.isVisible).toBe(true);
    expect(cam.scale).toBe(4.0);
    expect(cam.opacity).toBe(0.9);
    expect(cam.originX).toBeGreaterThan(350);
    expect(cam.translateX).toBeGreaterThan(0);
  });

  it('при u > 0.55 скрывает вордмарк', () => {
    const result = computeUZoomTransform({
      u: 0.6,
      scale: 16.0,
      opacity: 0.0,
      width: 1440,
      height: 900,
    });
    expect(result.isVisible).toBe(false);
    expect(result.opacity).toBe(0);

    const cam = computeWordmarkCameraZoom({
      u: 0.6,
      scale: 16.0,
      opacity: 0.0,
      width: 1440,
      height: 900,
    });
    expect(cam.isVisible).toBe(false);
  });
});
