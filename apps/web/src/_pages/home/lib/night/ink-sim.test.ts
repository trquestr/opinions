import { describe, expect, it } from 'vitest';
import { Cursor } from './cursor';
import { InkGrid } from './ink-grid';
import { InkSimulation } from './ink-sim';
import type { InkStep } from './ink-sim';

/** px = origin + p · scale: капля (20, 10) попадает в (300, 150), капля (60, 30) — в (700, 350). */
const LAYOUT = { originX: 100, originY: 50, scale: 10 };
const CENTER = { x: 50, y: 25 };
const BOUNDS = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
const FAR_STAR = { x: 5000, y: 5000 };
/** Состояния из одной капли: x, y, r в сотых долях единицы. Состояние 0 — (20, 10), 1 — (60, 30), 2 — (30, 40); r = 0.5. */
const STATE_0 = Int16Array.of(2000, 1000, 50);
const STATE_1 = Int16Array.of(6000, 3000, 50);
const STATE_2 = Int16Array.of(3000, 4000, 50);
const HIDDEN = Int16Array.of(2000, 1000, 0);

const STILL_STEP: InkStep = {
  target: 0,
  isDirect: false,
  drift: 0,
  isReducedMotion: false,
  nowMs: 0,
  hover: { x: 0, y: 0 },
  hoverStrength: 0,
  cursor: new Cursor(),
};

interface Dropped {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly stretch: number;
}

interface SimOptions {
  readonly dipper?: { x: number; y: number }[];
  readonly radiusScale?: number;
  readonly states?: readonly Int16Array[];
}

function createSim(options: SimOptions = {}): InkSimulation {
  const sim = new InkSimulation(1, {
    center: CENTER,
    dipper: options.dipper ?? [FAR_STAR],
    bounds: BOUNDS,
    radiusScale: options.radiusScale ?? 1,
  });
  (options.states ?? [STATE_0, STATE_1, STATE_2]).forEach((state, index) => sim.setState(index, state));
  return sim;
}

function createGrid(): InkGrid {
  const grid = new InkGrid();
  grid.resize({ width: 2000, height: 2000 });
  return grid;
}

/** Все капли сетки: тексель с r > 0 — первый тексель слота. */
function dropsIn(grid: InkGrid): Dropped[] {
  const found: Dropped[] = [];
  for (let at = 0; at < grid.data.length; at += 4) {
    const r = grid.data[at + 2] ?? 0;
    if (r > 0) found.push({ x: grid.data[at] ?? 0, y: grid.data[at + 1] ?? 0, r, stretch: grid.data[at + 3] ?? 0 });
  }
  return found;
}

/** Один кадр на общей сетке; возвращает капли кадра. */
function stepOn(sim: InkSimulation, grid: InkGrid, input: Partial<InkStep>): Dropped[] {
  sim.step({ ...STILL_STEP, ...input }, LAYOUT, grid);
  return dropsIn(grid);
}

function stepOnce(sim: InkSimulation, input: Partial<InkStep>): Dropped[] {
  return stepOn(sim, createGrid(), input);
}

function expectDrop(actual: Dropped | undefined, expected: { x: number; y: number; r: number }): void {
  expect(actual?.x).toBeCloseTo(expected.x, 2);
  expect(actual?.y).toBeCloseTo(expected.y, 2);
  expect(actual?.r).toBeCloseTo(expected.r, 2);
}

function distance(a: Dropped | undefined, b: { x: number; y: number }): number {
  return Math.hypot((a?.x ?? 0) - b.x, (a?.y ?? 0) - b.y);
}

const OLD_PLACE = { x: 300, y: 150 };
const NEW_PLACE = { x: 700, y: 350 };
const T0 = 1000;

/** Сцена стоит в состоянии 0 с кадра 0, а в момент T0 цель меняется на 1 (или другую). */
function retargeted(input: Partial<InkStep> = {}, options: SimOptions = {}) {
  const sim = createSim(options);
  const grid = createGrid();
  stepOn(sim, grid, { target: 0, nowMs: 0, ...input });
  return { sim, grid, at: (nowMs: number, extra: Partial<InkStep> = {}) => stepOn(sim, grid, { target: 1, nowMs, ...input, ...extra }) };
}

