import { describe, expect, it } from 'vitest';
import manifest from './night-manifest.json';
import {
  createSkyDirections,
  depthAt,
  DIPPER_DEPTHS,
  focalLength,
  FOV_DEGREES,
  Projector,
} from './projection';
import type { CameraPose, Projected } from './projection';

const POSE: CameraPose = {
  yaw: 0,
  pitch: 0,
  distance: 100,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  anchorX: 400,
  anchorY: 300,
};

function createProjector(pose: Partial<CameraPose> = {}): Projector {
  const projector = new Projector();
  projector.setView(800, 600);
  projector.setPose({ ...POSE, ...pose });
  return projector;
}

function emptyResult(): Projected {
  return { x: 0, y: 0, k: 0 };
}

describe('focalLength', () => {
  it('для высоты 600 при угле обзора 35° равна примерно 951,5 px', () => {
    expect(FOV_DEGREES).toBe(35);
    expect(focalLength(600)).toBeCloseTo(951.478, 2);
  });

  it('растёт пропорционально высоте', () => {
    expect(focalLength(1200)).toBeCloseTo(2 * focalLength(600), 8);
  });
});

describe('Projector.project', () => {
  it('точка взгляда ложится в опору, а масштаб равен f / D', () => {
    const projector = createProjector();

    const p = projector.project({ x: 0, y: 0, z: 0 }, emptyResult());

    expect(p.x).toBeCloseTo(400, 8);
    expect(p.y).toBeCloseTo(300, 8);
    expect(p.k).toBeCloseTo(projector.focal / 100, 8);
  });

  it('точка правее цели уходит вправо от опоры на x · f / D', () => {
    const projector = createProjector();

    const p = projector.project({ x: 10, y: 0, z: 0 }, emptyResult());

    expect(p.x).toBeCloseTo(400 + (10 * projector.focal) / 100, 6);
    expect(p.y).toBeCloseTo(300, 8);
  });

  it('точка дальше от зрителя (z > 0) выглядит меньше', () => {
    const projector = createProjector();

    const near = projector.project({ x: 0, y: 0, z: -20 }, emptyResult()).k;
    const far = projector.project({ x: 0, y: 0, z: 20 }, emptyResult()).k;

    expect(near).toBeGreaterThan(far);
  });

  it('поворот на 90° по рысканию превращает +x в глубину', () => {
    const projector = createProjector({ yaw: Math.PI / 2 });

    const p = projector.project({ x: 10, y: 0, z: 0 }, emptyResult());

    expect(p.x).toBeCloseTo(400, 6);
    expect(p.k).toBeCloseTo(projector.focal / 110, 8);
  });

  it('поворот на 90° по тангажу превращает +y в глубину', () => {
    const projector = createProjector({ pitch: Math.PI / 2 });

    const p = projector.project({ x: 0, y: 10, z: 0 }, emptyResult());

    expect(p.y).toBeCloseTo(300, 6);
    expect(p.k).toBeCloseTo(projector.focal / 110, 8);
  });

  it('точка за спиной камеры ограничивает глубину единицей', () => {
    const projector = createProjector();

    const p = projector.project({ x: 0, y: 0, z: -500 }, emptyResult());

    expect(p.k).toBeCloseTo(projector.focal, 8);
  });

  it('смещение цели сдвигает проекцию в обратную сторону', () => {
    const projector = createProjector({ targetX: 5 });

    const p = projector.project({ x: 5, y: 0, z: 0 }, emptyResult());

    expect(p.x).toBeCloseTo(400, 8);
  });
});

