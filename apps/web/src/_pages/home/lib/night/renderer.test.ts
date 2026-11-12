import { afterEach, describe, expect, it, vi } from 'vitest';
import { CursorField } from './cursor-field';
import { InkGrid } from './ink-grid';
import { createRandom } from './stars';
import { createInputState, createNightRenderer, MAX_LINE_SEGMENTS } from './renderer';
import type { RendererOptions } from './renderer';

/*
 * Поддельный WebGL2-контекст: любой метод — vi.fn (по умолчанию возвращает новый объект), любая ЗАГЛАВНАЯ константа —
 * уникальное число. Настоящий GL в jsdom недоступен, поэтому проверяются вызовы, а не пиксели.
 */
const DEFAULT_OVERRIDES: Record<string, unknown> = {
  isContextLost: () => false,
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getShaderInfoLog: () => 'ошибка шейдера',
  getProgramInfoLog: () => 'ошибка программы',
};

function createFakeGl(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>();
  const implementations = { ...DEFAULT_OVERRIDES, ...overrides };
  const resolve = (name: string): unknown => {
    if (/^[A-Z][A-Z_0-9]*$/.test(name)) return store.size + 1;
    const implementation = implementations[name];
    return vi.fn(typeof implementation === 'function' ? (implementation as () => unknown) : () => ({}));
  };
  const target = new Proxy(
    {},
    {
      get(_, property) {
        const name = String(property);
        if (!store.has(name)) store.set(name, resolve(name));
        return store.get(name);
      },
    },
  );
  // Тестовая подмена: прокси ведёт себя как контекст, но типом он не является.
  const gl = target as unknown as WebGL2RenderingContext;
  return { gl, calls: (name: string) => (target as Record<string, ReturnType<typeof vi.fn>>)[name]?.mock.calls ?? [] };
}

type FakeGl = ReturnType<typeof createFakeGl>;

const OPTIONS: RendererOptions = {
  // две звезды по 5 чисел
  stars: new Float32Array(14),
};
const LAYOUT = { originX: 10, originY: 20, scale: 3 };

function createRenderer(fake: FakeGl, options: RendererOptions = OPTIONS) {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockImplementation(() => fake.gl as never);
  return { canvas, renderer: createNightRenderer(canvas, options) };
}

/** Сетка для экрана 100×100: 6×6 ячеек, текстура 6×384 текселей. */
function createGrid(view = { width: 100, height: 100 }): InkGrid {
  const grid = new InkGrid();
  grid.resize(view);
  return grid;
}

/** Число вызовов drawArraysInstanced с заданным числом экземпляров. */
function drawsWithInstances(fake: FakeGl, instances: number): number {
  return fake.calls('drawArraysInstanced').filter((args) => args[3] === instances).length;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createNightRenderer', () => {
  it('возвращает null, если WebGL2 недоступен', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);

    expect(createNightRenderer(canvas, OPTIONS)).toBeNull();
  });

  it('возвращает null и пишет в консоль, если шейдер не собрался', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGl({ getShaderParameter: () => false });

    const { renderer } = createRenderer(fake);

    expect(renderer).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('возвращает null, если не создался шейдер', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGl({ createShader: () => null });

    expect(createRenderer(fake).renderer).toBeNull();
  });

  it('возвращает null, если программа не слинковалась', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGl({ getProgramParameter: () => false });

    expect(createRenderer(fake).renderer).toBeNull();
  });

  it('при потерянном контексте не считает сборку шейдера ошибкой', () => {
    const fake = createFakeGl({ getShaderParameter: () => false, isContextLost: () => true });

    expect(createRenderer(fake).renderer).not.toBeNull();
  });
});

describe('resize', () => {
  it('ограничивает devicePixelRatio двойкой и задаёт viewport', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const fake = createFakeGl();
    const { canvas, renderer } = createRenderer(fake);

    renderer?.resize({ width: 400, height: 300 }, LAYOUT);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(fake.calls('viewport')).toContainEqual([0, 0, 800, 600]);
  });

  it('без devicePixelRatio считает его единицей', () => {
    vi.stubGlobal('devicePixelRatio', 0);
    const fake = createFakeGl();
    const { canvas, renderer } = createRenderer(fake);

    renderer?.resize({ width: 400, height: 300 }, LAYOUT);

    expect(canvas.width).toBe(400);
  });

  it('передаёт шейдеру туши отношение буфера к CSS-пикселям и высоту экрана', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.resize({ width: 400, height: 300 }, LAYOUT);

    expect(fake.calls('uniform1f').map((args) => args[1])).toEqual(expect.arrayContaining([2, 300]));
  });
});

describe('setLayout', () => {
  it('передаёт линиям и звёздам начало и масштаб, звёздам — параллакс', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.setLayout({ originX: 10, originY: 20, scale: 3 }, { x: 4, y: 5 });

    const pairs = fake.calls('uniform2f').map((args) => args.slice(1));
    expect(pairs).toContainEqual([10, 20]);
    expect(pairs).toContainEqual([4, 5]);
    expect(fake.calls('uniform1f').map((args) => args[1])).toContain(3);
  });

  it('resize сбрасывает параллакс в ноль', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.resize({ width: 400, height: 300 }, LAYOUT);

    expect(fake.calls('uniform2f').map((args) => args.slice(1))).toContainEqual([0, 0]);
  });
});

