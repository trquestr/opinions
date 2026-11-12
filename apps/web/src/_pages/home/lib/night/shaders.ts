/*
 * Шейдеры ночной сцены (WebGL2). Три прохода: тушь (капли), линии (контур ковша и линии зрителя), звёзды.
 * Общие соглашения:
 *   - звёзды и линии приходят уже в экранных CSS-px: перспективную проекцию считает projection.ts (одна на всё);
 *   - из CSS-пикселей в клип-пространство: clip = px / uView · 2 − 1, ось y переворачивается (на экране она вниз);
 *   - цвет премультиплицирован (rgb уже умножен на альфу), смешивание ONE, ONE_MINUS_SRC_ALPHA;
 *   - холст прозрачный: ночной фон #0b0b0d даёт CSS сцены, под холстом лежат гравюры.
 */

/*
 * ТУШЬ — полноэкранный проход, капли как поля расстояния (SDF) со слипанием, как у бюста до a89f4a3.
 * Капли разложены по сетке (ink-grid.ts): пиксель смотрит свою ячейку и 8 соседних, в каждой до SLOTS капель.
 *
 * Капля — эллипс, вытянутый вдоль направления движения dir:
 *   полуоси a = r·(1 + 0.9·st) (вдоль), b = r / √(1 + 0.55·st) (поперёк) — площадь почти сохраняется;
 *   d ≈ (|(along/a, perp/b)| − 1) · min(a, b) — приближённое расстояние до края (точно для круга при st = 0).
 * Слипание соседних капель — гладкий минимум (полиномиальный smin):
 *   h = max(k − |d₁ − d₂|, 0) / k,  smin = min(d₁, d₂) − h²·k/4,
 *   k растёт с радиусом: мелкие капли почти не слипаются (k = 0.2r), крупные — заметно (k = min(4.6, 0.75r)).
 * Покрытие пикселя: ink = 1 − smoothstep(−aa, aa, d), aa = 0.75 / dpr (полпикселя экрана в CSS-px).
 * Цвет — светлая тушь ночи, премультиплицирован; холст прозрачный, фон даёт CSS.
 */
export const INK_VERTEX = `#version 300 es
layout(location = 0) in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`;

/*
 * Курсор — те же капли, что в прологе (landing.js): uCursorDots = (x, y, r, stretch), общее направление uCursorDir.
 * Форма капли курсора — «головка» с хвостиком (sdCursorDrop из landing.js): эллипс, растянутый вдоль dir в (1 + st)
 * и сжатый поперёк в 1/√(1 + 0.85·st), с сужением тыльной части taper = min(0.24, st/2) · smoothstep(rear).
 * Капли курсора слипаются между собой smin с k = 13 (клякса), а с тушью — smin с k = min(6.5, 1.3·r̄),
 * r̄ — радиус ближайших капель курсора (их вес — та же гладкая смесь).
 */
/** Форма капли курсора — как sdDroplet в landing.js (см. комментарий выше). */
const CURSOR_SHAPE_GLSL = `float sdCursorDrop(vec2 p, vec2 c, vec2 dir, float r, float stretch) {
  vec2 d = p - c;
  if (stretch <= 0.001) return length(d) - r;
  vec2 perp = vec2(-dir.y, dir.x);
  float qx = dot(d, dir);
  float qy = dot(d, perp);
  float sx = 1.0 + stretch;
  float sy = inversesqrt(1.0 + stretch * 0.85);
  float rear = clamp(-qx / max(0.001, r * sx), 0.0, 1.0);
  float taper = min(0.24, stretch * 0.5) * rear * rear * (3.0 - 2.0 * rear);
  vec2 qScaled = vec2(qx / sx, qy / (sy * (1.0 - taper)));
  return (length(qScaled) - r) * min(sx, sy);
}

float sdDroplet(vec2 p, vec2 c, vec2 dir, float r, float st) {
  vec2 d = p - c;
  float along = dot(d, dir);
  float perp = dot(d, vec2(-dir.y, dir.x));
  float a = r * (1.0 + st * 0.9);
  float b = r / sqrt(1.0 + st * 0.55);
  float l = length(vec2(along / a, perp / b));
  return (l - 1.0) * min(a, b);
}`;

