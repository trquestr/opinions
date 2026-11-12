export interface Cloud3D {
  readonly id: string;
  readonly src: string;
  /** Горизонтальное смещение от центра пролёта (-1..1). Знак задаёт сторону разлёта. */
  readonly worldX: number;
  /** Вертикальное смещение от центра пролёта (-1..1). */
  readonly worldY: number;
  /** Глубина Z вдоль оси пролёта (камера летит от z=0 до z=3.0). */
  readonly worldZ: number;
  /** Базовый размер в vw на единичном расстоянии. */
  readonly baseWidthVw: number;
  readonly aspect: number;
}

export interface ProjectedCloud {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly opacity: number;
  readonly isVisible: boolean;
}

/**
 * Расстановка облаков в 3D пространстве для эффекта пролёта сквозь них.
 * Координаты (worldX, worldY) задают направление радиального разлёта от центра,
 * как показано на эскизе с красными стрелками:
 * - верх-лево: cloud_01
 * - верх-право: cloud_02
 * - низ: cloud_05
 * - средний эшелон: cloud_03, cloud_04, cloud_07
 * - дальний эшелон / выход: cloud_08, cloud_09
 */
export const CLOUDS_FORMATION: readonly Cloud3D[] = [
  // Первый эшелон (О2: u ~ 0.5..1.2) — расходятся по стрелкам эскиза
  {
    id: 'c-top-left',
    src: '/assets/cloud_01.png',
    worldX: -0.42,
    worldY: -0.32,
    worldZ: 0.95,
    baseWidthVw: 36,
    aspect: 3.0,
  },
  {
    id: 'c-top-right',
    src: '/assets/cloud_02.png',
    worldX: 0.44,
    worldY: -0.28,
    worldZ: 1.05,
    baseWidthVw: 38,
    aspect: 3.0,
  },
  {
    id: 'c-bottom',
    src: '/assets/cloud_05.png',
    worldX: 0.02,
    worldY: 0.38,
    worldZ: 1.15,
    baseWidthVw: 42,
    aspect: 2.0,
  },

  // Второй эшелон (О3: u ~ 1.0..1.8) — проступают из глубины центра и разлетаются в стороны
  {
    id: 'c-mid-left',
    src: '/assets/cloud_03.png',
    worldX: -0.36,
    worldY: 0.12,
    worldZ: 1.6,
    baseWidthVw: 34,
    aspect: 2.0,
  },
  {
    id: 'c-mid-right',
    src: '/assets/cloud_04.png',
    worldX: 0.35,
    worldY: -0.08,
    worldZ: 1.75,
    baseWidthVw: 32,
    aspect: 1.78,
  },

  // Третий эшелон (О4–О5: u ~ 1.6..2.4) — зона зарождения восходящего дождя
  {
    id: 'c-deep-left',
    src: '/assets/cloud_07.png',
    worldX: -0.38,
    worldY: -0.25,
    worldZ: 2.4,
    baseWidthVw: 36,
    aspect: 2.0,
  },

  // Финальный эшелон (О6: u ~ 2.3..3.0) — ворота вылета в ночное небо
  {
    id: 'c-exit-bottom',
    src: '/assets/cloud_08.png',
    worldX: -0.15,
    worldY: 0.35,
    worldZ: 2.7,
    baseWidthVw: 40,
    aspect: 2.0,
  },
  {
    id: 'c-exit-top',
    src: '/assets/cloud_09.png',
    worldX: 0.28,
    worldY: -0.36,
    worldZ: 2.85,
    baseWidthVw: 38,
    aspect: 2.0,
  },
];

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Проецирует 3D-облако на плоскость экрана по положению камеры zCam.
 * По мере приближения камеры (zCam -> worldZ) облако:
 * 1) увеличивается в масштабе;
 * 2) удаляется от центра по радиальному вектору (worldX, worldY);
 * 3) плавно растворяется при непосредственном пролёте сквозь него (dz < 0.25).
 */
export function projectCloud(cloud: Cloud3D, zCam: number, vp: ViewportSize): ProjectedCloud {
  const dz = cloud.worldZ - zCam;

  // Облако уже позади камеры
  if (dz <= 0.05) {
    return { xPx: 0, yPx: 0, widthPx: 0, opacity: 0, isVisible: false };
  }

  // Перспективное увеличение: чем ближе, тем быстрее растёт
  const scale = 1 / (dz * 0.85 + 0.28);
  const centerX = vp.width * 0.5;
  const centerY = vp.height * 0.48;

  // Радиальный разлёт от центра к краям экрана (вектор worldX, worldY)
  const xPx = centerX + cloud.worldX * scale * vp.width * 0.55;
  const yPx = centerY + cloud.worldY * scale * vp.height * 0.55;
  const basePx = (cloud.baseWidthVw / 100) * vp.width;
  const widthPx = basePx * scale;

  // Проявление из дальней дымки (когда dz уменьшается до 1.4)
  const enterFade = Math.min(1, Math.max(0, (1.6 - dz) / 0.5));
  // Растворение при пролёте камеры сквозь плоскость облака (dz < 0.28)
  const exitFade = Math.min(1, Math.max(0, (dz - 0.05) / 0.23));
  const opacity = enterFade * exitFade;

  return {
    xPx,
    yPx,
    widthPx,
    opacity,
    isVisible: opacity > 0.005,
  };
}