describe('uploadInk', () => {
  it('первую загрузку делает через texImage2D с размером сетки', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.uploadInk(createGrid());

    expect(fake.calls('texImage2D')).toHaveLength(1);
    expect(fake.calls('texImage2D')[0]?.slice(3, 5)).toEqual([6, 384]);
    expect(fake.calls('uniform2i')[0]?.slice(1)).toEqual([6, 6]);
  });

  it('для сетки того же размера использует texSubImage2D', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const grid = createGrid();

    renderer?.uploadInk(grid);
    renderer?.uploadInk(grid);

    expect(fake.calls('texImage2D')).toHaveLength(1);
    expect(fake.calls('texSubImage2D')).toHaveLength(1);
  });

  it('после смены размера сетки снова вызывает texImage2D', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const grid = createGrid();

    renderer?.uploadInk(grid);
    grid.resize({ width: 200, height: 100 });
    renderer?.uploadInk(grid);

    expect(fake.calls('texImage2D')).toHaveLength(2);
    expect(fake.calls('texSubImage2D')).toHaveLength(0);
  });
});

describe('uploadCursor', () => {
  function createField(isInside: boolean): CursorField {
    const field = new CursorField(createRandom(5));
    field.build({ width: 400, height: 300 });
    if (isInside) field.pointer.moveTo(200, 150);
    field.step(16.667);
    return field;
  }

  it('без капель передаёт только их число, равное нулю', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const before = fake.calls('uniform4fv').length;

    renderer?.uploadCursor(createField(false));

    expect(fake.calls('uniform1i').at(-1)?.[1]).toBe(0);
    expect(fake.calls('uniform4fv').length).toBe(before);
  });

  it('с каплями передаёт число, капли и рамку', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const field = createField(true);

    renderer?.uploadCursor(field);

    expect(field.dotCount).toBeGreaterThan(0);
    expect(fake.calls('uniform1i').at(-1)?.[1]).toBe(field.dotCount);
    expect(fake.calls('uniform4fv')).toHaveLength(2);
    expect(fake.calls('uniform2f').at(-1)?.slice(1)).toEqual([1, 0]);
  });
});

describe('render', () => {
  it('до загрузки туши рисует только звёзды', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.render(createInputState());

    expect(fake.calls('drawArrays')).toHaveLength(0);
    expect(fake.calls('drawArraysInstanced')).toHaveLength(1);
    expect(drawsWithInstances(fake, 2)).toBe(1);
  });

  it('после загрузки туши рисует полноэкранный проход один раз за кадр', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    renderer?.uploadInk(createGrid());

    renderer?.render(createInputState());

    expect(fake.calls('drawArrays')).toHaveLength(1);
    expect(fake.calls('drawArrays')[0]?.slice(1)).toEqual([0, 6]);
  });

  it('передаёт шейдеру звёзд время из входа кадра', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.render({ ...createInputState(), starTimeSeconds: 12.5 });

    expect(fake.calls('uniform1f').some((args) => args[1] === 12.5)).toBe(true);
  });

  it('звёзды рисует в каждом кадре', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = createInputState();

    renderer?.render(input);
    renderer?.render(input);

    expect(drawsWithInstances(fake, 2)).toBe(2);
  });

  it('линии не рисует, пока нет отрезков', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = { ...createInputState(), outlineAlpha: 1, userLinesAlpha: 1, segmentCount: 0 };

    renderer?.render(input);

    expect(drawsWithInstances(fake, 3)).toBe(0);
  });

  it('линии не рисует, пока обе прозрачности нулевые', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = { ...createInputState(), segmentCount: 3 };

    renderer?.render(input);

    expect(drawsWithInstances(fake, 3)).toBe(0);
  });

  it('линии рисует, когда есть отрезки и видна хотя бы одна прозрачность', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = { ...createInputState(), userLinesAlpha: 0.5, segmentCount: 3 };

    renderer?.render(input);

    expect(drawsWithInstances(fake, 3)).toBe(1);
  });

  it('отрезки загружает только когда они изменились и сбрасывает флаг', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = { ...createInputState(), outlineAlpha: 1, segmentCount: 3, outlineCount: 1 };

    renderer?.render(input);
    renderer?.render(input);

    expect(fake.calls('uniform4fv')).toHaveLength(1);
    expect(input.segmentsDirty).toBe(false);
  });

  it('отрезки загружает снова после пометки segmentsDirty', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);
    const input = { ...createInputState(), outlineAlpha: 1, segmentCount: 3 };

    renderer?.render(input);
    input.segmentsDirty = true;
    renderer?.render(input);

    expect(fake.calls('uniform4fv')).toHaveLength(2);
  });
});

describe('dispose', () => {
  it('удаляет буферы, текстуру, программы и массивы вершин', () => {
    const fake = createFakeGl();
    const { renderer } = createRenderer(fake);

    renderer?.dispose();

    expect(fake.calls('deleteBuffer')).toHaveLength(4);
    expect(fake.calls('deleteTexture')).toHaveLength(1);
    expect(fake.calls('deleteProgram')).toHaveLength(3);
    expect(fake.calls('deleteVertexArray')).toHaveLength(3);
  });
});

describe('createInputState', () => {
  it('создаёт нулевое состояние с запасом под все отрезки', () => {
    const input = createInputState();

    expect(input.segments).toHaveLength(MAX_LINE_SEGMENTS * 4);
    expect(input.segmentCount).toBe(0);
    expect(input.outlineAlpha).toBe(0);
    expect(input.segmentsDirty).toBe(true);
  });

  it('каждый раз возвращает независимое состояние', () => {
    expect(createInputState().segments).not.toBe(createInputState().segments);
  });
});