/** Поле капель курсора: k = 13 между каплями, rCursor — их «средний» радиус рядом с пикселем. */
function cursorFieldGlsl(cursorDots: number): string {
  return `float cursorField(vec2 p, float aa, out float rCursor) {
  float dCursor = 1e5;
  rCursor = 0.0;
  if (uCursorCount == 0 || p.x < uCursorBBox.x || p.x > uCursorBBox.z || p.y < uCursorBBox.y || p.y > uCursorBBox.w) {
    return dCursor;
  }
  for (int j = 0; j < ${cursorDots}; j++) {
    if (j >= uCursorCount) break;
    vec4 cd = uCursorDots[j];
    vec2 dp = p - cd.xy;
    float limit = cd.z * (1.0 + cd.w) + 20.0;
    if (abs(dp.x) > limit || abs(dp.y) > limit) continue;
    float dDot = sdCursorDrop(p, cd.xy, uCursorDir, cd.z, cd.w * 0.65) + max(0.0, aa - cd.z);
    float w = clamp(0.5 - 0.5 * (dDot - dCursor) / 13.0, 0.0, 1.0);
    dCursor = smin(dCursor, dDot, 13.0);
    rCursor = mix(rCursor, cd.z, w);
  }
  return dCursor;
}`;
}

export function inkFragment(cellPx: number, slots: number, cursorDots: number): string {
  return `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uGrid;
uniform ivec2 uGridSize;
uniform float uDpr;
uniform float uViewHeight;
uniform int uCursorCount;
uniform vec4 uCursorDots[${cursorDots}];
uniform vec2 uCursorDir;
uniform vec4 uCursorBBox;
out vec4 outColor;

${CURSOR_SHAPE_GLSL}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

${cursorFieldGlsl(cursorDots)}
void main() {
  // CSS-px от левого верхнего угла (gl_FragCoord — от левого нижнего, в пикселях устройства)
  vec2 p = vec2(gl_FragCoord.x / uDpr, uViewHeight - gl_FragCoord.y / uDpr);
  ivec2 cell = ivec2(floor(p / ${cellPx.toFixed(1)}));
  float d = 1e5;
  for (int cy = -1; cy <= 1; cy++) {
    int y = cell.y + cy;
    if (y < 0 || y >= uGridSize.y) continue;
    int row0 = y * ${slots * 2};
    for (int cx = -1; cx <= 1; cx++) {
      int x = cell.x + cx;
      if (x < 0 || x >= uGridSize.x) continue;
      for (int s = 0; s < ${slots}; s++) {
        vec4 t0 = texelFetch(uGrid, ivec2(x, row0 + s * 2), 0);
        if (t0.z <= 0.0) break;
        float dd = length(p - t0.xy) - t0.z;
        if (t0.w > 0.02) {
          vec4 t1 = texelFetch(uGrid, ivec2(x, row0 + s * 2 + 1), 0);
          // Защита: при нулевом направлении эллипс вырождается и «заливает» всю окрестность квадратом
          float dirLength = length(t1.xy);
          if (dirLength > 0.5) dd = sdDroplet(p, t0.xy, t1.xy / dirLength, t0.z, t0.w);
        }
        float k = min(0.65, t0.z * 0.12);
        d = smin(d, dd, max(k, 0.001));
      }
    }
  }
  float aa = 0.75 / uDpr;
  float rCursor;
  float dCursor = cursorField(p, aa, rCursor);
  d = d > 9e4 ? dCursor : smin(d, dCursor, max(0.001, min(6.5, rCursor * 1.3)));
  float ink = 1.0 - smoothstep(-aa, aa, d);
  outColor = vec4(vec3(0.925, 0.925, 0.91) * ink, ink);
}`;
}

/*
 * ЛИНИИ. Экземпляр — отрезок из uniform-массива uSegments (x0, y0, x1, y1 в единицах ковша).
 * Первые uOutlineCount отрезков — привычный контур ковша (Н8) с альфой uAlpha.x, остальные — линии зрителя
 * (последняя может тянуться за курсором) с альфой uAlpha.y.
 * aCorner.x ∈ {0, 1} — вдоль отрезка, aCorner.y ∈ {−1, 1} — поперёк; n̂ — единичная нормаль к отрезку.
 * Полоса шире линии на 1 px для сглаживания: α = 1 − smoothstep(w/2 − 0.5, w/2 + 0.5, |поперёк|).
 */
