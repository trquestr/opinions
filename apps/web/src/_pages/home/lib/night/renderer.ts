import { MAX_CURSOR_DOTS } from './cursor-field';
import { CELL_PX, SLOTS } from './ink-grid';
import { inkFragment, INK_VERTEX, LINE_FRAGMENT, LINE_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from './shaders';
import { STAR_STRIDE } from './stars';
import type { CursorField } from './cursor-field';
import type { InkGrid } from './ink-grid';
import type { Layout, Point, Size } from './layout';

/*
 * WebGL2-рендерер ночной сцены. Ничего не решает сам: что рисовать, говорит RenderInput от сцены.
 * Таблица звёзд загружается один раз; за кадр — текстура сетки капель (её считает ink-sim.ts) и несколько uniform.
 */

/** Отрезков в uniform-массиве шейдера линий: 7 контура ковша + 24 зрителя + 1 тянущийся за курсором. */
export const MAX_LINE_SEGMENTS = 32;
const LINE_WIDTH_PX = 1.2;
const DPR_LIMIT = 2;

/**
 * Что рисовать в кадре. Объект один на всю сцену и меняется на месте: в requestAnimationFrame нельзя создавать
 * объекты (требование 60 FPS, .claude/rules/hero.md) — это осознанное исключение из правила неизменяемости.
 */
export interface RenderInput {
  backgroundStars: number;
  dipperStars: number;
  inviteStars: number;
  /** Время сияния звёзд, с (без анимации — стоит). */
  starTimeSeconds: number;
  outlineAlpha: number;
  userLinesAlpha: number;
  /** x0, y0, x1, y1 в единицах ковша; сначала контур ковша (outlineCount), потом линии зрителя. */
  readonly segments: Float32Array;
  outlineCount: number;
  segmentCount: number;
  segmentsDirty: boolean;
}

export interface NightRenderer {
  resize(view: Size, layout: Layout): void;
  /** Кадр камеры: где ковш на экране и в каком масштабе, плюс сдвиг фоновых звёзд (px). */
  setLayout(layout: Layout, parallax: Point): void;
  /** Загружает сетку капель кадра в текстуру. */
  uploadInk(grid: InkGrid): void;
  /** Капли курсора кадра (их немного — uniform-массив, как в прологе). */
  uploadCursor(field: CursorField): void;
  render(input: RenderInput): void;
  dispose(): void;
}

export interface RendererOptions {
  readonly stars: Float32Array;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Pass {
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly u: Uniforms;
}

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
const STRIP = new Float32Array([0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1]);

export function createInputState(): RenderInput {
  return {
    backgroundStars: 0,
    dipperStars: 0,
    inviteStars: 0,
    starTimeSeconds: 0,
    outlineAlpha: 0,
    userLinesAlpha: 0,
    segments: new Float32Array(MAX_LINE_SEGMENTS * 4),
    outlineCount: 0,
    segmentCount: 0,
    segmentsDirty: true,
  };
}

function compile(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Ночь: не создался шейдер');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new Error(`Ночь: шейдер не собрался: ${gl.getShaderInfoLog(shader) ?? ''}`);
  }
  return shader;
}

function createPass(gl: WebGL2RenderingContext, sources: readonly [string, string], names: readonly string[]): Pass {
  const program = gl.createProgram();
  const vao = gl.createVertexArray();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, sources[0]));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, sources[1]));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Ночь: программа не собралась: ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  const u: Uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  return { program, vao, u };
}

function bindCorners(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject, corners: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

/** Таблица звёзд: на экземпляр aPos (2 float), aLook (3 float) и aTint (2 float), см. STAR_STRIDE. */
function bindStars(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject, stars: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  const stride = STAR_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);
  gl.vertexAttribDivisor(3, 1);
  return buffer;
}

const VIEW_UNIFORMS = ['uOrigin', 'uScale', 'uView'] as const;

export function createNightRenderer(canvas: HTMLCanvasElement, options: RendererOptions): NightRenderer | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return null;
  try {
    return new WebglNightRenderer(gl, canvas, options);
  } catch (error) {
    // Не собрался шейдер на этом устройстве — сцена уходит в запасной режим без туши, тексты остаются.
    console.error('Ночь: WebGL недоступен, запасной режим', error);
    return null;
  }
}

