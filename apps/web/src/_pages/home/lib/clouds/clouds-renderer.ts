import type { CloudsSimulation, ParticleSlice } from './clouds-sim';

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aRadius;
layout(location = 2) in float aAlpha;
layout(location = 3) in vec2 aDir;
layout(location = 4) in float aStretch;

uniform vec2 uResolution;
uniform float uDpr;

out float vAlpha;
out vec2 vDir;
out float vStretch;
out float vRadiusPx;
out float vPointSize;

void main() {
  vec2 zeroToOne = aPosition / uResolution;
  vec2 clipSpace = (zeroToOne * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(clipSpace, 0.0, 1.0);

  // С запасом под растяжение капли и субпиксельный антиалиасинг
  float maxSpan = aRadius * (1.0 + aStretch * 1.5) + 3.0;
  vPointSize = max(1.0, maxSpan * 2.0 * uDpr);
  gl_PointSize = vPointSize;

  vAlpha = aAlpha;
  vDir = aDir;
  vStretch = aStretch;
  vRadiusPx = aRadius * uDpr;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float vAlpha;
in vec2 vDir;
in float vStretch;
in float vRadiusPx;
in float vPointSize;

uniform float uInkLightness;

out vec4 fragColor;

// Формула sdDroplet из landing.js (флюидный курсор-метабол)
float sdDroplet(vec2 p, vec2 dir, float r, float stretch) {
  if (stretch <= 0.005) return length(p) - r;
  vec2 perp = vec2(-dir.y, dir.x);
  float qx = dot(p, dir);
  float qy = dot(p, perp);

  float sx = 1.0 + stretch;
  float sy = inversesqrt(1.0 + stretch * 0.85);

  float rear = clamp(-qx / max(0.001, r * sx), 0.0, 1.0);
  float taper = min(0.24, stretch * 0.5) * rear * rear * (3.0 - 2.0 * rear);

  vec2 qScaled = vec2(qx / sx, qy / (sy * (1.0 - taper)));
  return (length(qScaled) - r) * min(sx, sy);
}

void main() {
  vec2 coord = (gl_PointCoord - vec2(0.5)) * vPointSize;

  float d = sdDroplet(coord, vDir, vRadiusPx, vStretch);

  // Плотное ядро туши с субпиксельным сглаживанием кромки
  float ink = 1.0 - smoothstep(-0.8, 0.8, d);
  if (ink <= 0.001) {
    discard;
  }

  float alpha = ink * vAlpha;

  // Цвет туши: от чёрной (день) к светлой (ночь)
  vec3 blackInk = vec3(0.07, 0.07, 0.08);
  vec3 whiteInk = vec3(0.92, 0.92, 0.91);
  vec3 color = mix(blackInk, whiteInk, uInkLightness);

  // Premultiplied alpha
  fragColor = vec4(color * alpha, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Не удалось создать шейдер');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Ошибка компиляции шейдера: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Не удалось создать программу');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Ошибка линковки программы: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

interface Buffers {
  readonly vao: WebGLVertexArrayObject | null;
  readonly posBuffer: WebGLBuffer | null;
  readonly radiusBuffer: WebGLBuffer | null;
  readonly alphaBuffer: WebGLBuffer | null;
  readonly dirBuffer: WebGLBuffer | null;
  readonly stretchBuffer: WebGLBuffer | null;
}

function createParticleBuffers(gl: WebGL2RenderingContext): Buffers {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const radiusBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, radiusBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  const alphaBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  const dirBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dirBuffer);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);

  const stretchBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, stretchBuffer);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);

  return { vao, posBuffer, radiusBuffer, alphaBuffer, dirBuffer, stretchBuffer };
}

export type ParticleSource = ParticleSlice | CloudsSimulation;

export interface CloudsRenderer {
  resize(width: number, height: number, dpr: number): void;
  render(source: ParticleSource, inkLightness: number): void;
  dispose(): void;
}

interface UniformLocations {
  readonly uRes: WebGLUniformLocation | null;
  readonly uDpr: WebGLUniformLocation | null;
  readonly uInkLightness: WebGLUniformLocation | null;
}

function getUniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): UniformLocations {
  return {
    uRes: gl.getUniformLocation(program, 'uResolution'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uInkLightness: gl.getUniformLocation(program, 'uInkLightness'),
  };
}

function disposeRenderer(gl: WebGL2RenderingContext, program: WebGLProgram | null, b: Buffers): void {
  if (program) gl.deleteProgram(program);
  if (b.posBuffer) gl.deleteBuffer(b.posBuffer);
  if (b.radiusBuffer) gl.deleteBuffer(b.radiusBuffer);
  if (b.alphaBuffer) gl.deleteBuffer(b.alphaBuffer);
  if (b.dirBuffer) gl.deleteBuffer(b.dirBuffer);
  if (b.stretchBuffer) gl.deleteBuffer(b.stretchBuffer);
  if (b.vao) gl.deleteVertexArray(b.vao);
}

function fillPositions(
  source: ParticleSource,
  posArray: Float32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> {
  const target = posArray.length === source.count * 2 ? posArray : new Float32Array(source.count * 2);
  for (let i = 0; i < source.count; i++) {
    target[i * 2] = source.x[i] ?? 0;
    target[i * 2 + 1] = source.y[i] ?? 0;
  }
  return target;
}

function fillDirs(
  source: ParticleSource,
  dirArray: Float32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> {
  const target = dirArray.length === source.count * 2 ? dirArray : new Float32Array(source.count * 2);
  for (let i = 0; i < source.count; i++) {
    target[i * 2] = source.dirX[i] ?? 1;
    target[i * 2 + 1] = source.dirY[i] ?? 0;
  }
  return target;
}

function uploadDynamicBuffers(gl: WebGL2RenderingContext, b: Buffers, source: ParticleSource): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, b.radiusBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, source.radius, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.alphaBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, source.alpha, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.stretchBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, source.stretch, gl.DYNAMIC_DRAW);
}

export function createCloudsRenderer(canvas: HTMLCanvasElement): CloudsRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  try {
    program = createProgram(gl);
  } catch (err) {
    console.error('Ошибка инициализации WebGL2 для облаков', err);
    return null;
  }

  const u = getUniformLocations(gl, program);
  const buffers = createParticleBuffers(gl);

  let posArray = new Float32Array(0);
  let dirArray = new Float32Array(0);
  let width = 1;
  let height = 1;
  let dpr = 1;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    resize(newWidth: number, newHeight: number, newDpr: number): void {
      width = newWidth;
      height = newHeight;
      dpr = Math.min(newDpr, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    render(source: ParticleSource, inkLightness: number): void {
      if (!program) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindVertexArray(buffers.vao);

      posArray = fillPositions(source, posArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, posArray, gl.DYNAMIC_DRAW);

      dirArray = fillDirs(source, dirArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dirBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, dirArray, gl.DYNAMIC_DRAW);

      uploadDynamicBuffers(gl, buffers, source);

      gl.useProgram(program);
      gl.uniform2f(u.uRes, width, height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uInkLightness, inkLightness);
      gl.drawArrays(gl.POINTS, 0, source.count);
    },

    dispose(): void {
      disposeRenderer(gl, program, buffers);
      program = null;
    },
  };
}