describe('Projector.projectSky', () => {
  it('направление прямо перед камерой падает в центр экрана', () => {
    const projector = createProjector();

    const p = projector.projectSky({ x: 0, y: 0, z: 1 }, emptyResult());

    expect(p.x).toBeCloseTo(400, 8);
    expect(p.y).toBeCloseTo(300, 8);
    expect(p.k).toBe(1);
  });

  it('направление под углом 10° вправо падает на f · tg 10° правее центра', () => {
    const projector = createProjector();
    const angle = (10 * Math.PI) / 180;

    const p = projector.projectSky({ x: Math.sin(angle), y: 0, z: Math.cos(angle) }, emptyResult());

    expect(p.x).toBeCloseTo(400 + projector.focal * Math.tan(angle), 6);
  });

  it('направление за спиной получает k = 0 и уходит за экран', () => {
    const projector = createProjector();

    const p = projector.projectSky({ x: 0, y: 0, z: -1 }, emptyResult());

    expect(p.k).toBe(0);
    expect(p.x).toBeLessThan(-1000);
  });

  it('небо не сдвигается вместе с камерой, только поворачивается', () => {
    const direction = { x: 0.1, y: 0.05, z: 0.99 };
    const still = createProjector().projectSky(direction, emptyResult());

    const moved = createProjector({ targetX: 500, targetZ: 300, distance: 40 }).projectSky(
      direction,
      emptyResult(),
    );

    expect(moved.x).toBeCloseTo(still.x, 8);
    expect(moved.y).toBeCloseTo(still.y, 8);
  });

  it('небо поворачивается лишь на треть угла камеры', () => {
    const projector = createProjector({ yaw: 0.3 });

    const p = projector.projectSky({ x: 0, y: 0, z: 1 }, emptyResult());

    // по рысканию 0,3 рад небо идёт как на 0,3 · 0,33 = 0,099 рад: x = центр − f · tg 0,099
    expect(p.x).toBeCloseTo(400 - projector.focal * Math.tan(0.099), 6);
    const fullShift = projector.focal * Math.tan(0.3);
    expect(Math.abs(p.x - 400) / fullShift).toBeGreaterThan(0.3);
    expect(Math.abs(p.x - 400) / fullShift).toBeLessThan(0.37);
  });

  it('поворот по рысканию сдвигает небо', () => {
    const still = createProjector().projectSky({ x: 0, y: 0, z: 1 }, emptyResult());

    const turned = createProjector({ yaw: 0.2 }).projectSky({ x: 0, y: 0, z: 1 }, emptyResult());

    expect(Math.abs(turned.x - still.x)).toBeGreaterThan(10);
  });
});

describe('глубина ковша', () => {
  it('DIPPER_DEPTHS — это z звёзд из манифеста по порядку', () => {
    expect(DIPPER_DEPTHS).toEqual(manifest.stars.map((star) => star.z));
  });

  it.each(manifest.stars.map((star, index) => [star.name, index] as const))(
    'у звезды %s глубина близка к её z',
    (_, index) => {
      const star = manifest.stars[index];

      expect(Math.abs(depthAt(star?.x ?? 0, star?.y ?? 0) - (star?.z ?? 0))).toBeLessThan(4);
    },
  );

  it('между звёздами глубина лежит между наименьшей и наибольшей', () => {
    const zs = manifest.stars.map((star) => star.z);

    const z = depthAt(50, 25);

    expect(z).toBeGreaterThanOrEqual(Math.min(...zs));
    expect(z).toBeLessThanOrEqual(Math.max(...zs));
  });

  it('для неопределённой точки глубина нулевая', () => {
    expect(depthAt(Number.NaN, 0)).toBe(0);
  });

  it('далеко от ковша глубина тоже в пределах звёздных', () => {
    const zs = manifest.stars.map((star) => star.z);

    const z = depthAt(5000, -5000);

    expect(z).toBeGreaterThanOrEqual(Math.min(...zs));
    expect(z).toBeLessThanOrEqual(Math.max(...zs));
  });
});

describe('createSkyDirections', () => {
  it('на звезду даёт три числа', () => {
    expect(createSkyDirections(50)).toHaveLength(150);
  });

  it('каждое направление единичной длины и смотрит вперёд', () => {
    const sky = createSkyDirections(50);

    const lengths = Array.from({ length: 50 }, (_, i) =>
      Math.hypot(sky[i * 3] ?? 0, sky[i * 3 + 1] ?? 0, sky[i * 3 + 2] ?? 0),
    );
    const depths = Array.from({ length: 50 }, (_, i) => sky[i * 3 + 2] ?? 0);

    expect(lengths.every((length) => Math.abs(length - 1) < 1e-5)).toBe(true);
    expect(depths.every((z) => z > 0)).toBe(true);
  });

  it('детерминировано', () => {
    expect(createSkyDirections(20)).toEqual(createSkyDirections(20));
  });
});
