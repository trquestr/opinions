/*
 * Раскладка ночной сцены: перевод «единиц ковша» (система координат запечённых фигур, Дубхе (1, 0) … Алькаид (100, 53))
 * в CSS-пиксели экрана. Масштаб один для всех фигур, поэтому семь звёзд стоят на месте во всех кадрах.
 */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Layout {
  /** Где на экране точка (0, 0) в единицах ковша, px. */
  readonly originX: number;
  readonly originY: number;
  /** px на единицу ковша. */
  readonly scale: number;
}

/** Доли экрана под фигуры: по высоте меньше, нижняя треть — место текста. */
const FIT_WIDTH = 0.86;
const FIT_HEIGHT = 0.62;
/** Центр фигур чуть выше середины экрана, над текстом. */
const CENTER_Y = 0.42;

/**
 * Масштаб — наибольший, при котором общие границы всех фигур помещаются в долю экрана.
 * На телефоне (решено 2026-11-11 для прототипа) — та же раскладка, ужатая по ширине.
 */
export function computeLayout(view: Size, bounds: Bounds): Layout {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min((view.width * FIT_WIDTH) / width, (view.height * FIT_HEIGHT) / height);
  return {
    scale,
    originX: view.width / 2 - (bounds.minX + width / 2) * scale,
    originY: view.height * CENTER_Y - (bounds.minY + height / 2) * scale,
  };
}

export function unitsToPx(layout: Layout, point: Point): Point {
  return { x: layout.originX + point.x * layout.scale, y: layout.originY + point.y * layout.scale };
}

export function pxToUnits(layout: Layout, point: Point): Point {
  return { x: (point.x - layout.originX) / layout.scale, y: (point.y - layout.originY) / layout.scale };
}
