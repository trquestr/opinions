export interface Cloud3D {
  readonly id: string;
  readonly src: string;
  /** Смещение в сторону от оси подъёма (-1..1). Знак задаёт сторону, в которую облако уходит. */
  readonly worldX: number;
  /** Насколько ниже точки схода (зенита) лежит облако (> 0): чем больше, тем ниже по экрану оно проходит. */
  readonly worldY: number;
  /** Высота эшелона вдоль оси подъёма (камера идёт от z=0 до z=2.95). */
  readonly worldZ: number;
  /** Базовый размер в vw на единичном расстоянии. */
  readonly baseWidthVw: number;
}

export interface ProjectedCloud {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly opacity: number;
  readonly isVisible: boolean;
}

/**
 * Расстановка облаков по эшелонам подъёма. Камера идёт вверх, поэтому точка схода — зенит над верхним краем
 * экрана: облако проступает маленьким и бледным у верха кадра, растёт и уходит вниз и в свою сторону.
 *
 * Два рода облаков:
 * - боковые (|worldX| ≥ 0.42, worldY 0.3…0.5) проходят весь экран сверху вниз по краям — колонка текста в нижней
 *   трети по центру остаётся свободной;
 * - центральные (|worldX| ≤ 0.12, worldY ≤ 0.24) не опускаются ниже середины экрана: камера проходит сквозь них,
 *   и они тают, не дойдя до текста.
 * Последние три эшелона (z ≥ 2.55) стоят в кадре, когда сверху опускается вуаль сумерек, и уходят в негативе.
 * Самое последнее облако (c-low-4) идёт ниже и ближе к центру: фразы к этому времени уже ушли (после 2,3 экрана).
 * Облака одной стороны идут по разным лучам от зенита, иначе дальнее встаёт точно за ближним.
 */
export const CLOUDS_FORMATION: readonly Cloud3D[] = [
  // Первый эшелон (О2)
  { id: 'c-left-1', src: '/assets/cloud_01.png', worldX: -0.5, worldY: 0.34, worldZ: 0.95, baseWidthVw: 36 },
  { id: 'c-right-1', src: '/assets/cloud_02.png', worldX: 0.48, worldY: 0.42, worldZ: 1.1, baseWidthVw: 38 },
  { id: 'c-center-1', src: '/assets/cloud_05.png', worldX: 0.06, worldY: 0.2, worldZ: 1.25, baseWidthVw: 30 },

  // Второй эшелон (О3)
  { id: 'c-left-2', src: '/assets/cloud_03.png', worldX: -0.66, worldY: 0.26, worldZ: 1.6, baseWidthVw: 34 },
  { id: 'c-right-2', src: '/assets/cloud_04.png', worldX: 0.52, worldY: 0.3, worldZ: 1.8, baseWidthVw: 32 },
  { id: 'c-center-2', src: '/assets/cloud_10.png', worldX: -0.1, worldY: 0.22, worldZ: 2.0, baseWidthVw: 28 },

  // Третий эшелон (О4–О5) — здесь поднимаются капли
  { id: 'c-left-3', src: '/assets/cloud_07.png', worldX: -0.55, worldY: 0.36, worldZ: 2.35, baseWidthVw: 36 },

  // Последние эшелоны (О6) — уходят под вуаль сумерек
  { id: 'c-right-3', src: '/assets/cloud_08.png', worldX: 0.46, worldY: 0.48, worldZ: 2.55, baseWidthVw: 40 },
  {
    id: 'c-center-3',
    src: '/assets/cloud_09.png',
    worldX: 0.04,
    worldY: 0.24,
    worldZ: 2.75,
    baseWidthVw: 34,
  },
  { id: 'c-low-4', src: '/assets/cloud_06.png', worldX: -0.3, worldY: 0.5, worldZ: 2.85, baseWidthVw: 36 },
];

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Точка схода (зенит) — над верхним краем экрана, в долях высоты. */
const ZENITH_Y = -0.12;
/** Разлёт в стороны, в долях ширины экрана на единицу worldX при масштабе 1. */
const SPREAD_X = 0.55;
/**
 * Размер облака считается от ширины экрана, но не меньше этой доли высоты: на вертикальном телефоне
 * облака в vw выходят мелкими и жмутся к верху, а так они крупнее и частично обрезаются краями.
 */
const PORTRAIT_SIZE_SHARE = 0.62;

/**
 * Проецирует облако на экран по высоте камеры zCam. dz = worldZ − zCam — сколько камере осталось до эшелона.
 *   масштаб s = 1 / (0.85·dz + 0.28) — чем ближе, тем быстрее растёт (0.6 на входе, 3 у самой камеры);
 *   x = W·(0.5 + worldX·s·SPREAD_X),  y = H·(ZENITH_Y + worldY·s) — облако уходит от зенита вниз и в сторону;
 *   ширина = baseWidthVw·s от max(W, PORTRAIT_SIZE_SHARE·H).
 * Проступает из дымки при dz от 1.6 до 1.1, тает при проходе камеры сквозь эшелон (dz < 0.28).
 */
export function projectCloud(cloud: Cloud3D, zCam: number, vp: ViewportSize): ProjectedCloud {
  const dz = cloud.worldZ - zCam;

  // Эшелон уже ниже камеры
  if (dz <= 0.05) {
    return { xPx: 0, yPx: 0, widthPx: 0, opacity: 0, isVisible: false };
  }

  const scale = 1 / (dz * 0.85 + 0.28);
  const xPx = vp.width * (0.5 + cloud.worldX * scale * SPREAD_X);
  const yPx = vp.height * (ZENITH_Y + cloud.worldY * scale);
  const sizeBase = Math.max(vp.width, vp.height * PORTRAIT_SIZE_SHARE);
  const widthPx = (cloud.baseWidthVw / 100) * sizeBase * scale;

  const enterFade = Math.min(1, Math.max(0, (1.6 - dz) / 0.5));
  const exitFade = Math.min(1, Math.max(0, (dz - 0.05) / 0.23));
  const opacity = enterFade * exitFade;

  return { xPx, yPx, widthPx, opacity, isVisible: opacity > 0.005 };
}
