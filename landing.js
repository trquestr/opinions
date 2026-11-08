/**
 * WebGL2 Capillary SDF Morph + GSAP:
 *
 * 1. Точки плавно всплывают из белого полотна (0..1.1с), затем с ускорением летят к буквам
 *    и плавно замедляются перед точкой касания штриха (полёт ~1.5..2.0с).
 * 2. Значительную часть времени всей анимации (~3.6..4.6с на каждую каплю) занимает
 *    ПОСТЕПЕННОЕ перетекание точек в буквы:
 *    - Позиция капли задаётся гладкой суммой C(t) = BezierFlight(f) + StrokeGlide(absorb),
 *      а растущий участок штриха идёт строго от точки касания BezierFlight(f) до центра капли C(t).
 *    - При absorb = 0 длина штриха равна 0 и он полностью скрыт внутри круглой капли —
 *      никакая линия не может появиться «из ничего» или выстрелить вперёд капли.
 *    - На протяжении 3.6..4.6 секунд круглая капля медленно скользит вдоль контура буквы,
 *      постепенно вытягивая за собой тонкий штрих через жидкий мениск smin(dCore, dStroke, kNeck)
 *      и плавно уменьшаясь в радиусе ровно до момента окончания своего штриха (absorb == 1).
 */
(function () {
  'use strict';

  const canvas = document.getElementById('gl-canvas');
  const replayBtn = document.getElementById('replay-btn');

  const hero = canvas.closest('.hero');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameId = 0;
  let contextLost = false;
  function showFallback() {
    contextLost = true;
    cancelAnimationFrame(frameId);
    hero.classList.remove('is-ready');
    replayBtn.hidden = true;
  }

  let gl;
  try {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
  } catch (_) {
    showFallback();
    return;
  }
  if (!gl) {
    showFallback();
    return;
  }

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const MAX_DROPS = 96;
  const MAX_CURSOR_DOTS = 128;

  // ==========================================================================
  // GLSL ШЕЙДЕРЫ (WebGL2)
  // ==========================================================================
  const vsSource = `#version 300 es
    in vec2 a_pos;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const fsSource = `#version 300 es
    precision highp float;

    uniform vec2 u_res;
    uniform float u_dpr;
    uniform float u_time;
    uniform float u_strokeR;
    uniform float u_yahArcR;

    // Капли и постепенно вытекающие из них штрихи (1 капля = 1 уникальный участок буквы)
    uniform int u_dropCount;
    uniform vec4 u_dropCore[${MAX_DROPS}];   // (cx, cy, stretchDirX, stretchDirY) овально-каплевидного ядра точки
    uniform vec4 u_dropSeg[${MAX_DROPS}];    // type 0: (startX, startY, curX, curY), type 1: (arcCx, arcCy, aMid, da)
    uniform vec4 u_dropParams[${MAX_DROPS}]; // (rCore, absorb, wet, segType)

    // Скрытые точки под курсором
    uniform int u_cursorCount;
    uniform vec4 u_cursorDots[${MAX_CURSOR_DOTS}]; // (x, y, r, stretchRatio)
    uniform vec2 u_cursorDir;                      // (cosA, sinA)
    uniform vec4 u_cursorBBox;                     // (minX, minY, maxX, maxY)

    out vec4 outColor;

    float sdSegment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float denom = dot(ba, ba);
      float h = denom > 0.0001 ? clamp(dot(pa, ba) / denom, 0.0, 1.0) : 0.0;
      return length(pa - ba * h);
    }

    // Гладкая овальная/каплевидная форма (без параллельных прямых стенок капсулы-«гусеницы»):
    // при движении плавно вытягивается вдоль вектора скорости dir, слегка сужаясь с боков и к хвостику
    float sdDroplet(vec2 p, vec2 c, vec2 dir, float r, float stretch) {
      vec2 d = p - c;
      if (stretch <= 0.001) return length(d) - r;
      vec2 perp = vec2(-dir.y, dir.x);
      float qx = dot(d, dir);
      float qy = dot(d, perp);

      float sx = 1.0 + stretch;
      float sy = inversesqrt(1.0 + stretch * 0.85);

      // Каплевидный профиль: круглая головка спереди (qx > 0) и плавно сужающийся хвостик сзади (qx < 0)
      float normX = clamp(qx / max(0.001, r * sx), -1.0, 1.0);
      float tearTaper = 1.0 + normX * min(0.24, stretch * 0.32);

      vec2 qScaled = vec2(qx / sx, qy / (sy * tearTaper));
      return (length(qScaled) - r) * min(sx, sy);
    }

    // Точное расстояние до дуги окружности с центром c, радиусом r, средним углом aMid и полураствором da
    float sdArc(vec2 p, vec2 c, float r, float aMid, float da) {
      vec2 d = p - c;
      vec2 u = vec2(cos(aMid), sin(aMid));
      vec2 v = vec2(-u.y, u.x);
      vec2 q = vec2(dot(d, u), abs(dot(d, v)));
      float s = sin(da);
      float cs = cos(da);
      if (q.x * s > q.y * cs) {
        return abs(length(q) - r);
      }
      return length(q - vec2(cs, s) * r);
    }

    float smin(float a, float b, float k) {
      if (k <= 0.001) return min(a, b);
      float h = max(k - abs(a - b), 0.0) / k;
      return min(a, b) - h * h * k * 0.25;
    }

    void main() {
      vec2 p = vec2(gl_FragCoord.x / u_dpr, u_res.y - gl_FragCoord.y / u_dpr);

      // dCores объединяет сами круглые капли друг с другом через жидкий метаболл smin,
      // а dStrokes хранит вытекающие из капель штрихи букв с живой флюидной кромкой по граням
      float dCores = 1e5;
      float dStrokes = 1e5;

      for (int i = 0; i < ${MAX_DROPS}; i++) {
        if (i >= u_dropCount) break;
        vec4 params = u_dropParams[i];
        float rCore = params.x;
        float absorb = params.y;
        float wet = params.z;
        float segType = params.w;

        if (rCore <= 0.01 && absorb <= 0.001) continue;

        float dCore = 1e5;
        if (rCore > 0.01) {
          vec4 core = u_dropCore[i];
          vec2 sVec = core.zw;
          float stretch = length(sVec);
          vec2 dir = stretch > 0.001 ? (sVec / stretch) : vec2(1.0, 0.0);
          dCore = sdDroplet(p, core.xy, dir, rCore, stretch);
          float kCore = min(9.5, rCore * 1.45);
          dCores = smin(dCores, dCore, kCore);
        }

        // Штрих буквы тянется от точки касания до текущего центра самой капли:
        // ось штриха остаётся 100% прямой (не колбасится), а по самой ГРАНИ буквы идут
        // плавные капиллярные микро-наплывы поверхностного натяжения (edgeFluid >= 0)
        if (absorb > 0.001) {
          vec4 seg = u_dropSeg[i];
          float dStrokeRaw;
          float sCoord = 0.0;
          float h = 0.0;
          float side = 0.0;

          if (segType < 0.5) {
            vec2 pa = p - seg.xy;
            vec2 ba = seg.zw - seg.xy;
            float len2 = dot(ba, ba);
            float len = sqrt(max(len2, 0.0001));
            h = len2 > 0.0001 ? clamp(dot(pa, ba) / len2, 0.0, 1.0) : 0.0;
            vec2 closest = seg.xy + ba * h;
            dStrokeRaw = length(p - closest);
            sCoord = h * len;
          } else {
            dStrokeRaw = sdArc(p, seg.xy, u_yahArcR, seg.z, seg.w);
            vec2 dArcVec = p - seg.xy;
            float ang = atan(dArcVec.y, dArcVec.x);
            float delta = atan(sin(ang - seg.z), cos(ang - seg.z));
            sCoord = abs(delta) * u_yahArcR;
            h = seg.w > 0.001 ? clamp(0.5 + delta / max(0.001, 2.0 * seg.w), 0.0, 1.0) : 0.0;
          }

          float edgeFluid = 0.0;
          if (wet > 0.001 && dStrokeRaw < u_strokeR + 12.0) {
            float phase = float(i) * 1.73;
            // Огибающая sin(h * PI) строго обнуляет флюидное утолщение на обоих концах участка (h = 0 и h = 1),
            // поэтому на стыках двух участков толщина всегда совпадает с точностью до 0.0px (без ступенек!)
            float envelope = sin(h * 3.14159265);
            float w1 = 0.5 + 0.5 * sin(sCoord * 0.13 - u_time * 2.4 + phase);
            float w2 = 0.5 + 0.5 * sin(sCoord * 0.23 + u_time * 1.7 - phase * 1.2);
            float bead = pow(w1 * 0.65 + w2 * 0.35, 1.8);

            edgeFluid = wet * envelope * (0.22 + bead * 0.95);
          }

          float dStroke = dStrokeRaw - (u_strokeR + edgeFluid);
          float dOwn = dStroke;

          if (rCore > 0.01) {
            // Плавный каплевидный мениск перетекания круглой капли в тонкую линию буквы
            float kNeck = rCore * 1.38 * (1.0 - absorb * 0.28);
            dOwn = smin(dCore, dStroke, kNeck);
          }

          // Чистый min без smin между коллинеарными штрихами, чтобы на стыках не возникало утолщения smin(d, d)
          dStrokes = min(dStrokes, dOwn);
        }
      }

      float dText = min(dCores, dStrokes);

      // Скрытые точки под курсором (если курсор есть на странице)
      float dCursor = 1e5;
      if (u_cursorCount > 0 &&
          p.x >= u_cursorBBox.x && p.x <= u_cursorBBox.z &&
          p.y >= u_cursorBBox.y && p.y <= u_cursorBBox.w) {
        for (int j = 0; j < ${MAX_CURSOR_DOTS}; j++) {
          if (j >= u_cursorCount) break;
          vec4 cd = u_cursorDots[j];
          float r = cd.z;
          float stretch = cd.w;
          vec2 c = cd.xy;

          float dDot = sdDroplet(p, c, u_cursorDir, r, stretch * 0.65);
          dCursor = smin(dCursor, dDot, 13.0);
        }
      }

      float d = smin(dText, dCursor, 6.5);

      float aa = 0.7 / u_dpr;
      float ink = 1.0 - smoothstep(-aa, aa, d);
      vec3 col = mix(vec3(1.0), vec3(0.0), ink);
      outColor = vec4(col, 1.0);
    }
  `;

  function compileShader(type, source) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  const prog = gl.createProgram();
  const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);
  if (!prog || !vertexShader || !fragmentShader) {
    showFallback();
    return;
  }
  gl.attachShader(prog, vertexShader);
  gl.attachShader(prog, fragmentShader);
  gl.linkProgram(prog);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    showFallback();
    return;
  }
  gl.useProgram(prog);

  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uDpr = gl.getUniformLocation(prog, 'u_dpr');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uStrokeR = gl.getUniformLocation(prog, 'u_strokeR');
  const uYahArcR = gl.getUniformLocation(prog, 'u_yahArcR');

  const uDropCount = gl.getUniformLocation(prog, 'u_dropCount');
  const uDropCore = gl.getUniformLocation(prog, 'u_dropCore');
  const uDropSeg = gl.getUniformLocation(prog, 'u_dropSeg');
  const uDropParams = gl.getUniformLocation(prog, 'u_dropParams');

  const uCursorCount = gl.getUniformLocation(prog, 'u_cursorCount');
  const uCursorDots = gl.getUniformLocation(prog, 'u_cursorDots');
  const uCursorDir = gl.getUniformLocation(prog, 'u_cursorDir');
  const uCursorBBox = gl.getUniformLocation(prog, 'u_cursorBBox');

  const dropCoreData = new Float32Array(MAX_DROPS * 4);
  const dropSegData = new Float32Array(MAX_DROPS * 4);
  const dropParamsData = new Float32Array(MAX_DROPS * 4);
  const cursorDotsData = new Float32Array(MAX_CURSOR_DOTS * 4);

  // ==========================================================================
  // ГЕОМЕТРИЯ СЛОВА «МНЕНИЯ» И КАПИЛЛЯРНЫХ КАПЕЛЬ
  // ==========================================================================
  let strokeR = 1.15;
  let yahArcR = 24;
  let drops = [];
  let mainTimeline = null;

  function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return (uu * u) * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + (tt * t) * p3;
  }

  function cubicBezierTangent(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
  }

  function buildWordAndDrops() {
    const H = Math.max(1, Math.min(width * 0.12, (width - 40) / 7.02, height * 0.28, 134));
    strokeR = Math.max(0.95, H * 0.0095);
    const tracking = H * 0.58;

    const letterSpecs = [
      { ch: 'М', w: 0.88 },
      { ch: 'Н', w: 0.68 },
      { ch: 'Е', w: 0.56 },
      { ch: 'Н', w: 0.68 },
      { ch: 'И', w: 0.68 },
      { ch: 'Я', w: 0.64 }
    ];

    const totalW = letterSpecs.reduce((acc, l) => acc + l.w * H, 0) + tracking * (letterSpecs.length - 1);
    let curX = (width - totalW) * 0.5;
    const topY = (height - H) * 0.5;

    const subSegments = [];
    let strokeGroupCounter = 0;

    // Разбивает прямой штрих [x0,y0 -> x1,y1] на неперекрывающиеся участки с РАЗНЫМИ точками входа
    const addStroke = (x0, y0, x1, y1, parts, letterIdx) => {
      const groupIdx = strokeGroupCounter++;
      if (parts <= 1) {
        const flip = Math.random() < 0.5;
        subSegments.push({
          type: 0,
          letterIdx,
          groupIdx,
          ax: flip ? x1 : x0,
          ay: flip ? y1 : y0,
          bx: flip ? x0 : x1,
          by: flip ? y0 : y1
        });
        return;
      }

      // Генерируем parts - 1 точек сечения вдоль штриха без перекрытий
      const cuts = [];
      for (let p = 1; p < parts; p++) {
        const base = p / parts;
        const jitter = (Math.random() - 0.5) * (0.40 / parts);
        cuts.push(base + jitter);
      }
      cuts.sort((a, b) => a - b);
      const points = [0, ...cuts, 1];

      for (let s = 0; s < parts; s++) {
        const tA = points[s];
        const tB = points[s + 1];
        const pAx = x0 + (x1 - x0) * tA;
        const pAy = y0 + (y1 - y0) * tA;
        const pBx = x0 + (x1 - x0) * tB;
        const pBy = y0 + (y1 - y0) * tB;
        const flip = Math.random() < 0.5;
        subSegments.push({
          type: 0,
          letterIdx,
          groupIdx,
          ax: flip ? pBx : pAx,
          ay: flip ? pBy : pAy,
          bx: flip ? pAx : pBx,
          by: flip ? pAy : pBy
        });
      }
    };

    for (let li = 0; li < letterSpecs.length; li++) {
      const { ch, w } = letterSpecs[li];
      const lw = w * H;
      const xL = curX;
      const xR = curX + lw;
      const xM = curX + lw * 0.5;
      const yT = topY;
      const yB = topY + H;
      const yM = topY + H * 0.50;

      if (ch === 'М') {
        addStroke(xL, yB, xL, yT, 4, li);
        addStroke(xL, yT, xM, yB - H * 0.14, 3, li);
        addStroke(xM, yB - H * 0.14, xR, yT, 3, li);
        addStroke(xR, yT, xR, yB, 4, li);
      } else if (ch === 'Н') {
        addStroke(xL, yT, xL, yB, 4, li);
        addStroke(xR, yT, xR, yB, 4, li);
        addStroke(xL, yM, xR, yM, 2, li);
      } else if (ch === 'Е') {
        addStroke(xL, yT, xL, yB, 4, li);
        addStroke(xL, yT, xR, yT, 2, li);
        addStroke(xL, yM, xL + lw * 0.86, yM, 2, li);
        addStroke(xL, yB, xR, yB, 2, li);
      } else if (ch === 'И') {
        addStroke(xL, yT, xL, yB, 4, li);
        addStroke(xL, yB, xR, yT, 4, li);
        addStroke(xR, yT, xR, yB, 4, li);
      } else if (ch === 'Я') {
        addStroke(xR, yT, xR, yB, 4, li);

        const bowlH = H * 0.54;
        yahArcR = bowlH * 0.5;
        const arcCx = xL + yahArcR + H * 0.02;
        const arcCy = yT + yahArcR;

        // Верхняя и нижняя перекладины головки «Я»
        addStroke(arcCx, yT, xR, yT, 2, li);
        addStroke(arcCx, yT + bowlH, xR, yT + bowlH, 2, li);

        // Полукруглая дуга «Я»: 4 четверти дуги (капли входят с разных сторон и сходятся навстречу)
        const arcGroup = strokeGroupCounter++;
        subSegments.push({
          type: 1, letterIdx: li, groupIdx: arcGroup,
          arcCx, arcCy, a0: Math.PI, aEnd: Math.PI * 1.25,
          ax: arcCx - yahArcR, ay: arcCy,
          bx: arcCx + Math.cos(Math.PI * 1.25) * yahArcR, by: arcCy + Math.sin(Math.PI * 1.25) * yahArcR
        });
        subSegments.push({
          type: 1, letterIdx: li, groupIdx: arcGroup,
          arcCx, arcCy, a0: Math.PI * 1.5, aEnd: Math.PI * 1.25,
          ax: arcCx, ay: arcCy - yahArcR,
          bx: arcCx + Math.cos(Math.PI * 1.25) * yahArcR, by: arcCy + Math.sin(Math.PI * 1.25) * yahArcR
        });
        subSegments.push({
          type: 1, letterIdx: li, groupIdx: arcGroup,
          arcCx, arcCy, a0: Math.PI, aEnd: Math.PI * 0.75,
          ax: arcCx - yahArcR, ay: arcCy,
          bx: arcCx + Math.cos(Math.PI * 0.75) * yahArcR, by: arcCy + Math.sin(Math.PI * 0.75) * yahArcR
        });
        subSegments.push({
          type: 1, letterIdx: li, groupIdx: arcGroup,
          arcCx, arcCy, a0: Math.PI * 0.5, aEnd: Math.PI * 0.75,
          ax: arcCx, ay: arcCy + yahArcR,
          bx: arcCx + Math.cos(Math.PI * 0.75) * yahArcR, by: arcCy + Math.sin(Math.PI * 0.75) * yahArcR
        });

        // Диагональная ножка «Я»
        addStroke(arcCx + H * 0.04, yT + bowlH, xL, yB, 3, li);
      }

      curX += lw + tracking;
    }

    // Минимальная дистанция появления от конечной точки штриха (буквы):
    // точки не должны появляться в упор к буквам
    const minSpawnDist = Math.max(150, Math.min(Math.min(width, height) * 0.30, 240));
    const margin = 28;

    drops = [];

    const calcMaxDist = (ax, ay, ca, sa) => {
      let md = 10000;
      if (ca < -0.001) md = Math.min(md, (margin - ax) / ca);
      if (ca > 0.001)  md = Math.min(md, (width - margin - ax) / ca);
      if (sa < -0.001) md = Math.min(md, (margin - ay) / sa);
      if (sa > 0.001)  md = Math.min(md, (height - margin - ay) / sa);
      return Math.max(0, md);
    };

    for (let i = 0; i < subSegments.length && i < MAX_DROPS; i++) {
      const seg = subSegments[i];

      // Единичный вектор направления растекания внутри самой буквы (ux, uy):
      // капля должна прилетать с обратной стороны (-ux, -uy) и входить в штрих ПО КАСАТЕЛЬНОЙ в том же направлении!
      let ux = 0;
      let uy = 1;
      if (seg.type === 0) {
        const sLen = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay) || 1;
        ux = (seg.bx - seg.ax) / sLen;
        uy = (seg.by - seg.ay) / sLen;
      } else {
        const dirSign = seg.aEnd >= seg.a0 ? 1 : -1;
        ux = -Math.sin(seg.a0) * dirSign;
        uy = Math.cos(seg.a0) * dirSign;
      }

      // Точка рождается в узком секторе позади направления штриха (-ux, -uy) и летит по ПРЯМОЙ линии к (ax, ay),
      // чтобы не было ни извилистых дуг в воздухе, ни резкого перелома направления при втекании в букву
      const upstreamAngle = Math.atan2(-uy, -ux) + (Math.random() - 0.5) * 0.48;
      let finalAngle = upstreamAngle;
      let cosA = Math.cos(finalAngle);
      let sinA = Math.sin(finalAngle);

      let maxDistInDir = calcMaxDist(seg.ax, seg.ay, cosA, sinA);
      if (maxDistInDir < minSpawnDist) {
        // Если в этом направлении луч упирается в границу экрана слишком близко к букве,
        // поворачиваем его в сторону открытого вертикального пространства
        const preferY = seg.ay > height * 0.5 ? -Math.PI * 0.5 : Math.PI * 0.5;
        finalAngle = upstreamAngle * 0.25 + preferY * 0.75;
        cosA = Math.cos(finalAngle);
        sinA = Math.sin(finalAngle);
        maxDistInDir = calcMaxDist(seg.ax, seg.ay, cosA, sinA);
      }

      const effectiveMin = Math.min(minSpawnDist, maxDistInDir * 0.85);
      const effectiveMax = Math.max(effectiveMin + 20, maxDistInDir - 12);
      const radial = Math.pow(Math.random(), 0.82);
      const dist = effectiveMin + radial * (effectiveMax - effectiveMin);

      const sx = Math.max(margin, Math.min(width - margin, seg.ax + cosA * dist));
      const sy = Math.max(margin, Math.min(height - margin, seg.ay + sinA * dist));

      const cx1 = sx + (seg.ax - sx) * 0.33;
      const cy1 = sy + (seg.ay - sy) * 0.33;
      const cx2 = sx + (seg.ax - sx) * 0.67;
      const cy2 = sy + (seg.ay - sy) * 0.67;

      const sizeRoll = Math.random();
      let rDrop;
      if (sizeRoll < 0.45) {
        rDrop = 3.2 + Math.random() * 2.2;  // 3.2..5.4px
      } else if (sizeRoll < 0.80) {
        rDrop = 5.6 + Math.random() * 2.6;  // 5.6..8.2px
      } else {
        rDrop = 8.4 + Math.random() * 3.6;  // 8.4..12.0px
      }

      drops.push({
        type: seg.type,
        letterIdx: seg.letterIdx,
        groupIdx: seg.groupIdx,
        sx,
        sy,
        cx1,
        cy1,
        cx2,
        cy2,
        ax: seg.ax,
        ay: seg.ay,
        bx: seg.bx,
        by: seg.by,
        arcCx: seg.arcCx || 0,
        arcCy: seg.arcCy || 0,
        a0: seg.a0 || 0,
        aEnd: seg.aEnd || 0,
        flowUx: ux,
        flowUy: uy,
        rDrop,
        radial,
        seed: i * 2.39996 + Math.random() * 10.0,
        // Анимируемые через GSAP параметры:
        emerge: 0,      // 0 -> 1: всплытие круглой точки из полотна
        flight: 0,      // 0 -> 1: полёт точки от (sx, sy) к точке касания штриха (ax, ay)
        absorb: 0,      // 0 -> 1: динамичное растекание вдоль штриха (ax,ay -> bx,by) по инерции удара
        wet: 1,         // 1 -> 0: капиллярная флюидность свежих чернил буквы
        stretchX: 0,    // плавно сглаженный вектор овально-каплевидного растяжения по X
        stretchY: 0,    // плавно сглаженный вектор овально-каплевидного растяжения по Y
        prevFlight: 0,
        prevAbs: 0
      });
    }
  }

  function playGsapChoreography(progress = 0) {
    if (mainTimeline) {
      mainTimeline.kill();
    }

    buildWordAndDrops();
    mainTimeline = null;
    const canAnimate = !motionPreference.matches && typeof window.gsap !== 'undefined';
    replayBtn.hidden = !canAnimate;
    if (!canAnimate) {
      for (const drop of drops) Object.assign(drop, { emerge: 1, flight: 1, absorb: 1, wet: 0, prevFlight: 1, prevAbs: 1 });
      return;
    }

    // Выстраиваем каскадную очерёдность (ближние капли с рандомным разбросом прилетают первыми уже через ~0.65с,
    // а дальние подлетают поочерёдно на протяжении ~3.2с), чтобы точки НИКОГДА не ждали друг друга на местах!
    const order = Array.from({ length: drops.length }, (_, i) => ({
      i,
      score: drops[i].radial * 0.45 + Math.random() * 0.55
    }))
      .sort((a, b) => a.score - b.score)
      .map((item) => item.i);

    mainTimeline = window.gsap.timeline();

    const flightEases = ['power1.in', 'sine.in'];
    const absorbEases = ['power2.out', 'power3.out'];

    // Профиль интервалов между стартами движения капель (для ~71 капли):
    // в начале интервал больше (~0.14с), затем темп стремительно нарастает (интервал сжимается до ~0.042с),
    // а к финалу, когда буквы уже активно выливаются и растекаются, темп плавно смягчается
    const launchTimes = [];
    let curLaunch = 0.50;
    for (let rank = 0; rank < order.length; rank++) {
      if (rank === 0) {
        launchTimes.push(curLaunch);
      } else {
        const r = (rank - 1) / Math.max(1, order.length - 2);
        const gap = 0.12 * Math.pow(1 - r, 2.5) + 0.018 + 0.024 * Math.pow(r, 2.0);
        curLaunch += gap;
        launchTimes.push(curLaunch);
      }
    }

    for (let rank = 0; rank < order.length; rank++) {
      const idx = order[rank];
      const d = drops[idx];
      const normRank = rank / Math.max(1, order.length - 1);

      const tLaunch = launchTimes[rank];

      // Время ожидания капли на месте до старта: от ~0.44с до ~0.28с
      // (капли не висят подолгу, а всплывают, коротко парят и дышат, после чего подхватываются потоком)
      const hoverDuration = 0.44 - normRank * 0.16;
      const emergeDur = 0.38;
      const tBirth = Math.max(0.10, tLaunch - hoverDuration);

      const flightDur = (0.50 + Math.random() * 0.12) * (0.80 + d.radial * 0.30);
      const flightEase = flightEases[rank % flightEases.length];

      // В момент касания штриха вся кинетическая энергия полёта мгновенно переходит в растекание
      const tAbsorbStart = tLaunch + flightDur;
      const absorbDur = (0.95 + (d.rDrop / 13.6) * 0.25 + Math.random() * 0.18) * (0.95 - normRank * 0.15);
      const absorbEase = absorbEases[rank % absorbEases.length];

      mainTimeline.to(d, {
        emerge: 1,
        duration: emergeDur,
        ease: 'power2.out'
      }, tBirth);

      mainTimeline.to(d, {
        flight: 1,
        duration: flightDur,
        ease: flightEase
      }, tLaunch);

      mainTimeline.to(d, {
        absorb: 1,
        duration: absorbDur,
        ease: absorbEase
      }, tAbsorbStart);

      // Пока участок буквы растекается и сразу после его появления, его грани остаются «мокрыми»
      // и живо переливаются поверхностным натяжением (wet: 1 -> 0), а в финале стабилизируются в чёткий штрих
      mainTimeline.to(d, {
        wet: 0,
        duration: 1.20,
        ease: 'sine.inOut'
      }, tAbsorbStart + absorbDur * 0.50);
    }
    mainTimeline.progress(progress);
    if (document.hidden) mainTimeline.pause();
  }

  // ==========================================================================
  // СКРЫТОЕ ПОЛЕ ТОЧЕК ПОД КУРСОРОМ
  // ==========================================================================
  const pointer = {
    x: -9999,
    y: -9999,
    lastX: -9999,
    lastY: -9999,
    accX: 0,
    accY: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    angle: 0,
    inside: false,

    moveTo(x, y) {
      if (!this.inside) {
        this.inside = true;
        this.lastX = x;
        this.lastY = y;
      }
      this.accX += x - this.lastX;
      this.accY += y - this.lastY;
      this.lastX = this.x = x;
      this.lastY = this.y = y;
    },

    leave() {
      this.inside = false;
      this.accX = 0;
      this.accY = 0;
    },

    update(s) {
      const k = 1 - Math.pow(0.75, s);
      this.vx += (this.accX - this.vx) * k;
      this.vy += (this.accY - this.vy) * k;
      this.accX = 0;
      this.accY = 0;
      this.speed = Math.hypot(this.vx, this.vy);
      if (this.speed < 0.1) {
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
      } else if (this.speed > 0.3) {
        this.angle = Math.atan2(this.vy, this.vx);
      }
    }
  };

  const CURSOR_CFG = {
    fieldRadius: 42,
    density: 2,
    minDist: 18.8,
    maxRadius: 12,
    stretch: 1.0,
    goo: true,
    clickMode: 'shockwave',
    clickRadius: 55,
    clickPower: 0.4,
    hideCursor: true
  };
  const BIN = 64;
  const PAD = 32;

  let fieldCount = 0;
  let FX, FY, FDX, FDY, FR, FT, FST, FSF, FGS, FSS, FIN;
  let activeField = [];
  let bins = [];
  let binCols = 0;
  let binRows = 0;
  const cursorWaves = [];

  function triggerCursorClick(cx, cy) {
    if (CURSOR_CFG.clickMode !== 'shockwave') return;
    const maxR = Math.max(10, CURSOR_CFG.clickRadius);
    const pw = CURSOR_CFG.clickPower;

    const x0 = Math.max(0, Math.floor((cx - maxR + PAD) / BIN));
    const x1 = Math.min(binCols - 1, Math.floor((cx + maxR + PAD) / BIN));
    const y0 = Math.max(0, Math.floor((cy - maxR + PAD) / BIN));
    const y1 = Math.min(binRows - 1, Math.floor((cy + maxR + PAD) / BIN));
    const maxR2 = maxR * maxR;

    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) {
        const bin = bins[by * binCols + bx];
        for (let j = 0; j < bin.length; j++) {
          const i = bin[j];
          const ddx = FX[i] - cx;
          const ddy = FY[i] - cy;
          if (ddx * ddx + ddy * ddy < maxR2) {
            if (!FIN[i]) {
              FIN[i] = 1;
              activeField.push(i);
            }
          }
        }
      }
    }

    cursorWaves.push({ cx, cy, t: 0, dur: 440, maxR, pw });
  }

  function buildCursorField() {
    const rMin = CURSOR_CFG.minDist;
    const cell = rMin / Math.SQRT2;
    const gw = Math.ceil((width + PAD * 2) / cell);
    const gh = Math.ceil((height + PAD * 2) / cell);
    const grid = new Int32Array(gw * gh).fill(-1);

    const px = [];
    const py = [];
    const queue = [];

    const add = (x, y) => {
      const i = px.length;
      px.push(x);
      py.push(y);
      queue.push(i);
      grid[Math.floor((y + PAD) / cell) * gw + Math.floor((x + PAD) / cell)] = i;
    };

    add(width * 0.5, height * 0.5);

    const rMin2 = rMin * rMin;
    while (queue.length) {
      const qi = Math.floor(Math.random() * queue.length);
      const p = queue[qi];
      let placed = false;

      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = rMin * (1 + Math.random() * 0.95);
        const x = px[p] + Math.cos(a) * d;
        const y = py[p] + Math.sin(a) * d;
        if (x < -PAD || x > width + PAD || y < -PAD || y > height + PAD) continue;

        const gx = Math.floor((x + PAD) / cell);
        const gy = Math.floor((y + PAD) / cell);
        let ok = true;
        for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && ok; yy++) {
          for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
            const n = grid[yy * gw + xx];
            if (n !== -1) {
              const ddx = px[n] - x;
              const ddy = py[n] - y;
              if (ddx * ddx + ddy * ddy < rMin2) { ok = false; break; }
            }
          }
        }
        if (ok) { add(x, y); placed = true; break; }
      }

      if (!placed) {
        queue[qi] = queue[queue.length - 1];
        queue.pop();
      }
    }

    fieldCount = px.length;
    FX = Float32Array.from(px);
    FY = Float32Array.from(py);
    FDX = new Float32Array(fieldCount);
    FDY = new Float32Array(fieldCount);
    FR = new Float32Array(fieldCount);
    FT = new Float32Array(fieldCount);
    FST = new Float32Array(fieldCount);
    FSF = new Float32Array(fieldCount);
    FGS = new Float32Array(fieldCount);
    FSS = new Float32Array(fieldCount);
    FIN = new Uint8Array(fieldCount);
    activeField = [];

    for (let i = 0; i < fieldCount; i++) {
      FSF[i] = 0.7 + Math.random() * 0.6;
      FGS[i] = 0.06 + Math.random() * 0.12;
      FSS[i] = 0.10 + Math.random() * 0.10;
    }

    binCols = Math.ceil((width + PAD * 2) / BIN);
    binRows = Math.ceil((height + PAD * 2) / BIN);
    bins = Array.from({ length: binCols * binRows }, () => []);
    for (let i = 0; i < fieldCount; i++) {
      bins[Math.floor((FY[i] + PAD) / BIN) * binCols + Math.floor((FX[i] + PAD) / BIN)].push(i);
    }
  }

  // ==========================================================================
  // РЕСАЙЗ И ГЛАВНЫЙ ЦИКЛ WEBGL2
  // ==========================================================================
  function resizeAll() {
    if (contextLost) return;
    const progress = mainTimeline ? mainTimeline.progress() : 0;
    width = Math.max(1, hero.clientWidth);
    height = Math.max(1, hero.clientHeight);
    // Bound the fragment workload on high-resolution screens.
    dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    buildCursorField();
    cursorWaves.length = 0;
    playGsapChoreography(progress);
    scheduleRender();
  }

  let lastTime = performance.now();

  function scheduleRender() {
    if (!frameId && !document.hidden && !contextLost) frameId = requestAnimationFrame(render);
  }

  function render(now) {
    frameId = 0;
    if (document.hidden || contextLost) return;
    const dt = Math.min(50, now - lastTime) || 16.667;
    lastTime = now;
    const s = dt / 16.667;

    pointer.update(s);

    const numDrops = Math.min(MAX_DROPS, drops.length);
    for (let i = 0; i < numDrops; i++) {
      const d = drops[i];
      const f = d.flight;
      const abs = d.absorb;

      // Позиция подлёта к началу участка штриха (при f == 1 равна точно (d.ax, d.ay))
      const baseX = cubicBezier(d.sx, d.cx1, d.cx2, d.ax, f);
      const baseY = cubicBezier(d.sy, d.cy1, d.cy2, d.ay, f);

      // Смещение вдоль самого штриха по мере динамичного растекания по инерции
      let glideX = 0;
      let glideY = 0;
      let dirX = d.flowUx;
      let dirY = d.flowUy;

      if (abs > 0.0001) {
        if (d.type === 0) {
          glideX = (d.bx - d.ax) * abs;
          glideY = (d.by - d.ay) * abs;
        } else {
          const ang = d.a0 + (d.aEnd - d.a0) * abs;
          glideX = (d.arcCx + Math.cos(ang) * yahArcR) - d.ax;
          glideY = (d.arcCy + Math.sin(ang) * yahArcR) - d.ay;
          const dirSign = d.aEnd >= d.a0 ? 1 : -1;
          dirX = -Math.sin(ang) * dirSign;
          dirY = Math.cos(ang) * dirSign;
        }
      }

      // Тонкое органическое микродвижение (парение капли на полотне в ожидании старта полёта)
      let hoverX = 0;
      let hoverY = 0;
      let hoverBreath = 1.0;
      if (d.emerge > 0.01 && f < 0.999) {
        const hoverWeight = d.emerge * Math.max(0, 1.0 - f * 2.2);
        const tHover = now * 0.0016 + d.seed;
        hoverX = Math.sin(tHover * 1.5) * 2.2 * hoverWeight;
        hoverY = Math.cos(tHover * 1.2 + 1.3) * 2.2 * hoverWeight;
        hoverBreath = 1.0 + Math.sin(now * 0.003 + d.seed * 2.0) * 0.04 * hoverWeight;
      }

      // Текущий центр круглой капли (плавно переходит из подлёта в скольжение вдоль штриха без остановки)
      const cx = baseX + glideX + hoverX;
      const cy = baseY + glideY + hoverY;

      // Скорость полёта и скорость растекания по букве
      const vFlight = Math.max(0, f - d.prevFlight) * 60;
      const vAbs = Math.max(0, abs - d.prevAbs) * 60;
      d.prevFlight = f;
      d.prevAbs = abs;

      // Импульс упругого гидродинамического удара капли о штрих буквы:
      // при ударе капля слегка плющится и расширяется в радиусе (+30%), а затем перетекает в штрих
      const impactPulse = (abs > 0.0001 && abs < 0.40)
        ? Math.sin(Math.min(1.0, abs / 0.30) * Math.PI) * Math.exp(-abs * 4.2)
        : 0;

      // Плавное овально-каплевидное вытягивание:
      // 1) В полёте — капля вытягивается вдоль траектории полёта с нарастанием к моменту удара
      // 2) При ударе и растекании — капля сохраняет инерционное вытягивание вдоль штриха буквы,
      //    выглядя как живая стремительная струя чернил, а к концу штриха округляется и растворяется
      let targetSX = 0;
      let targetSY = 0;

      if (f > 0.002 && f < 0.999 && abs < 0.001) {
        const tanX = cubicBezierTangent(d.sx, d.cx1, d.cx2, d.ax, f);
        const tanY = cubicBezierTangent(d.sy, d.cy1, d.cy2, d.ay, f);
        const tanLen = Math.hypot(tanX, tanY) || 1;
        const flightBell = Math.sin(Math.pow(f, 0.65) * Math.PI);
        const stretchFlight = Math.min(0.50, (0.12 + vFlight * 0.42) * flightBell);
        targetSX = (tanX / tanLen) * stretchFlight;
        targetSY = (tanY / tanLen) * stretchFlight;
      } else if (abs >= 0.001 && abs < 0.999) {
        const flowStretch = Math.min(0.44, (0.08 + vAbs * 0.28)) * Math.pow(1.0 - abs, 0.75);
        targetSX = dirX * flowStretch;
        targetSY = dirY * flowStretch;
      }

      const stretchEase = 1 - Math.pow(0.72, s);
      d.stretchX += (targetSX - d.stretchX) * stretchEase;
      d.stretchY += (targetSY - d.stretchY) * stretchEase;

      // Радиус капли: упругий всплеск (impactPulse) при касании буквы, плавно переходящий в 0 к концу участка
      const rCore = d.rDrop * d.emerge * Math.max(0, 1.0 - abs) * (1.0 + impactPulse * 0.32) * hoverBreath;

      dropCoreData[i * 4] = cx;
      dropCoreData[i * 4 + 1] = cy;
      dropCoreData[i * 4 + 2] = d.stretchX;
      dropCoreData[i * 4 + 3] = d.stretchY;

      // Вытекающий штрих лежит СТРОГО на точной оси самой буквы (d.ax, d.ay) -> (d.ax + glideX, d.ay + glideY),
      // без малейшего бокового смещения (baseX - d.ax), чтобы части одного штриха всегда сходились идеально соосно!
      if (d.type === 0) {
        dropSegData[i * 4] = d.ax;
        dropSegData[i * 4 + 1] = d.ay;
        dropSegData[i * 4 + 2] = d.ax + glideX;
        dropSegData[i * 4 + 3] = d.ay + glideY;
      } else {
        const a1 = d.a0 + (d.aEnd - d.a0) * abs;
        const aMid = 0.5 * (d.a0 + a1);
        const da = 0.5 * Math.abs(a1 - d.a0);
        dropSegData[i * 4] = d.arcCx;
        dropSegData[i * 4 + 1] = d.arcCy;
        dropSegData[i * 4 + 2] = aMid;
        dropSegData[i * 4 + 3] = da;
      }

      // Капиллярная флюидность свежих чернил слегка возбуждается от удара капли
      const currentWet = Math.min(1.6, d.wet * (1.0 + impactPulse * 0.75));

      dropParamsData[i * 4] = rCore;
      dropParamsData[i * 4 + 1] = abs;
      dropParamsData[i * 4 + 2] = currentWet;
      dropParamsData[i * 4 + 3] = d.type;
    }

    // 2. Скрытые точки под курсором
    const fr = CURSOR_CFG.fieldRadius;
    const fr2 = fr * fr;
    const speed = pointer.speed;
    const stretching = speed > 0.4;

    let sx = 0;
    let sy = 0;
    if (stretching) {
      sx = pointer.vx * 0.75 * CURSOR_CFG.stretch;
      sy = pointer.vy * 0.75 * CURSOR_CFG.stretch;
      const maxShift = fr * 0.32;
      const m = Math.hypot(sx, sy);
      if (m > maxShift) {
        sx *= maxShift / m;
        sy *= maxShift / m;
      }
    }

    // Обновление ударных волн от клика (shockwave)
    for (let w = cursorWaves.length - 1; w >= 0; w--) {
      const wave = cursorWaves[w];
      wave.t += dt;
      if (wave.t >= wave.dur) {
        cursorWaves.splice(w, 1);
      } else {
        wave.prog = wave.t / wave.dur;
      }
    }
    const hasWaves = cursorWaves.length > 0;

    if (pointer.inside) {
      const x0 = Math.max(0, Math.floor((pointer.x - fr + PAD) / BIN));
      const x1 = Math.min(binCols - 1, Math.floor((pointer.x + fr + PAD) / BIN));
      const y0 = Math.max(0, Math.floor((pointer.y - fr + PAD) / BIN));
      const y1 = Math.min(binRows - 1, Math.floor((pointer.y + fr + PAD) / BIN));
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const bin = bins[by * binCols + bx];
          for (let j = 0; j < bin.length; j++) {
            const i = bin[j];
            if (FIN[i]) continue;
            const ddx = FX[i] - pointer.x;
            const ddy = FY[i] - pointer.y;
            if (ddx * ddx + ddy * ddy < fr2) {
              FIN[i] = 1;
              activeField.push(i);
            }
          }
        }
      }
    }

    const pEase = 1 - Math.pow(1 - 0.18, s);
    let writeIdx = 0;
    const maxR = CURSOR_CFG.maxRadius;
    const minR = Math.max(0.8, maxR * 0.15);

    for (let n = 0; n < activeField.length; n++) {
      const i = activeField[n];

      let proximity = 0;
      if (pointer.inside) {
        const ddx = FX[i] - pointer.x;
        const ddy = FY[i] - pointer.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < fr2) {
          proximity = 1 - Math.sqrt(d2) / fr;
        }
      }

      let tx = 0;
      let ty = 0;
      let targetStretch = 0;
      if (proximity > 0) {
        FT[i] = (minR + (maxR - minR) * Math.pow(proximity, 1.25)) * FSF[i];
        if (stretching) {
          tx = sx * proximity;
          ty = sy * proximity;
          if (proximity > 0.06) {
            targetStretch = Math.min(1.2, (speed / 12) * (FR[i] / maxR) * CURSOR_CFG.stretch);
          }
        }
      } else {
        FT[i] = 0;
      }

      if (hasWaves) {
        for (let w = 0; w < cursorWaves.length; w++) {
          const wave = cursorWaves[w];
          const wdx = FX[i] - wave.cx;
          const wdy = FY[i] - wave.cy;
          const wd = Math.hypot(wdx, wdy);
          if (wd >= wave.maxR) continue;

          const p = wave.prog;
          const pw = wave.pw;
          const ux = wd > 0.1 ? wdx / wd : 0;
          const uy = wd > 0.1 ? wdy / wd : 0;

          const ease = 1 - Math.pow(1 - p, 2.2);
          const front = wave.maxR * ease;
          const band = Math.max(12, wave.maxR * 0.28);
          const diff = wd - front;
          if (Math.abs(diff) < band) {
            const pulse = Math.cos((diff / band) * (Math.PI * 0.5)) * (1 - p);
            const push = pulse * Math.max(8, wave.maxR * 0.25) * pw;
            tx += ux * push;
            ty += uy * push;
            const boostR = (minR + (maxR - minR) * 0.9) * FSF[i] * (0.65 + pulse * 0.85 * pw);
            if (boostR > FT[i]) FT[i] = boostR;
            const waveStretch = pulse * 0.9 * pw;
            if (waveStretch > targetStretch) targetStretch = waveStretch;
          } else if (diff < 0 && p < 0.65) {
            // Разрежение внутри ударного кольца
            FT[i] *= Math.max(0.05, 1 - 0.8 * pw);
          }
        }
      }

      const ease = FT[i] > FR[i] ? FGS[i] : FSS[i];
      FR[i] += (FT[i] - FR[i]) * (1 - Math.pow(1 - ease, s));

      FDX[i] += (tx - FDX[i]) * pEase;
      FDY[i] += (ty - FDY[i]) * pEase;
      FST[i] += (targetStretch - FST[i]) * pEase;

      if (FR[i] < 0.08 && FT[i] === 0) {
        FR[i] = 0;
        FDX[i] = 0;
        FDY[i] = 0;
        FST[i] = 0;
        FIN[i] = 0;
        continue;
      }

      activeField[writeIdx++] = i;
    }
    activeField.length = writeIdx;

    // Отправляем в шейдер все активные точки (при превышении лимита — самые свежие точки прямо под курсором,
    // без перестановки элементов в массиве, из-за которой точки раньше моргали)
    let cursorSendCount = 0;
    let cMinX = 1e5, cMinY = 1e5, cMaxX = -1e5, cMaxY = -1e5;
    const startIdx = Math.max(0, activeField.length - MAX_CURSOR_DOTS);
    for (let n = startIdx; n < activeField.length; n++) {
      const i = activeField[n];
      const cxDot = FX[i] + FDX[i];
      const cyDot = FY[i] + FDY[i];
      const rDot = FR[i];
      const padDot = rDot * (1 + FST[i]) + 32;

      if (cxDot - padDot < cMinX) cMinX = cxDot - padDot;
      if (cyDot - padDot < cMinY) cMinY = cyDot - padDot;
      if (cxDot + padDot > cMaxX) cMaxX = cxDot + padDot;
      if (cyDot + padDot > cMaxY) cMaxY = cyDot + padDot;

      cursorDotsData[cursorSendCount * 4] = cxDot;
      cursorDotsData[cursorSendCount * 4 + 1] = cyDot;
      cursorDotsData[cursorSendCount * 4 + 2] = rDot;
      cursorDotsData[cursorSendCount * 4 + 3] = FST[i];
      cursorSendCount++;
    }

    gl.uniform2f(uRes, width, height);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uTime, now * 0.001);
    gl.uniform1f(uStrokeR, strokeR);
    gl.uniform1f(uYahArcR, yahArcR);

    gl.uniform1i(uDropCount, numDrops);
    gl.uniform4fv(uDropCore, dropCoreData);
    gl.uniform4fv(uDropSeg, dropSegData);
    gl.uniform4fv(uDropParams, dropParamsData);

    gl.uniform1i(uCursorCount, cursorSendCount);
    gl.uniform4fv(uCursorDots, cursorDotsData);
    gl.uniform2f(uCursorDir, Math.cos(pointer.angle), Math.sin(pointer.angle));
    gl.uniform4f(uCursorBBox, cMinX, cMinY, cMaxX, cMaxY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if ((mainTimeline && mainTimeline.isActive()) || pointer.inside || activeField.length || cursorWaves.length) scheduleRender();
  }

  window.addEventListener('pointermove', (e) => {
    if (motionPreference.matches || e.target.closest('button')) {
      pointer.leave();
      return;
    }
    pointer.moveTo(e.clientX, e.clientY);
    scheduleRender();
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    if (motionPreference.matches || e.target.closest('button')) {
      pointer.leave();
      return;
    }
    pointer.moveTo(e.clientX, e.clientY);
    triggerCursorClick(e.clientX, e.clientY);
    scheduleRender();
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    pointer.leave();
  });

  window.addEventListener('blur', () => {
    pointer.leave();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeAll, 120);
  });
  window.visualViewport?.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeAll, 120);
  });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') pointer.leave();
  });
  window.addEventListener('pointercancel', () => pointer.leave());
  document.addEventListener('visibilitychange', () => {
    pointer.leave();
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      mainTimeline?.pause();
    } else {
      lastTime = performance.now();
      mainTimeline?.resume();
      scheduleRender();
    }
  });
  motionPreference.addEventListener('change', () => {
    pointer.leave();
    resizeAll();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    mainTimeline?.kill();
    showFallback();
  });

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      playGsapChoreography();
      scheduleRender();
    });
  }

  resizeAll();
  hero.classList.add('is-ready');
  scheduleRender();
})();
