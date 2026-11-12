/*
 * Гравюрные детали ночной сцены (承): далёкий фон — картинки, сопровождающие появление каждой фигуры.
 * Каждой сцене (фигуре 1…4) соответствуют свои детали, расставленные аккуратно по углам экрана.
 *
 * Детали появляются и уходят вместе с текстом своей фразы:
 *   - Медведица (1, текст справа): ветка сосны в верхнем левом углу, капитель в нижнем правом (отзеркалена)
 *   - Плуг (2, текст слева): колосья в верхнем левом углу (повернуты на 25°), борозда в нижнем правом
 *   - Колесница (3, текст справа): китайское облако в верхнем левом углу (отзеркалено), колесо в нижнем правом
 *   - Шествие (4, текст слева): полумесяц в верхнем левом углу, дюна в нижнем правом
 * Чужие картинки в сцене не показываются, на общем плане фон чистый.
 */

export type DetailCorner = 'top-left' | 'bottom-right';

export interface NightDetail {
  readonly name: string;
  /** Номер фигуры (1…4): к какой сцене относится деталь. */
  readonly figure: number;
  /** Угол экрана, к которому привязана деталь. */
  readonly corner: DetailCorner;
  /** Ширина на экране в px (для экрана 1440px). */
  readonly widthPx: number;
  /** Смещение от угла в px: [x, y]. */
  readonly offset?: readonly [number, number];
  /** Поворот на экране, градусы: по часовой стрелке. */
  readonly rotationDeg?: number;
  /** Отражение по горизонтали (зеркалирование). */
  readonly flipX?: boolean;
  /** Потолок прозрачности 0…1 (по умолчанию MAX_DETAIL_OPACITY — для тёмных гравюр задаётся выше). */
  readonly alpha?: number;
}

/** Детали по углам экрана; порядок — по фигурам. */
export const NIGHT_DETAILS: readonly NightDetail[] = [
  // Медведица (1) — текст справа: ветка сосны в левом верхнем углу, капитель увеличена в правом нижнем (отзеркалена)
  { name: 'pine-branch', figure: 1, corner: 'top-left', widthPx: 320, offset: [0, 0] },
  { name: 'ionic-capital', figure: 1, corner: 'bottom-right', widthPx: 380, offset: [20, 20], flipX: true },
  // Плуг (2) — текст слева: сноп в левом верхнем углу (повернут на 25°), борозда увеличена в 1.5 раза в правом нижнем
  { name: 'wheat', figure: 2, corner: 'top-left', widthPx: 310, offset: [20, 0], rotationDeg: 25 },
  { name: 'furrow', figure: 2, corner: 'bottom-right', widthPx: 840, offset: [0, 0], alpha: 0.85 },
  // Колесница (3) — текст справа: облако в левом верхнем углу (отзеркалено), колесо увеличено с выходом за правый нижний край
  { name: 'xiangyun', figure: 3, corner: 'top-left', widthPx: 340, offset: [40, 20], flipX: true },
  { name: 'wheel', figure: 3, corner: 'bottom-right', widthPx: 380, offset: [30, 30] },
  // Шествие (4) — текст слева: полумесяц сдвинут правее на 20px, дюна увеличена в 1.5 раза в правом нижнем углу
  { name: 'crescent', figure: 4, corner: 'top-left', widthPx: 170, offset: [50, 30] },
  { name: 'dune', figure: 4, corner: 'bottom-right', widthPx: 870, offset: [0, 0] },
];

/** Адрес картинки детали. Единственное место, где он собирается. */
export function detailSrc(name: string): string {
  return `/assets/night/details/detail-${name}.webp`;
}