describe('InkSimulation: состояния', () => {
  it('сообщает, какие состояния заданы', () => {
    const sim = new InkSimulation(1, { center: CENTER, dipper: [], bounds: BOUNDS, radiusScale: 1 });

    expect(sim.hasState(0)).toBe(false);
    sim.setState(0, STATE_0);
    expect(sim.hasState(0)).toBe(true);
    expect(sim.hasState(1)).toBe(false);
  });

  it('без состояний ничего не добавляет в сетку', () => {
    const sim = new InkSimulation(1, { center: CENTER, dipper: [], bounds: BOUNDS, radiusScale: 1 });

    expect(stepOnce(sim, {})).toEqual([]);
  });

  it('первый кадр сразу стоит в цели, без перехода', () => {
    const drops = stepOnce(createSim(), { target: 1, nowMs: 5000 });

    expect(drops).toHaveLength(1);
    expectDrop(drops[0], { ...NEW_PLACE, r: 5 });
  });

  it('первый кадр не считается переходом', () => {
    const sim = createSim();

    stepOnce(sim, { target: 1, nowMs: 5000 });

    expect(sim.isTransitioning(5000, false)).toBe(false);
  });
});

describe('InkSimulation: смена фигуры по времени', () => {
  it('в момент смены цели капля ещё на старом месте', () => {
    const { at } = retargeted();

    const drops = at(T0);

    expectDrop(drops[0], { ...OLD_PLACE, r: 5 });
  });

  it('через 3200 мс капля точно в новой цели', () => {
    const { at } = retargeted();
    at(T0);

    const drops = at(T0 + 3200);

    expectDrop(drops[0], { ...NEW_PLACE, r: 5 });
  });

  it('на середине перехода капля ни на старом, ни на новом месте', () => {
    const { at } = retargeted();
    at(T0);

    const drops = at(T0 + 1600);

    expect(distance(drops[0], OLD_PLACE)).toBeGreaterThan(1);
    expect(distance(drops[0], NEW_PLACE)).toBeGreaterThan(1);
  });

  it('смена цели посреди перехода начинается с текущего места, а не со старого', () => {
    const { at } = retargeted();
    at(T0);
    const middle = at(T0 + 1600);

    const retargetedDrops = at(T0 + 1600, { target: 2 });

    expect(distance(retargetedDrops[0], middle[0] ?? OLD_PLACE)).toBeLessThan(0.01);
    expect(distance(retargetedDrops[0], OLD_PLACE)).toBeGreaterThan(1);
  });

  it('после смены посреди перехода капля приходит в самую новую цель', () => {
    const { at } = retargeted();
    at(T0);
    at(T0 + 1600, { target: 2 });

    const drops = at(T0 + 1600 + 3200, { target: 2 });

    expectDrop(drops[0], { x: 400, y: 450, r: 5 });
  });

  it('невидимая в обеих фигурах капля остаётся невидимой в галактике', () => {
    const { at } = retargeted({}, { states: [HIDDEN, Int16Array.of(6000, 3000, 0)] });
    at(T0);

    expect(at(T0 + 1600)).toEqual([]);
  });

  it('идёт переход — isTransitioning true, закончился — false', () => {
    const { sim, at } = retargeted();
    at(T0);

    expect(sim.isTransitioning(T0 + 1000, false)).toBe(true);
    expect(sim.isTransitioning(T0 + 3200, false)).toBe(false);
  });

  it('при reduced motion переход короче: 900 мс', () => {
    const { sim, at } = retargeted();
    at(T0);

    expect(sim.isTransitioning(T0 + 800, true)).toBe(true);
    expect(sim.isTransitioning(T0 + 900, true)).toBe(false);
  });
});