class WebglNightRenderer implements NightRenderer {
  private readonly ink: Pass;
  private readonly lines: Pass;
  private readonly stars: Pass;
  private readonly buffers: WebGLBuffer[];
  private readonly inkTexture: WebGLTexture;
  private readonly starCount: number;
  private textureWidth = 0;
  private textureHeight = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly canvas: HTMLCanvasElement,
    options: RendererOptions,
  ) {
    this.ink = createPass(gl, [INK_VERTEX, inkFragment(CELL_PX, SLOTS, MAX_CURSOR_DOTS)], [
      'uGrid',
      'uGridSize',
      'uDpr',
      'uViewHeight',
      'uCursorCount',
      'uCursorDots',
      'uCursorDir',
      'uCursorBBox',
    ]);
    this.lines = createPass(gl, [LINE_VERTEX, LINE_FRAGMENT], [...VIEW_UNIFORMS, 'uSegments', 'uOutlineCount', 'uAlpha', 'uWidth']);
    this.stars = createPass(gl, [STAR_VERTEX, STAR_FRAGMENT], [...VIEW_UNIFORMS, 'uAlpha', 'uTime', 'uParallax']);
    this.buffers = [
      bindCorners(gl, this.ink.vao, QUAD),
      bindCorners(gl, this.lines.vao, STRIP),
      bindCorners(gl, this.stars.vao, QUAD),
      bindStars(gl, this.stars.vao, options.stars),
    ];
    this.inkTexture = createGridTexture(gl);
    this.starCount = options.stars.length / STAR_STRIDE;
    gl.useProgram(this.ink.program);
    gl.uniform1i(this.ink.u.uGrid ?? null, 0);
    gl.useProgram(this.lines.program);
    gl.uniform1f(this.lines.u.uWidth ?? null, LINE_WIDTH_PX);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(view: Size, layout: Layout): void {
    const { gl, canvas } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    [this.lines, this.stars].forEach((pass) => {
      gl.useProgram(pass.program);
      gl.uniform2f(pass.u.uView ?? null, view.width, view.height);
    });
    this.setLayout(layout, { x: 0, y: 0 });
    gl.useProgram(this.ink.program);
    gl.uniform1f(this.ink.u.uDpr ?? null, canvas.width / view.width);
    gl.uniform1f(this.ink.u.uViewHeight ?? null, view.height);
  }

  setLayout(layout: Layout, parallax: Point): void {
    const { gl } = this;
    [this.lines, this.stars].forEach((pass) => {
      gl.useProgram(pass.program);
      gl.uniform2f(pass.u.uOrigin ?? null, layout.originX, layout.originY);
      gl.uniform1f(pass.u.uScale ?? null, layout.scale);
    });
    gl.uniform2f(this.stars.u.uParallax ?? null, parallax.x, parallax.y);
  }

  /** Сетка меняет размер только при ресайзе — тогда texImage2D, иначе более дешёвый texSubImage2D. */
  uploadInk(grid: InkGrid): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inkTexture);
    if (grid.width !== this.textureWidth || grid.textureHeight !== this.textureHeight) {
      this.textureWidth = grid.width;
      this.textureHeight = grid.textureHeight;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, grid.width, grid.textureHeight, 0, gl.RGBA, gl.FLOAT, grid.data);
      gl.useProgram(this.ink.program);
      gl.uniform2i(this.ink.u.uGridSize ?? null, grid.width, grid.height);
      return;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.width, grid.textureHeight, gl.RGBA, gl.FLOAT, grid.data);
  }

  uploadCursor(field: CursorField): void {
    const { gl, ink } = this;
    gl.useProgram(ink.program);
    gl.uniform1i(ink.u.uCursorCount ?? null, field.dotCount);
    if (field.dotCount === 0) return;
    gl.uniform4fv(ink.u.uCursorDots ?? null, field.dots, 0, field.dotCount * 4);
    gl.uniform2f(ink.u.uCursorDir ?? null, Math.cos(field.pointer.angle), Math.sin(field.pointer.angle));
    gl.uniform4fv(ink.u.uCursorBBox ?? null, field.bbox);
  }

  render(input: RenderInput): void {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawInk();
    this.drawLines(input);
    this.drawStars(input);
  }

  dispose(): void {
    const { gl } = this;
    this.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteTexture(this.inkTexture);
    [this.ink, this.lines, this.stars].forEach((pass) => {
      gl.deleteVertexArray(pass.vao);
      gl.deleteProgram(pass.program);
    });
  }

  private drawInk(): void {
    const { gl, ink } = this;
    if (this.textureWidth === 0) return;
    gl.useProgram(ink.program);
    gl.bindVertexArray(ink.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inkTexture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawLines(input: RenderInput): void {
    const { gl, lines } = this;
    if (input.segmentCount === 0 || (input.outlineAlpha <= 0 && input.userLinesAlpha <= 0)) return;
    gl.useProgram(lines.program);
    gl.bindVertexArray(lines.vao);
    if (input.segmentsDirty) {
      gl.uniform4fv(lines.u.uSegments ?? null, input.segments, 0, input.segmentCount * 4);
      gl.uniform1i(lines.u.uOutlineCount ?? null, input.outlineCount);
      input.segmentsDirty = false;
    }
    gl.uniform2f(lines.u.uAlpha ?? null, input.outlineAlpha, input.userLinesAlpha);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, input.segmentCount);
  }

  private drawStars(input: RenderInput): void {
    const { gl, stars } = this;
    gl.useProgram(stars.program);
    gl.bindVertexArray(stars.vao);
    gl.uniform3f(stars.u.uAlpha ?? null, input.backgroundStars, input.dipperStars, input.inviteStars);
    gl.uniform1f(stars.u.uTime ?? null, input.starTimeSeconds);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.starCount);
  }
}

/** Текстура сетки капель: RGBA32F читается texelFetch без фильтрации — расширения для float-текстур не нужны. */
function createGridTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
