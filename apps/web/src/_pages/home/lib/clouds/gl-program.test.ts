import { describe, expect, it, vi } from 'vitest';
import { buildProgram } from './gl-program';

const SOURCES = { vertex: 'vertex-src', fragment: 'fragment-src' };

interface FakeGlOptions {
  readonly shader?: object | null;
  readonly program?: object | null;
  readonly isCompiled?: boolean;
  readonly isLinked?: boolean;
}

/** Минимальный контекст WebGL2: только то, что трогает buildProgram. */
function createFakeGl(options: FakeGlOptions = {}) {
  const { shader = {}, program = {}, isCompiled = true, isLinked = true } = options;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    createShader: vi.fn(() => shader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => isCompiled),
    getShaderInfoLog: vi.fn(() => 'лог шейдера'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => isLinked),
    getProgramInfoLog: vi.fn(() => 'лог программы'),
    deleteProgram: vi.fn(),
  };
  return gl;
}

function asContext(gl: ReturnType<typeof createFakeGl>): WebGL2RenderingContext {
  return gl as unknown as WebGL2RenderingContext;
}

describe('buildProgram', () => {
  it('компилирует оба шейдера, линкует и возвращает программу', () => {
    const program = { id: 'program' };
    const gl = createFakeGl({ program });

    const result = buildProgram(asContext(gl), SOURCES);

    expect(result).toBe(program);
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), 'vertex-src');
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), 'fragment-src');
    expect(gl.linkProgram).toHaveBeenCalledWith(program);
  });

  it('после линковки удаляет отдельные шейдеры', () => {
    const gl = createFakeGl();

    buildProgram(asContext(gl), SOURCES);

    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('бросает ошибку, если не удалось создать шейдер', () => {
    const gl = createFakeGl({ shader: null });

    expect(() => buildProgram(asContext(gl), SOURCES)).toThrow('Не удалось создать шейдер');
  });

  it('при ошибке компиляции удаляет шейдер и бросает ошибку с логом драйвера', () => {
    const gl = createFakeGl({ isCompiled: false });

    expect(() => buildProgram(asContext(gl), SOURCES)).toThrow('Ошибка компиляции шейдера: лог шейдера');
    expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    expect(gl.createProgram).not.toHaveBeenCalled();
  });

  it('бросает ошибку, если не удалось создать программу', () => {
    const gl = createFakeGl({ program: null });

    expect(() => buildProgram(asContext(gl), SOURCES)).toThrow('Не удалось создать программу');
  });

  it('при ошибке линковки удаляет программу и бросает ошибку с логом драйвера', () => {
    const program = { id: 'program' };
    const gl = createFakeGl({ program, isLinked: false });

    expect(() => buildProgram(asContext(gl), SOURCES)).toThrow('Ошибка линковки программы: лог программы');
    expect(gl.deleteProgram).toHaveBeenCalledWith(program);
  });
});
