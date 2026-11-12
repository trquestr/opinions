import { createSkyDirections, depthAt, DIPPER_DEPTHS } from './projection';
import { buildStarTable, createRandom, DIPPER_CENTER, DIPPER_STARS, INVITE_STARS, STAR_STRIDE } from './stars';
import type { Point } from './layout';
import type { Projected, Projector } from './projection';

/*
 * Звёзды в 3D. Облик (размер, яркость, голубизна, лучи) — из stars.ts, положение — в мире.
 * Глубину сцене дают слои, которые при облёте камеры смещаются с разной скоростью (параллакс):
 *   небо      — 60% фоновых звёзд на небесной сфере, бесконечно далеко: двигаются только от поворота камеры;
 *   глубина   — 40% фоновых звёзд на конечной дальности, z ∈ [300, 1800] единиц за ковшом: отстают от неба;
 *   ковш      — семь звёзд на разной глубине (порядок настоящий, разброс художественный) и тусклые рядом, ±10 от его поля;
 * Каждый кадр движения камеры всё проецируется, и таблица для шейдера (экранные px) переписывается на месте.
 * Размер растёт с близостью: s · clamp(k / k₀, …), k₀ — масштаб в точке взгляда; у ковша рост сдержан (0.75…1.35),
 * у глубины — 0.5…1.6 (пыль у камеры убрана по просьбе владельца 2026-11-12: читалась как мутные пятна).
 * Ширина слоёв подобрана под типичное расстояние камеры D ≈ 290 единиц: полуширина ≈ 0.62·(D + z), полувысота ≈ 0.4·(D + z).
 */
const SKY_SHARE = 0.6;
const DEEP_NEAR = 300;
const DEEP_FAR = 1800;
const TYPICAL_DISTANCE = 290;
const SEED = 47;
const INVITE_DEPTH_SPREAD = 10;
const DIPPER_GROW = { min: 0.75, max: 1.35 } as const;
const FREE_GROW = { min: 0.5, max: 1.6 } as const;

/** Как проецировать звезду: направление неба, точка ковша (сдержанный рост) или точка слоя (свободный рост). */
const MODE = { sky: 0, dipper: 1, free: 2 } as const;

interface StarRow {
  readonly world: readonly [number, number, number];
  readonly look: readonly number[];
  readonly mode: number;
}

/** Начало строки звезды в таблице stars.ts. */
function rowAt(index: number): number {
  return index * STAR_STRIDE;
}

/** Точка слоя в пределах видимой области на глубине z (с запасом на облёт камеры). */
function spreadAt(random: () => number, z: number): readonly [number, number, number] {
  const reach = TYPICAL_DISTANCE + z;
  return [DIPPER_CENTER.x + (random() * 2 - 1) * 0.62 * reach, DIPPER_CENTER.y + (random() * 2 - 1) * 0.4 * reach, z];
}

/** Фоновые звёзды из stars.ts: первые SKY_SHARE — на небе, остальные — на конечной дальности. */
function backgroundRows(table: Float32Array, count: number, random: () => number): StarRow[] {
  const skyCount = Math.round(count * SKY_SHARE);
  const sky = createSkyDirections(skyCount);
  return Array.from({ length: count }, (_, i) => {
    const look = Array.from(table.slice(i * STAR_STRIDE, (i + 1) * STAR_STRIDE));
    if (i < skyCount) {
      return { world: [sky[i * 3] ?? 0, sky[i * 3 + 1] ?? 0, sky[i * 3 + 2] ?? 1], look, mode: MODE.sky };
    }
    return { world: spreadAt(random, DEEP_NEAR + (DEEP_FAR - DEEP_NEAR) * random()), look, mode: MODE.free };
  });
}

export class StarField {
  /** Таблица для шейдера: STAR_STRIDE чисел на звезду, x, y, размер — экранные (переписываются каждый кадр). */
  readonly table: Float32Array;
  readonly count: number;
  /** На звезду три числа: направление (небо) или точка мира. */
  private readonly world: Float32Array;
  private readonly mode: Uint8Array;
  private readonly baseSize: Float32Array;
  private readonly firstDrawable: number;
  private readonly point: Projected = { x: 0, y: 0, k: 0 };
  /** Скретч мировой точки звезды — без аллокаций в кадре. */
  private readonly source = { x: 0, y: 0, z: 0 };