describe('InkSimulation: прямой переход к линиям зрителя', () => {
  it('за 1800 мс приходит в цель', () => {
    const { at } = retargeted({ isDirect: true });
    at(T0);

    const drops = at(T0 + 1800);

    expectDrop(drops[0], { ...NEW_PLACE, r: 5 });
  });

  it('на середине лежит на отрезке между старым и новым местом', () => {
    const { at } = retargeted({ isDirect: true });
    at(T0);

    const middle = at(T0 + 900)[0];

    // векторное произведение (M − A) × (B − A) ≈ 0: точка на прямой
    const cross = ((middle?.x ?? 0) - OLD_PLACE.x) * (NEW_PLACE.y - OLD_PLACE.y) - ((middle?.y ?? 0) - OLD_PLACE.y) * (NEW_PLACE.x - OLD_PLACE.x);
    expect(Math.abs(cross)).toBeLessThan(1);
    expect(distance(middle, OLD_PLACE)).toBeGreaterThan(1);
    expect(distance(middle, NEW_PLACE)).toBeGreaterThan(1);
  });

  it('продолжительность прямого перехода 1800 мс', () => {
    const { sim, at } = retargeted({ isDirect: true });
    at(T0);

    expect(sim.isTransitioning(T0 + 1700, false)).toBe(true);
    expect(sim.isTransitioning(T0 + 1800, false)).toBe(false);
  });
});

describe('InkSimulation: без анимации', () => {
  it('через 225 мс капля на старом месте с вдвое меньшим радиусом', () => {
    const { at } = retargeted({ isReducedMotion: true });
    at(T0);

    const drops = at(T0 + 225);

    expectDrop(drops[0], { ...OLD_PLACE, r: 2.5 });
  });

  it('через 675 мс капля на новом месте с вдвое меньшим радиусом', () => {
    const { at } = retargeted({ isReducedMotion: true });
    at(T0);

    const drops = at(T0 + 675);

    expectDrop(drops[0], { ...NEW_PLACE, r: 2.5 });
  });
});

describe('InkSimulation: недогруженная цель', () => {
  it('отсутствующее состояние заменяет дымкой (состояние 0)', () => {
    const drops = stepOnce(createSim(), { target: 3 });

    expectDrop(drops[0], { ...OLD_PLACE, r: 5 });
  });

  it('когда состояние загрузилось, начинается новый переход', () => {
    const sim = createSim();
    const grid = createGrid();
    stepOn(sim, grid, { target: 3, nowMs: 0 });
    const before = sim.isTransitioning(5000, false);

    sim.setState(3, STATE_1);
    const start = stepOn(sim, grid, { target: 3, nowMs: T0 });
    const during = sim.isTransitioning(T0 + 1500, false);
    const end = stepOn(sim, grid, { target: 3, nowMs: T0 + 3200 });

    expect(before).toBe(false);
    expectDrop(start[0], { ...OLD_PLACE, r: 5 });
    expect(during).toBe(true);
    expectDrop(end[0], { ...NEW_PLACE, r: 5 });
  });
});

describe('InkSimulation: радиус и просвет', () => {
  it('капли в пределах 1,4 единицы от звезды ковша не добавляются', () => {
    const sim = createSim({ dipper: [{ x: 21, y: 10 }] });

    expect(stepOnce(sim, {})).toEqual([]);
  });

  it('множитель радиуса увеличивает каплю', () => {
    const drops = stepOnce(createSim({ radiusScale: 1.3 }), {});

    expect(drops[0]?.r).toBeCloseTo(6.5, 2);
  });

  it('капля мельче 0,45 px не добавляется', () => {
    const sim = createSim({ states: [Int16Array.of(2000, 1000, 4)] });

    expect(stepOnce(sim, {})).toEqual([]);
  });

  it('капля радиусом 0,5 px добавляется', () => {
    const sim = createSim({ states: [Int16Array.of(2000, 1000, 5)] });

    expect(stepOnce(sim, {})).toHaveLength(1);
  });
});