export const LINE_VERTEX = `#version 300 es
layout(location = 0) in vec2 aCorner;
uniform vec4 uSegments[32];
uniform int uOutlineCount;
uniform vec2 uAlpha;
uniform vec2 uView;
uniform float uWidth;
out float vAcross;
out float vAlpha;

void main() {
  vec4 seg = uSegments[gl_InstanceID];
  vec2 a = seg.xy;
  vec2 b = seg.zw;
  vec2 dir = b - a;
  vec2 n = vec2(-dir.y, dir.x) / max(length(dir), 1e-3);
  float half_ = uWidth * 0.5 + 1.0;
  vec2 px = mix(a, b, aCorner.x) + n * aCorner.y * half_;
  vec2 clip = px / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vAcross = aCorner.y * half_;
  vAlpha = gl_InstanceID < uOutlineCount ? uAlpha.x : uAlpha.y;
}`;

export const LINE_FRAGMENT = `#version 300 es
precision highp float;
in float vAcross;
in float vAlpha;
uniform float uWidth;
out vec4 outColor;

void main() {
  float a = (1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, abs(vAcross))) * vAlpha;
  outColor = vec4(vec3(0.96, 0.93, 0.86) * a, a);
}`;

/*
 * ЗВЁЗДЫ. Экземпляр — звезда: aPos, aLook = (размер ядра s в px, яркость, вид), aTint = (тон, поворот лучей).
 * Вид 0 — фоновая, aPos в долях экрана (px = aPos · uView); 1 — звезда ковша, 2 — тусклая для рисования
 * (обе в единицах ковша). Альфа по виду — uAlpha.x / .y / .z (считает таймлайн). Облик семи звёзд — stars.ts.
 * Курсора здесь нет вовсе: звёзды под рукой не двигаются. Сияние меняет только яркость и лучи, не положение.
 *
 * Свечение в координатах q = offset / s (в размерах ядра), φ — личная фаза звезды (хэш её номера), t = uTime:
 *   мерцание   m = 1 + 0.28·sin(1.3t + φ) + 0.12·sin(3.1t + 1.7φ) — две несоизмеримые частоты, без явного периода;
 *   вспышка    f = max(0, sin(0.45t + 3φ))^30 — короткий всплеск раз в ~14 с, у каждой звезды в своё время;
 *   ядро       C = exp(−1.2·|q|²) · (1 + 0.5·f);
 *   ореол      H = 0.24·exp(−|q|²/9) · (0.8 + 0.2·sin(0.7t + φ)) — медленно «дышит»;
 *   лучи (только семь звёзд ковша), q повёрнут на ψ = поворот звезды + 0.08·sin(0.3t + φ):
 *              крест L₊ = e^(−2.2|q_y|)·e^(−|q_x|/ℓ) + e^(−2.2|q_x|)·e^(−|q_y|/ℓ),
 *              диагонали L× = e^(−3|d_y|)·e^(−|d_x|/(0.45ℓ)), d — q, повёрнутый ещё на 45°;
 *              длина ℓ = 3.75·(0.8 + 0.2·sin(0.9t + 2φ))·(1 + 0.3·f), яркость лучей ×(1 + 0.6·f)
 *              (вспышка только чуть удлиняет и подсвечивает лучи — сильнее выходил крест через полэкрана);
 *   I = (C + (0.32·L₊ + 0.1·L×)·(1 + 0.6·f)) · m + H.
 * Цвет — та же светлая тушь, что у фигур и у искр вуали сумерек: ночь — негатив дневного листа, синевы в ней нет
 * (решение владельца 2026-11-12, вместо голубоватых звёзд от 2026-11-11). Ядро (0.97, 0.97, 0.95), ореол и лучи —
 * от тёплой серой (0.84, 0.82, 0.78) при тоне 0 до светлой туши (0.925, 0.925, 0.91) при тоне 1; смесь по доле ядра. Квадрат звезды ковша — 10s (лучи), остальных — 4s.
 */
