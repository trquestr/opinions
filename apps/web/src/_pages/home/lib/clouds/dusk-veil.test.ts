import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDuskVeil, VEIL_FALLBACK_COLOR } from './dusk-veil';

/** Минимальный контекст WebGL2 для вуали: константы и шпионы на вызовы. */
function createFakeGl(isBuilt = true) {
  const program = { id: 'program' };
  return {
    program,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    BLEND: 6,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => isBuilt),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn((_: unknown, name: string) => name),
    useProgram: vi.fn(),
    disable: vi.fn(),
    viewport: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    drawArrays: vi.fn(),
  };
}

function setup(gl: ReturnType<typeof createFakeGl> | null) {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext | null);
  const onContextLost = vi.fn();
  const veil = createDuskVeil(canvas, { onContextLost });
  return { canvas, onContextLost, veil };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createDuskVeil', () => {
  it('возвращает null, если WebGL2 не поддерживается', () => {
    expect(setup(null).veil).toBeNull();
  });

  it('возвращает null и пишет в консоль, если шейдеры не собрались', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { veil } = setup(createFakeGl(false));

    expect(veil).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('включает программу и отключает смешивание при создании', () => {
    const gl = createFakeGl();

    setup(gl);

    expect(gl.useProgram).toHaveBeenCalledWith(gl.program);
    expect(gl.disable).toHaveBeenCalledWith(gl.BLEND);
  });

  it('resize задаёт размер холста с учётом dpr, область просмотра и uniform-ы', () => {
    const gl = createFakeGl();
    const { canvas, veil } = setup(gl);

    veil?.resize(800, 600, 1.5);

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(900);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 1200, 900);
    expect(gl.uniform2f).toHaveBeenCalledWith('uResolution', 1200, 900);
    expect(gl.uniform1f).toHaveBeenCalledWith('uDpr', 1.5);
  });

  it('на широком экране зерно пунктира полное', () => {
    const gl = createFakeGl();
    const { veil } = setup(gl);

    veil?.resize(1440, 900, 1);

    expect(gl.uniform1f).toHaveBeenCalledWith('uGrain', 1);
  });

  it('на узком экране зерно пунктира мельче, но не меньше 0.6', () => {
    const gl = createFakeGl();
    const { veil } = setup(gl);

    veil?.resize(375, 812, 2);

    expect(gl.uniform1f).toHaveBeenCalledWith('uGrain', 0.6);
  });

  it('между узким и широким экраном зерно растёт вместе с меньшей стороной', () => {
    const gl = createFakeGl();
    const { veil } = setup(gl);

    veil?.resize(1024, 720, 1);

    expect(gl.uniform1f).toHaveBeenCalledWith('uGrain', 0.8);
  });

  it('resize округляет дробный размер холста', () => {
    const { canvas, veil } = setup(createFakeGl());

    veil?.resize(333, 101, 1.25);

    expect(canvas.width).toBe(416);
    expect(canvas.height).toBe(126);
  });

  it('render передаёт ход и время и рисует один треугольник на весь экран', () => {
    const gl = createFakeGl();
    const { veil } = setup(gl);

    veil?.render(0.4, 12.5);

    expect(gl.uniform1f).toHaveBeenCalledWith('uProgress', 0.4);
    expect(gl.uniform1f).toHaveBeenCalledWith('uTime', 12.5);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it('при потере контекста сообщает об этом, а resize и render больше ничего не делают', () => {
    const gl = createFakeGl();
    const { canvas, onContextLost, veil } = setup(gl);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    veil?.resize(800, 600, 1);
    veil?.render(0.5, 1);

    expect(onContextLost).toHaveBeenCalledTimes(1);
    expect(gl.viewport).not.toHaveBeenCalled();
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it('dispose удаляет программу и снимает слушатель потери контекста', () => {
    const gl = createFakeGl();
    const { canvas, onContextLost, veil } = setup(gl);

    veil?.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(gl.deleteProgram).toHaveBeenCalledWith(gl.program);
    expect(onContextLost).not.toHaveBeenCalled();
  });

  it('dispose после потери контекста не трогает программу', () => {
    const gl = createFakeGl();
    const { canvas, veil } = setup(gl);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    veil?.dispose();

    expect(gl.deleteProgram).not.toHaveBeenCalled();
  });

  it('экспортирует цвет запасной заливки', () => {
    expect(VEIL_FALLBACK_COLOR).toBe('rgb(244, 244, 242)');
  });
});