describe('InkSimulation: дрейф', () => {
  it('в покое с амплитудой 0 капля стоит точно на месте', () => {
    const drops = stepOnce(createSim(), { drift: 0, nowMs: 3000 });

    expectDrop(drops[0], { ...OLD_PLACE, r: 5 });
  });

  it('с амплитудой дрейфа капля отходит от места не дальше, чем на 3 амплитуды', () => {
    const drops = stepOnce(createSim(), { drift: 0.5, nowMs: 3000 });

    expect(distance(drops[0], OLD_PLACE)).toBeGreaterThan(0.01);
    expect(distance(drops[0], OLD_PLACE)).toBeLessThanOrEqual(0.5 * 3 * LAYOUT.scale);
  });
});

describe('InkSimulation: вздрагивание у звезды', () => {
  it('на середине рывка (сила 0,5) сдвигает каплю рядом со звездой под курсором', () => {
    const calm = stepOnce(createSim(), {});

    const shaken = stepOnce(createSim(), { hover: { x: 23, y: 10 }, hoverStrength: 0.5 });

    expect(distance(shaken[0], calm[0] ?? OLD_PLACE)).toBeGreaterThan(4);
  });

  it('в начале рывка (сила 1) капля ещё на месте', () => {
    const calm = stepOnce(createSim(), {});

    const same = stepOnce(createSim(), { hover: { x: 23, y: 10 }, hoverStrength: 1 });

    expect(same).toEqual(calm);
  });

  it('при силе 0 ничего не меняет', () => {
    const calm = stepOnce(createSim(), {});

    const same = stepOnce(createSim(), { hover: { x: 23, y: 10 }, hoverStrength: 0 });

    expect(same).toEqual(calm);
  });

  it('не трогает каплю далеко от звезды', () => {
    const calm = stepOnce(createSim(), {});

    const far = stepOnce(createSim(), { hover: { x: 120, y: 10 }, hoverStrength: 0.5 });

    expectDrop(far[0], { x: calm[0]?.x ?? 0, y: calm[0]?.y ?? 0, r: calm[0]?.r ?? 0 });
  });
});

describe('InkSimulation: вытянутость', () => {
  /** Два кадра в движении: цель сменилась в T0, кадры на 1600 и 1616 мс перехода. */
  function moveTwice() {
    const { sim, grid, at } = retargeted();
    at(T0);
    at(T0 + 1600);
    const stretch = at(T0 + 1616)[0]?.stretch ?? 0;
    return { sim, grid, at, stretch };
  }

  it('в первом кадре капля не вытянута: скорости ещё нет', () => {
    expect(stepOnce(createSim(), {})[0]?.stretch).toBe(0);
  });

  it('движущаяся капля вытягивается', () => {
    expect(moveTwice().stretch).toBeGreaterThan(0);
  });

  it('после resetMotion скорость забыта и вытянутость затухает', () => {
    const { sim, at, stretch } = moveTwice();

    sim.resetMotion();
    const next = at(T0 + 1632)[0]?.stretch;

    // скорость 0 → цель 0, сглаживание уносит четверть: s · 0,75
    expect(next).toBeCloseTo(stretch * 0.75, 5);
  });
});

describe('InkSimulation: курсор', () => {
  it('курсор над каплей раздувает её радиус на 35%', () => {
    const cursor = new Cursor();
    cursor.move(300, 150);

    const drops = stepOnce(createSim(), { cursor });

    expect(drops[0]?.r).toBeCloseTo(6.75, 2);
  });

  it('курсор вдали радиус не меняет', () => {
    const cursor = new Cursor();
    cursor.move(1800, 1800);

    const drops = stepOnce(createSim(), { cursor });

    expect(drops[0]?.r).toBeCloseTo(5, 2);
  });
});

describe('InkSimulation: дрейф при смене цели', () => {
  it('амплитуда дрейфа плавно переходит от прежней цели к новой и в конце равна новой', () => {
    const { at } = retargeted({ drift: 0.5 });
    at(T0, { drift: 0.5 });

    const end = at(T0 + 3200, { drift: 0 });

    expectDrop(end[0], { ...NEW_PLACE, r: 5 });
  });

  it('в начале перехода дрейф ещё прежней амплитуды', () => {
    const { at } = retargeted({ drift: 0.5 });

    const start = at(T0 + 1, { drift: 0 });

    expect(distance(start[0], OLD_PLACE)).toBeGreaterThan(0.01);
  });
});