export const STAR_VERTEX = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPos;
layout(location = 2) in vec3 aLook;
layout(location = 3) in vec2 aTint;
uniform vec3 uAlpha;
uniform vec2 uView;
out vec2 vOffset;
out float vSize;
out float vIntensity;
out float vPhase;
out float vIsDipper;
out vec2 vTint;

void main() {
  float kind = aLook.z;
  // Положение уже спроецировано (star-field.ts): фоновые — с небесной сферы, ковш и тусклые — из мира
  vec2 center = aPos;
  float alpha = kind < 0.5 ? uAlpha.x : (kind < 1.5 ? uAlpha.y : uAlpha.z);
  vIsDipper = step(0.5, kind) * step(kind, 1.5);
  float extent = aLook.x * mix(4.0, 10.0, vIsDipper);
  vec2 px = center + aCorner * extent;
  vec2 clip = px / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vOffset = aCorner * extent;
  vSize = aLook.x;
  vIntensity = aLook.y * alpha;
  // Фаза — хэш номера звезды, а не положения: положение теперь экранное и меняется с камерой каждый кадр
  vPhase = fract(sin(float(gl_InstanceID) * 12.9898 + 4.1) * 43758.5453) * 6.2831853;
  vTint = aTint;
}`;

export const STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vOffset;
in float vSize;
in float vIntensity;
in float vPhase;
in float vIsDipper;
in vec2 vTint;
uniform float uTime;
uniform vec2 uViewAngle;
out vec4 outColor;

vec2 rotate(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

float rays(vec2 q, float rayLength) {
  vec2 a = abs(q);
  float cross = exp(-2.2 * a.y) * exp(-a.x / rayLength) + exp(-2.2 * a.x) * exp(-a.y / rayLength);
  vec2 d = abs(rotate(q, 0.78539816));
  float diagonal = exp(-3.0 * d.y) * exp(-d.x / (0.45 * rayLength));
  return 0.32 * cross + 0.1 * diagonal;
}

void main() {
  vec2 q = vOffset / vSize;
  float r2 = dot(q, q);
  float twinkle = 1.0 + 0.28 * sin(uTime * 1.3 + vPhase) + 0.12 * sin(uTime * 3.1 + vPhase * 1.7);
  float flare = pow(max(0.0, sin(uTime * 0.45 + vPhase * 3.0)), 30.0);
  float core = exp(-1.2 * r2) * (1.0 + 0.5 * flare);
  // Блик от ракурса (владелец 2026-11-12): при повороте камеры звезда как будто поворачивается гранью —
  // g = 1 + 0.25·sin(9ψ + φ)·cos(7θ + 2φ), ψ/θ — рыскание и тангаж камеры; у каждой звезды своя фаза φ
  float facet = 1.0 + 0.25 * sin(uViewAngle.x * 9.0 + vPhase) * cos(uViewAngle.y * 7.0 + vPhase * 2.0);
  float halo = 0.24 * exp(-r2 / 9.0) * (0.8 + 0.2 * sin(uTime * 0.7 + vPhase)) * facet;
  float rayLength = 3.75 * (0.8 + 0.2 * sin(uTime * 0.9 + vPhase * 2.0)) * (1.0 + 0.3 * flare);
  // Лучи поворачиваются вслед за ракурсом: β = (1.2 + 0.8·frac(φ))·ψ — у каждой звезды на свой угол
  float follow = 1.2 + 0.8 * fract(vPhase * 0.159);
  float spin = vTint.y + 0.08 * sin(uTime * 0.3 + vPhase) + follow * uViewAngle.x;
  float glare = vIsDipper * rays(rotate(q, spin), rayLength) * (1.0 + 0.6 * flare) * facet;
  float intensity = ((core + glare) * twinkle + halo) * vIntensity;
  float alpha = min(intensity, 1.0);
  vec3 glow = mix(vec3(0.84, 0.82, 0.78), vec3(0.925, 0.925, 0.91), vTint.x);
  vec3 color = mix(glow, vec3(0.97, 0.97, 0.95), clamp(core * 1.4, 0.0, 1.0));
  outColor = vec4(color * alpha, alpha);
}`;