  constructor() {
    const base = buildStarTable();
    const drawableCount = DIPPER_STARS.length + INVITE_STARS.length;
    const backgroundCount = base.length / STAR_STRIDE - drawableCount;
    const random = createRandom(SEED);
    const dipper = DIPPER_STARS.map((s, i) => ({
      world: [s.x, s.y, DIPPER_DEPTHS[i] ?? 0] as const,
      look: Array.from(base.slice(rowAt(backgroundCount + i), rowAt(backgroundCount + i + 1))),
      mode: MODE.dipper,
    }));
    // Тусклые звёзды — около поля глубины ковша, но каждая на своей глубине (±10): висят в объёме, а не в плоскости
    const invite = INVITE_STARS.map((s, i) => ({
      world: [s.x, s.y, depthAt(s.x, s.y) + (random() * 2 - 1) * INVITE_DEPTH_SPREAD] as const,
      look: Array.from(base.slice(rowAt(backgroundCount + DIPPER_STARS.length + i), rowAt(backgroundCount + DIPPER_STARS.length + i + 1))),
      mode: MODE.dipper,
    }));
    // Порядок важен: звёзды для рисования — в конце (drawablePoint считает от firstDrawable)
    const rows = [...backgroundRows(base, backgroundCount, random), ...dipper, ...invite];
    this.count = rows.length;
    this.firstDrawable = rows.length - drawableCount;
    this.table = Float32Array.from(rows.flatMap((row) => row.look));
    this.world = Float32Array.from(rows.flatMap((row) => row.world));
    this.mode = Uint8Array.from(rows.map((row) => row.mode));
    this.baseSize = Float32Array.from(rows.map((row) => row.look[2] ?? 0));
  }

  /** Проецирует все звёзды; targetScale — масштаб в точке взгляда (k₀). */
  project(projector: Projector, targetScale: number): void {
    for (let i = 0; i < this.count; i++) {
      const at = i * STAR_STRIDE;
      this.source.x = this.world[i * 3] ?? 0;
      this.source.y = this.world[i * 3 + 1] ?? 0;
      this.source.z = this.world[i * 3 + 2] ?? 0;
      const p = this.projectOne(i, projector);
      this.table[at] = p.x;
      this.table[at + 1] = p.y;
      this.table[at + 2] = (this.baseSize[i] ?? 0) * this.growOf(i, p.k / targetScale);
    }
  }

  private projectOne(i: number, projector: Projector): Projected {
    if (this.mode[i] === MODE.sky) return projector.projectSky(this.source, this.point);
    return projector.project(this.source, this.point);
  }

  /** Рост размера с близостью: у неба — видна или нет (k = 0 за спиной), у ковша — сдержанно, у слоёв — свободно. */
  private growOf(i: number, closeness: number): number {
    if (this.mode[i] === MODE.sky) return this.point.k;
    const grow = this.mode[i] === MODE.dipper ? DIPPER_GROW : FREE_GROW;
    return Math.min(grow.max, Math.max(grow.min, closeness));
  }

  /** Экранные положения звёзд, между которыми рисует зритель (ковш, затем тусклые) — для попадания курсора. */
  drawablePoints(): Point[] {
    const points: Point[] = [];
    for (let i = this.firstDrawable; i < this.count; i++) {
      points.push({ x: this.table[i * STAR_STRIDE] ?? 0, y: this.table[i * STAR_STRIDE + 1] ?? 0 });
    }
    return points;
  }

  /** Экранное положение звезды для рисования по её номеру в DRAWABLE_STARS. */
  drawablePoint(index: number, out: Projected): Projected {
    const at = (this.firstDrawable + index) * STAR_STRIDE;
    out.x = this.table[at] ?? 0;
    out.y = this.table[at + 1] ?? 0;
    return out;
  }
}
