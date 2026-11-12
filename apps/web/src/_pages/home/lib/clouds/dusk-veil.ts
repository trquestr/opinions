import { buildProgram } from './gl-program';

/*
 * ВУАЛЬ СУМЕРЕК (О6) — смена дня на ночь без серой фазы.
 *
 * Гравёр рисует темноту точками, и ночь приходит так же: сверху по листу опускается полоса гравюрного пунктира.
 * Холст вуали лежит поверх сцены с mix-blend-mode: difference и рисует цвет V = (244, 244, 242):
 *   |255 − V| = (11, 11, 13) — белый лист под тушью вуали становится ночным фоном #0b0b0d,
 * а облака, капли и всё остальное под ней — своим негативом (тушь светлеет сама, перекрашивать её не нужно).
 *
 * Тон t ∈ [0, 1] — «сколько туши» в точке экрана. y — доля высоты экрана сверху вниз, p — ход вуали (uProgress):
 *   F(p) = mix(−W·B, 1 + B·(1 + W), p)       — положение кромки, B = BAND (ширина полосы в экранах), W = WARP
 *   t = clamp((F − y) / B + W·(2·n − 1), 0, 1), n ∈ [0, 1] — медленный шум: кромка клубится, как край облака
 * Границы F подобраны так, что при p = 0 всюду t = 0, а при p = 1 всюду t = 1, каким бы ни был шум.
 *
 * Пунктир — два слоя зёрен на сетке со случайным сдвигом (крупный и мелкий). Зерно i просыпается на своём пороге
 * τ_i и растёт: r_i = mix(−0.25, R_i, smoothstep(0, 0.32, t − τ_i)) (в долях ячейки; отрицательный радиус — зерна нет).
 * Зёрна сливаются, как мокрая тушь, гладким максимумом:
 *   f = ln(Σ exp(k·(r_i − d_i))) / k + C(t),   C(t) = 0.9·smoothstep(0.62, 0.97, t)
 * Покрытие = smoothstep(−a, a, f). Подъём C затягивает последние просветы: при t ≥ 0.97 тушь сплошная.
 *
 * Искры — редкие точки, которые тушь не закрывает никогда (покрытие там падает до 0.08, это цвет светлой туши
 * #ecece8). На белом их не видно; когда вокруг смыкается тушь, они остаются светлой пылью — из неё складывается
 * ночная дымка следующей сцены.
 *
 * Все слои медленно всплывают по времени (капли поднимаются снизу); скролл двигает только кромку.
 *
 * Зерно: ячейки слоёв 10 и 5 px на широком экране; на узком они мельче (uGrain = clamp(min(W, H) / 900, 0.6, 1)),
 * иначе на телефоне пунктир читается кляксами, а не гравюрой.
 */
