/**
 * UNTESIS — Orbital Ring (WebGL, analytical reference-matched)
 *
 * Mathematical conic extraction from master reference render (1024x576):
 *   Center: (523.43, 278.03), A = 461.20, B = 122.37, tilt = -15.557 deg
 *   - Continuous C-infinity analytical hairline with subpixel Gaussian profile
 *   - 23 micro-glints along tangent with chromatic dispersion (magenta lead -> white -> cyan trail)
 *   - Anamorphic flare envelopes at top-right (740, 111) and bottom-left (206, 444)
 *   - Razor 1px horizontal anamorphic laser lines at exact reference rows
 *   - Sparse isolated dust specks
 *
 * Modes:
 *   'dark'  — 1:1 master reference match (additive light on black)
 *   'light' — architectural graphite hairline on white page (strictly on-line, zero off-line smudges)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UntesisRing = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REF_W = 1024;
  const REF_H = 576;
  const DEG = Math.PI / 180;

  // Exact glints extracted from master reference: [theta_deg, strength, arc_length_px, halo_px]
  const GLINTS = [
    [37.5, 0.50, 8.0, 3.0],
    [43.0, 0.60, 10.0, 3.5],
    [59.0, 0.65, 7.0, 3.5],
    [80.5, 0.80, 9.0, 4.0],
    [87.5, 0.75, 8.0, 3.5],
    [102.0, 0.45, 8.0, 3.0],
    [107.5, 0.60, 6.0, 3.0],
    [117.0, 0.55, 5.0, 3.0],
    [125.5, 0.70, 7.0, 3.5],
    [161.5, 0.40, 4.0, 2.5],
    [167.0, 0.38, 4.0, 2.5],
    [174.5, 0.50, 4.0, 2.5],
    [181.0, 0.75, 8.0, 3.5],
    [193.0, 0.65, 7.0, 3.5],
    [208.5, 0.55, 6.0, 3.0],
    [216.5, 0.75, 8.0, 3.5],
    [226.0, 0.60, 5.0, 3.0],
    [248.0, 0.80, 8.0, 3.5],
    [253.0, 0.70, 6.0, 3.0],
    [262.0, 0.70, 6.0, 3.0],
    [269.5, 0.55, 7.0, 3.0],
    [348.5, 0.80, 8.0, 3.5],
    [356.5, 0.65, 6.0, 3.0]
  ];

  // Chromatic weights per glint: [magenta_weight, cyan_weight, white_weight]
  const GLINT_CHROMA = [
    [0.7, 0.4, 1.0], [0.3, 0.9, 0.9], [0.3, 0.9, 0.9], [0.8, 0.7, 1.0],
    [0.4, 0.9, 0.9], [0.3, 0.4, 0.9], [0.7, 0.4, 0.9], [0.5, 0.8, 1.0],
    [0.4, 0.9, 1.0], [0.1, 1.0, 0.4], [0.1, 1.0, 0.4], [0.8, 0.3, 0.9],
    [0.9, 0.5, 1.0], [0.8, 0.4, 0.9], [0.4, 0.8, 0.9], [0.5, 0.8, 1.0],
    [0.3, 0.9, 0.9], [0.7, 0.6, 1.0], [0.7, 0.4, 0.9], [0.8, 0.4, 1.0],
    [0.5, 0.6, 0.9], [0.9, 0.4, 1.0], [0.8, 0.4, 0.9]
  ];

  // Two primary flares: [theta_deg, strength, x0, y0]
  const FLARES = [
    [304.5, 1.0, 740.0, 111.4],
    [138.5, 1.0, 206.0, 443.5]
  ];

  // Horizontal anamorphic laser streaks: [x0, x1, y, amp, r, g, b]
  const STREAKS = [
    [773, 808, 77.0, 0.45, 0.85, 0.92, 1.0],
    [700, 886, 93.5, 0.65, 0.95, 0.98, 1.0],
    [687, 886, 104.5, 1.85, 1.0, 1.0, 1.0],
    [667, 823, 111.0, 0.55, 0.85, 0.80, 0.95],
    [665, 805, 118.0, 0.35, 0.95, 0.45, 0.85],
    [64, 102, 404.0, 0.38, 0.90, 0.60, 0.95],
    [79, 267, 426.0, 0.65, 0.25, 0.90, 1.0],
    [121, 330, 444.0, 1.80, 1.0, 1.0, 1.0],
    [132, 307, 451.0, 0.45, 0.95, 0.45, 0.85],
    [150, 280, 456.0, 0.25, 0.85, 0.40, 0.80],
    [230, 255, 265.0, 0.38, 1.0, 1.0, 1.0],
    [930, 970, 135.0, 0.28, 0.95, 0.70, 0.95]
  ];

  // Isolated dust specks from master reference: [x, y, radius, alpha]
  const DUST = [
    [793, 53, 1.1, 0.90],
    [931, 72, 1.0, 0.50],
    [773, 77, 1.0, 0.75],
    [807, 77, 1.0, 0.80],
    [106, 463, 1.1, 0.78],
    [156, 463, 1.0, 0.48],
    [126, 464, 1.0, 0.67],
    [135, 480, 1.0, 0.75],
    [880, 195, 0.9, 0.40],
    [968, 210, 1.0, 0.45],
    [156, 268, 0.9, 0.40],
    [173, 253, 0.9, 0.35],
    [605, 52, 0.9, 0.30]
  ];

  const NG = GLINTS.length;
  const NS = STREAKS.length;
  const ND = DUST.length;

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FS = `
    precision highp float;
    uniform vec2 u_res;
    uniform float u_dpr;
    uniform vec3 u_frame;      // offsetX, offsetY, scale (css px)
    uniform float u_time;
    uniform float u_mode;      // 0 = dark, 1 = light
    uniform float u_int;
    uniform vec4 u_g[${NG}];   // theta, strength, len, halo
    uniform vec3 u_gc[${NG}];  // magenta, cyan, white weights
    uniform vec4 u_f[2];       // theta, strength, x0, y0
    uniform vec4 u_s[${NS}];   // x0, x1, y, amp
    uniform vec3 u_sc[${NS}];  // color
    uniform vec4 u_d[${ND}];   // x, y, r, a
    uniform vec4 u_glitch;     // y0, h, shift, amount

    const float PI = 3.141592653589793;
    const float TAU = 6.283185307179586;
    const float CX = 523.43;
    const float CY = 278.03;
    const float A = 461.20;
    const float B = 122.37;
    const float CT = 0.963351;   // cos(-15.557 deg)
    const float ST = -0.268241;  // sin(-15.557 deg)

    const vec3 WHITE = vec3(1.0);
    const vec3 MAG = vec3(1.0, 0.20, 0.78);
    const vec3 CYA = vec3(0.12, 0.92, 1.0);

    float angd(float a, float b) { return mod(a - b + PI, TAU) - PI; }
    float g2(float x, float s) { return exp(-x * x / (2.0 * s * s)); }

    void main() {
      vec2 css = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
      float sc = u_frame.z;
      vec2 p = (css - u_frame.xy) / sc;

      // Micro-glitch shift during rare burst
      if (u_glitch.w > 0.001 && p.y > u_glitch.x && p.y < u_glitch.x + u_glitch.y) {
        p.x -= u_glitch.z * u_glitch.w;
      }

      vec2 q0 = p - vec2(CX, CY);
      vec2 q = vec2(q0.x * CT + q0.y * ST, -q0.x * ST + q0.y * CT);

      // Closest point on ellipse (guarded Newton-Raphson)
      float t0 = atan(q.y * A, q.x * B);
      float t = t0;
      for (int i = 0; i < 5; i++) {
        float c = cos(t), s = sin(t);
        vec2 e = vec2(A * c, B * s);
        vec2 e1 = vec2(-A * s, B * c);
        vec2 dq = q - e;
        float gp = dot(dq, -e) - dot(e1, e1);
        if (abs(gp) > 1e-3) t -= clamp(dot(dq, e1) / gp, -0.4, 0.4);
      }
      float d0 = length(q - vec2(A * cos(t0), B * sin(t0)));
      float dist = length(q - vec2(A * cos(t), B * sin(t)));
      if (!(dist <= d0)) { dist = d0; t = t0; }

      // Early discard outside ring boundary
      if (dist > 80.0 && u_mode > 0.5) { gl_FragColor = vec4(0.0); return; }
      if (dist > 120.0) { gl_FragColor = vec4(0.0); return; }

      float ct = cos(t), st = sin(t);
      float dcss = dist * sc;
      float lineProf = g2(dcss, 0.58);
      float speed = sqrt(A * A * st * st + B * B * ct * ct);

      // Base hairline brightness modulation
      float bb = 0.42 + 0.20 * st + 0.10 * sin(2.0 * t - 0.4) + 0.07 * sin(6.0 * t + 0.8)
               + 0.05 * sin(12.0 * t + 1.5 + u_time * 0.25);
      bb *= 0.88 + 0.12 * smoothstep(-0.2, 0.5, sin(t * 36.0 + u_time * 0.4));

      if (u_mode < 0.5) {
        // ==============================================================
        // DARK MODE: 1:1 master reference match on pure black
        // ==============================================================
        vec3 Ebase = vec3(0.95, 0.96, 1.0) * bb * 0.50 * lineProf;
        vec3 E = vec3(0.0);

        for (int i = 0; i < ${NG}; i++) {
          vec4 g = u_g[i];
          float ds = angd(t, g.x) * speed;
          float L = g.z;
          if (abs(ds) > L * 4.5) continue;
          float o = L * 0.95;
          vec3 w = u_gc[i];
          vec3 col = WHITE * g2(ds, L) * w.z
                   + MAG * g2(ds + o, L * 0.85) * w.x
                   + CYA * g2(ds - o, L * 0.85) * w.y;
          float halo = g2(dist, g.w * 0.4) * 0.20 + g2(dist, g.w * 0.9) * 0.05;
          E += g.y * col * (lineProf * 3.8 + halo);
        }

        // Flare 1
        {
          vec4 f1 = u_f[0];
          float ds1 = angd(t, f1.x) * speed;
          E += f1.y * (WHITE * g2(ds1, 14.0) * 2.0 + MAG * g2(ds1 + 35.0, 14.0) * 0.9 + CYA * g2(ds1 - 40.0, 18.0) * 0.9) * lineProf;
          float dx1 = p.x - f1.z;
          float dy1 = p.y - f1.w;
          float env1 = g2(dx1, 65.0) * g2(dy1, 13.5);
          vec3 col1 = WHITE * g2(dx1, 26.0) + MAG * g2(dx1 + 40.0, 32.0) * 0.90 + CYA * g2(dx1 - 44.0, 36.0) * 0.90;
          E += f1.y * col1 * env1 * 0.68;
        }

        // Flare 2
        {
          vec4 f2 = u_f[1];
          float ds2 = angd(t, f2.x) * speed;
          E += f2.y * (WHITE * g2(ds2, 14.0) * 2.0 + MAG * g2(ds2 - 32.0, 14.0) * 0.9 + CYA * g2(ds2 + 36.0, 18.0) * 0.9) * lineProf;
          float dx2 = p.x - f2.z;
          float dy2 = p.y - f2.w;
          float env2 = g2(dx2, 70.0) * g2(dy2, 12.8);
          vec3 col2 = WHITE * g2(dx2, 26.0) + MAG * g2(dx2 - 36.0, 30.0) * 0.90 + CYA * g2(dx2 + 40.0, 35.0) * 0.90;
          E += f2.y * col2 * env2 * 0.65;
        }

        // Streaks
        for (int i = 0; i < ${NS}; i++) {
          vec4 s = u_s[i];
          float len = s.y - s.x;
          float u = (p.x - s.x) / len;
          if (u < 0.0 || u > 1.0) continue;
          float dy = p.y - s.z;
          float shape = pow(sin(PI * u), 1.2);
          float flick = 0.85 + 0.15 * sin(u_time * 1.7 + float(i) * 2.3);
          float prof = g2(dy * sc, 0.82);
          E += u_sc[i] * s.w * shape * prof * flick;
        }

        // Dust
        for (int i = 0; i < ${ND}; i++) {
          vec4 d = u_d[i];
          float r = length(p - d.xy) * sc;
          float tw = 0.8 + 0.2 * sin(u_time * 2.1 + float(i) * 1.9);
          E += vec3(0.92, 0.95, 1.0) * d.w * tw * g2(r, max(0.55, d.z * sc * 0.6));
        }

        vec3 total = E + Ebase;
        vec3 col = 1.0 - exp(-total * u_int * 1.20);
        gl_FragColor = vec4(col, 1.0);

      } else {
        // ==============================================================
        // LIGHT MODE: Architectural Graphite Hairline with Micro-Refraction
        // Strictly confined to the 1px line & drafting dots — ZERO SMUDGES on white!
        // ==============================================================

        // 1. Dust specks as tiny architectural graphite stippling dots
        float dotAlpha = 0.0;
        for (int i = 0; i < ${ND}; i++) {
          vec4 d = u_d[i];
          float r = length(p - d.xy) * sc;
          if (r < 2.5) {
            float tw = 0.85 + 0.15 * sin(u_time * 2.0 + float(i) * 1.7);
            dotAlpha += d.w * tw * g2(r, max(0.45, d.z * sc * 0.55)) * 0.55;
          }
        }

        // Zero smudges: if off the 1px line and no dot, 100% transparent
        if (lineProf < 0.005 && dotAlpha < 0.005) {
          gl_FragColor = vec4(0.0);
          return;
        }

        // 2. Base hairline: clean, ultra-fine architectural graphite pencil
        float inkAlpha = lineProf * bb * 0.75;

        // 3. Specular flash & subtle refraction STRICTLY along the curve
        float specularFlash = 0.0;
        vec3 prismTint = vec3(0.0);
        float prismWeight = 0.0;

        // Primary Flares along the curve (tangent)
        for (int i = 0; i < 2; i++) {
          vec4 f = u_f[i];
          float ds = angd(t, f.x) * speed;
          if (abs(ds) > 120.0) continue;
          float fCore = g2(ds, 16.0) * f.y;
          float fLead = (i == 0) ? g2(ds + 32.0, 15.0) : g2(ds - 32.0, 15.0);
          float fTrail = (i == 0) ? g2(ds - 35.0, 18.0) : g2(ds + 35.0, 18.0);

          specularFlash += fCore * 0.85;
          prismTint += vec3(0.88, 0.26, 0.62) * fLead * 0.85;   // delicate rose
          prismTint += vec3(0.08, 0.68, 0.88) * fTrail * 0.85;  // delicate sky blue
          prismWeight += (fLead + fTrail) * 0.85;
        }

        // Glints along the curve
        for (int i = 0; i < ${NG}; i++) {
          vec4 g = u_g[i];
          float ds = angd(t, g.x) * speed;
          float L = g.z;
          if (abs(ds) > L * 3.5) continue;
          float gCore = g2(ds, L * 0.8) * g.y;
          float gLead = g2(ds + L * 0.9, L * 0.75) * g.y * u_gc[i].x;
          float gTrail = g2(ds - L * 0.9, L * 0.75) * g.y * u_gc[i].y;

          specularFlash += gCore * 0.65;
          prismTint += vec3(0.88, 0.26, 0.62) * gLead * 0.75;
          prismTint += vec3(0.08, 0.68, 0.88) * gTrail * 0.75;
          prismWeight += (gLead + gTrail) * 0.75;
        }

        specularFlash = clamp(specularFlash * u_int, 0.0, 1.0);
        prismWeight = clamp(prismWeight * u_int, 0.0, 1.0);
        vec3 prismCol = prismWeight > 0.001 ? prismTint / max(prismWeight, 0.01) : vec3(0.0);

        // Architectural graphite ink color
        vec3 graphite = vec3(0.12, 0.13, 0.16);

        // Where light is specular: line brightens towards pure white / silver
        // Where prism refraction is: line gently tints with delicate rose / sky
        vec3 lineRgb = mix(graphite, prismCol, clamp(prismWeight * 0.85, 0.0, 0.95));
        lineRgb = mix(lineRgb, vec3(0.98, 0.98, 1.0), specularFlash * 0.85);

        // Alpha modulation: specular light turns the dark line translucent/bright
        float lineAlpha = inkAlpha * (1.0 - specularFlash * 0.70) + prismWeight * lineProf * 0.35;
        float totalA = clamp(lineAlpha + dotAlpha, 0.0, 0.88);

        if (totalA <= 0.002) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 finalRgb = mix(lineRgb, graphite, dotAlpha / (lineAlpha + dotAlpha + 1e-4));
        gl_FragColor = vec4(finalRgb * totalA, totalA);
      }
    }
  `;

  class OrbitalRing {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.mode = options.mode || 'light';
      this.intensity = options.intensity !== undefined ? options.intensity : 1.0;
      this.drift = options.drift !== undefined ? options.drift : 1.0;
      this.glitch = { y0: 0, h: 0, shift: 0, amount: 0, start: 0, dur: 140 };
      this.t0 = performance.now();
      this.animId = 0;
      this.visible = true;

      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) { console.warn('UntesisRing: WebGL unavailable'); return; }
      this.gl = gl;
      if (!this._initGL()) return;

      this.gArr = new Float32Array(NG * 4);
      this.gcArr = new Float32Array(GLINT_CHROMA.flat());
      this.fArr = new Float32Array(8);
      this.sArr = new Float32Array(NS * 4);
      this.scArr = new Float32Array(NS * 3);
      this.dArr = new Float32Array(DUST.flat());
      STREAKS.forEach((s, i) => {
        this.sArr.set(s.slice(0, 4), i * 4);
        this.scArr.set(s.slice(4, 7), i * 3);
      });

      this.resize();
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
      if ('ResizeObserver' in window) {
        this._ro = new ResizeObserver(this._onResize);
        this._ro.observe(canvas);
      }
      if ('IntersectionObserver' in window) {
        this._io = new IntersectionObserver((entries) => {
          this.visible = entries[0].isIntersecting;
          if (this.visible) this.start(); else this.stop();
        });
        this._io.observe(canvas);
      }
      this.start();
    }

    _initGL() {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.error('UntesisRing shader:', gl.getShaderInfoLog(s));
          return null;
        }
        return s;
      };
      const vs = sh(gl.VERTEX_SHADER, VS);
      const fs = sh(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'a_pos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('UntesisRing link:', gl.getProgramInfoLog(prog));
        return false;
      }
      this.prog = prog;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ['u_res', 'u_dpr', 'u_frame', 'u_time', 'u_mode', 'u_int', 'u_g', 'u_gc', 'u_f',
        'u_s', 'u_sc', 'u_d', 'u_glitch'].forEach((n) => {
        this.u[n] = gl.getUniformLocation(prog, n);
      });
      return true;
    }

    setMode(mode) { this.mode = mode; this.render(performance.now()); }
    setIntensity(v) { this.intensity = Math.max(0.1, Math.min(3, v)); }

    triggerGlitch(intensity = 1.0) {
      const pick = Math.random();
      const y0 = pick < 0.4 ? 95 + Math.random() * 25 : pick < 0.8 ? 425 + Math.random() * 25 : 140 + Math.random() * 280;
      this.glitch.y0 = y0;
      this.glitch.h = 2 + Math.random() * 5;
      this.glitch.shift = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 7) * intensity;
      this.glitch.start = performance.now();
      this.glitch.amount = 1;
    }

    resize() {
      if (!this.gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, rect.width || REF_W);
      const h = Math.max(1, rect.height || REF_H);
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      const scale = Math.min(w / REF_W, h / REF_H);
      this.frame = [(w - REF_W * scale) * 0.5, (h - REF_H * scale) * 0.5, scale];
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    render(now) {
      const gl = this.gl;
      if (!gl) return;
      const time = (now - this.t0) * 0.001;

      // Slow drift along the ring + per-glint organic shimmer
      const rot = time * this.drift * (Math.PI * 2 / 160);
      for (let i = 0; i < NG; i++) {
        const g = GLINTS[i];
        const flick = 0.82 + 0.18 * Math.sin(time * (0.5 + i * 0.11) + i * 1.7);
        this.gArr[i * 4] = g[0] * DEG + rot;
        this.gArr[i * 4 + 1] = g[1] * flick;
        this.gArr[i * 4 + 2] = g[2];
        this.gArr[i * 4 + 3] = g[3];
      }
      for (let i = 0; i < 2; i++) {
        const f = FLARES[i];
        const breathe = 0.94 + 0.06 * Math.sin(time * 0.7 + i * 2.1);
        this.fArr[i * 4] = f[0] * DEG + rot * 0.5;
        this.fArr[i * 4 + 1] = f[1] * breathe;
        this.fArr[i * 4 + 2] = f[2];
        this.fArr[i * 4 + 3] = f[3];
      }

      const G = this.glitch;
      if (G.amount > 0) {
        const k = (now - G.start) / G.dur;
        G.amount = k >= 1 ? 0 : Math.pow(1 - k, 2);
      }

      gl.useProgram(this.prog);
      gl.uniform2f(this.u.u_res, this.w, this.h);
      gl.uniform1f(this.u.u_dpr, this.dpr);
      gl.uniform3f(this.u.u_frame, this.frame[0], this.frame[1], this.frame[2]);
      gl.uniform1f(this.u.u_time, time);
      gl.uniform1f(this.u.u_mode, this.mode === 'dark' ? 0 : 1);
      gl.uniform1f(this.u.u_int, this.intensity);
      gl.uniform4fv(this.u.u_g, this.gArr);
      gl.uniform3fv(this.u.u_gc, this.gcArr);
      gl.uniform4fv(this.u.u_f, this.fArr);
      gl.uniform4fv(this.u.u_s, this.sArr);
      gl.uniform3fv(this.u.u_sc, this.scArr);
      gl.uniform4fv(this.u.u_d, this.dArr);
      gl.uniform4f(this.u.u_glitch, G.y0, G.h, G.shift, G.amount);

      if (this.mode === 'dark') gl.clearColor(0, 0, 0, 1); else gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    start() {
      if (this.animId || !this.gl) return;
      const loop = (now) => {
        this.render(now);
        this.animId = requestAnimationFrame(loop);
      };
      this.animId = requestAnimationFrame(loop);
    }

    stop() {
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = 0;
    }

    destroy() {
      this.stop();
      window.removeEventListener('resize', this._onResize);
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
    }
  }

  return OrbitalRing;
}));
