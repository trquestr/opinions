import { describe, expect, it, vi } from 'vitest';
import { CloudsSimulation } from './clouds-sim';
import { createCloudsRenderer } from './clouds-renderer';

const DEFAULT_OVERRIDES: Record<string, unknown> = {
  isContextLost: () => false,
  getShaderParameter: () => true,
  getProgramParameter: () => true,
};

function createFakeGl() {
  const store = new Map<string, unknown>();
  const implementations = { ...DEFAULT_OVERRIDES };
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
  return target as unknown as WebGL2RenderingContext;
}

describe('CloudsRenderer', () => {
  it('возвращает null, если WebGL2 не поддерживается', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(createCloudsRenderer(canvas)).toBeNull();
  });

  it('инициализируется и выполняет render и resize без ошибок', () => {
    const canvas = document.createElement('canvas');
    const fakeGl = createFakeGl();
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeGl);

    const renderer = createCloudsRenderer(canvas);
    expect(renderer).not.toBeNull();

    renderer?.resize(800, 600, 2);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);

    const sim = new CloudsSimulation({ count: 20, isSmallScreen: false });
    expect(() => renderer?.render(sim, 0.5)).not.toThrow();
    expect(() => renderer?.render(sim.back, 0.5)).not.toThrow();
    expect(() => renderer?.render(sim.front, 0.5)).not.toThrow();

    renderer?.dispose();
  });
});