const VERTEX_SHADER = `#version 300 es
void main() {
  // Один треугольник на весь экран, без буферов: вершины (−1,−1), (3,−1), (−1,3)
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uDpr;
uniform float uGrain;
uniform float uProgress;
uniform float uTime;

out vec4 fragColor;

const vec3 VEIL_COLOR = vec3(244.0, 244.0, 242.0) / 255.0;
const float BAND = 0.9;
const float WARP = 0.24;
const float MERGE = 12.0;
const float SPECK_FLOOR = 0.08;

vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = hash3(cell).x;
  float b = hash3(cell + vec2(1.0, 0.0)).x;
  float c = hash3(cell + vec2(0.0, 1.0)).x;
  float d = hash3(cell + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// Три октавы шума, сумма весов = 1 → значение в [0, 1]
float billow(vec2 p) {
  return 0.6 * valueNoise(p) + 0.28 * valueNoise(p * 2.1 + 7.3) + 0.12 * valueNoise(p * 4.3 + 19.1);
}

// Слой пунктира. p — точка в долях ячейки, wake = (первый порог, разброс порогов), cellPx — размер ячейки
float stipple(vec2 p, float tone, vec2 wake, float cellPx) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(float(i), float(j));
      vec3 h = hash3(cell + offset);
      vec2 center = offset + 0.5 + (h.xy - 0.5) * 0.8;
      float grow = smoothstep(0.0, 0.32, tone - (wake.x + wake.y * h.z));
      float radius = mix(-0.25, 0.4 + 0.32 * fract(h.z * 7.13), grow);
      sum += exp(MERGE * (radius - length(f - center)));
    }
  }
  float field = log(sum) / MERGE + 0.9 * smoothstep(0.62, 0.97, tone);
  float edge = 0.8 / (cellPx * uDpr);
  return smoothstep(-edge, edge, field);
}

// Искры: одна на ячейку 34 px, есть в двух ячейках из пяти, радиус 0.6…1.7 px, слабое мерцание
float specks(vec2 px) {
  const float CELL = 34.0;
  vec2 p = px / CELL;
  vec3 h = hash3(floor(p) + 91.7);
  float exists = step(fract(h.z * 13.7), 0.4);
  vec2 center = 0.5 + (h.xy - 0.5) * 0.7;
  float d = length(fract(p) - center) * CELL;
  float radius = 0.6 + 1.1 * h.z;
  float twinkle = 0.78 + 0.22 * sin(uTime * 1.3 + h.x * 40.0);
  return exists * twinkle * (1.0 - smoothstep(radius - 0.6, radius + 0.6, d));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uDpr;
  float y = px.y * uDpr / uResolution.y;

  float front = mix(-WARP * BAND, 1.0 + BAND * (1.0 + WARP), uProgress);
  float warp = 2.0 * billow(px / 420.0 + vec2(0.0, uTime * 0.012)) - 1.0;
  float tone = clamp((front - y) / BAND + WARP * warp, 0.0, 1.0);
  if (tone <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float ink = 1.0;
  if (tone < 1.0) {
    float coarseCell = 10.0 * uGrain;
    float fineCell = 5.0 * uGrain;
    float coarse = stipple((px + vec2(0.0, uTime * 9.0)) / coarseCell, tone, vec2(0.02, 0.5), coarseCell);
    float fine = stipple((px + vec2(13.7, uTime * 5.0)) / fineCell, tone, vec2(0.22, 0.43), fineCell);
    ink = max(coarse, fine);
  }
  ink *= 1.0 - (1.0 - SPECK_FLOOR) * specks(px + vec2(0.0, uTime * 3.0));

  fragColor = vec4(VEIL_COLOR * ink, ink);
}
`;

/** Цвет запасного режима (нет WebGL или контекст потерян): тот же V, ровной заливкой без пунктира. */
export const VEIL_FALLBACK_COLOR = 'rgb(244, 244, 242)';

/** Зерно пунктира полное при меньшей стороне экрана от FULL_GRAIN_PX, на узких экранах — не мельче MIN_GRAIN. */
const FULL_GRAIN_PX = 900;
const MIN_GRAIN = 0.6;

export interface DuskVeil {
  resize(width: number, height: number, dpr: number): void;
  /** progress — ход вуали 0…1 (таймлайн), timeSeconds — время для всплытия зёрен. */
  render(progress: number, timeSeconds: number): void;
  dispose(): void;
}

export interface DuskVeilOptions {
  /** Контекст WebGL потерян: вуаль больше не рисует, сцена переходит на запасную заливку. */
  readonly onContextLost: () => void;
}

interface VeilUniforms {
  readonly resolution: WebGLUniformLocation | null;
  readonly dpr: WebGLUniformLocation | null;
  readonly grain: WebGLUniformLocation | null;
  readonly progress: WebGLUniformLocation | null;
  readonly time: WebGLUniformLocation | null;
}

function createVeilProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  try {
    return buildProgram(gl, { vertex: VERTEX_SHADER, fragment: FRAGMENT_SHADER });
  } catch (error) {
    console.error('Вуаль сумерек не запустилась', error);
    return null;
  }
}

function getVeilUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): VeilUniforms {
  return {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    dpr: gl.getUniformLocation(program, 'uDpr'),
    grain: gl.getUniformLocation(program, 'uGrain'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    time: gl.getUniformLocation(program, 'uTime'),
  };
}

export function createDuskVeil(canvas: HTMLCanvasElement, options: DuskVeilOptions): DuskVeil | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
  });
  if (!gl) return null;
  const program = createVeilProgram(gl);
  if (!program) return null;

  const uniforms = getVeilUniforms(gl, program);
  let isAlive = true;
  const handleContextLost = (): void => {
    isAlive = false;
    options.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);

  gl.useProgram(program);
  gl.disable(gl.BLEND);

  return {
    resize(width: number, height: number, dpr: number): void {
      if (!isAlive) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform1f(uniforms.grain, Math.min(1, Math.max(MIN_GRAIN, Math.min(width, height) / FULL_GRAIN_PX)));
    },

    render(progress: number, timeSeconds: number): void {
      if (!isAlive) return;
      gl.uniform1f(uniforms.progress, progress);
      gl.uniform1f(uniforms.time, timeSeconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose(): void {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      if (isAlive) gl.deleteProgram(program);
      isAlive = false;
    },
  };
}
