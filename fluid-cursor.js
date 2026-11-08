/**
 * ============================================================================
 * FLUID CURSOR — поле скрытых точек
 * ============================================================================
 *
 * Модель:
 * 1. На белом полотне лежит хаотичное (Poisson-disc) поле скрытых точек, r = 0.
 * 2. Область курсора «проявляет» точки: чем ближе к центру — тем крупнее точка.
 *    У каждой точки свой размер и своя скорость роста/затухания.
 * 3. При движении точки упруго тянутся по вектору движения и вытягиваются в капли.
 * 4. Когда курсор стоит — точки неподвижны (прилипли к полотну).
 * 5. Клик: шарики лопаются волной от центра, оставляя кольцо и микро-брызги.
 *
 * Панель настроек:
 * - над панелью (и окном превью) показывается обычный системный курсор,
 *   эффект на странице в этот момент скрыт;
 * - изменения параметров показываются в отдельном окне превью, где
 *   «виртуальный курсор» сам ездит, останавливается и кликает.
 *
 * Оптимизации: типизированные массивы (SoA), обновляются только активные точки,
 * один путь и один fill() на кадр, пространственные корзины.
 */

(function () {
  'use strict';

  // --- Общие параметры (используются и страницей, и превью) ---
  const config = {
    density: 2,          // 1..10 — плотность поля (больше = кучнее)
    fieldRadius: 42,     // радиус области курсора, px
    maxRadius: 12,       // радиус самой крупной точки в центре, px
    stretch: 1.0,        // сила вытягивания по движению
    clickMode: 'shockwave', // 'pop' | 'shockwave' | 'implode' | 'vortex' | 'ripple'
    clickRadius: 55,     // радиус анимации при клике, px
    clickPower: 0.4,     // сила / интенсивность анимации при клике (0.2 .. 2.5)
    showVectors: false,
    hideCursor: true
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const BIN = 64;        // размер пространственной корзины, px
  const PAD = 40;        // запас за краями области, px
  const UI_SELECTOR = '.controls-bar, .preview-window';

  const minDistance = () => 22 - config.density * 1.6;

  // ==========================================================================
  // Pointer — состояние курсора (реального или виртуального)
  // ==========================================================================
  class Pointer {
    constructor() {
      this.x = 0; this.y = 0;
      this.lastX = 0; this.lastY = 0;
      this.accX = 0; this.accY = 0;   // перемещение, накопленное с прошлого кадра
      this.vx = 0; this.vy = 0;       // сглаженная скорость, px/кадр
      this.speed = 0;
      this.angle = 0;
      this.inside = false;
      this.down = false;
    }

    moveTo(x, y) {
      if (!this.inside) {
        // Первое движение или возврат: без скачка скорости
        this.inside = true;
        this.lastX = x;
        this.lastY = y;
      }
      this.accX += x - this.lastX;
      this.accY += y - this.lastY;
      this.lastX = this.x = x;
      this.lastY = this.y = y;
    }

    leave() {
      this.inside = false;
      this.accX = this.accY = 0;
    }

    update(s) {
      const k = 1 - Math.pow(0.75, s);
      this.vx += (this.accX / s - this.vx) * k;
      this.vy += (this.accY / s - this.vy) * k;
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
  }

  // ==========================================================================
  // Field — поле точек на одном холсте
  // ==========================================================================
  class Field {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.width = 0;
      this.height = 0;
      this.count = 0;
      this.active = [];
      this.pops = [];
      this.waves = [];
      this.drawn = false;
    }

    resize(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.fillStyle = '#000';
      this.generate();
    }

    // --- Хаотичное распределение (Poisson-disc) ---
    generate() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      const width = this.width;
      const height = this.height;
      const rMin = minDistance();
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

      add(Math.random() * width, Math.random() * height);

      const rMin2 = rMin * rMin;
      while (queue.length) {
        const qi = Math.floor(Math.random() * queue.length);
        const p = queue[qi];
        let placed = false;

        for (let k = 0; k < 24; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = rMin * (1 + Math.random() * 0.9);
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

      const count = px.length;
      this.count = count;
      this.X = Float32Array.from(px);
      this.Y = Float32Array.from(py);
      this.DX = new Float32Array(count);   // упругое смещение
      this.DY = new Float32Array(count);
      this.R = new Float32Array(count);    // текущий радиус
      this.T = new Float32Array(count);    // целевой радиус
      this.SF = new Float32Array(count);   // индивидуальный размер
      this.GS = new Float32Array(count);   // скорость роста
      this.SS = new Float32Array(count);   // скорость затухания
      this.PD = new Float32Array(count);   // таймер до хлопка, мс
      this.CD = new Float32Array(count);   // пауза после хлопка, мс
      this.IN = new Uint8Array(count);     // 1, если точка в списке активных
      this.active = [];
      this.pops = [];
      this.waves = [];
      this.drawn = false;

      for (let i = 0; i < count; i++) {
        this.SF[i] = 0.7 + Math.random() * 0.6;
        this.GS[i] = 0.06 + Math.random() * 0.12;
        this.SS[i] = 0.10 + Math.random() * 0.10;
      }

      // корзины
      this.binCols = Math.ceil((width + PAD * 2) / BIN);
      this.binRows = Math.ceil((height + PAD * 2) / BIN);
      this.bins = Array.from({ length: this.binCols * this.binRows }, () => []);
      for (let i = 0; i < count; i++) {
        this.bins[Math.floor((this.Y[i] + PAD) / BIN) * this.binCols + Math.floor((this.X[i] + PAD) / BIN)].push(i);
      }
    }

    // --- Лопание ---
    spawnPopBurst(x, y, r0, pw) {
      const specks = [];
      if (r0 > 1.4) {
        const n = r0 > 3.5 ? 4 : 2;
        const baseAngle = Math.random() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = baseAngle + (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          specks.push({
            ux: Math.cos(a),
            uy: Math.sin(a),
            travel: r0 * (1.0 + Math.random() * 1.2) * pw,
            r: Math.min(2.2, Math.max(0.5, r0 * 0.28 * (0.7 + 0.3 * pw)))
          });
        }
      }
      this.pops.push({
        x,
        y,
        r0: Math.max(1.1, r0),
        pw,
        t: 0,
        dur: 170 + Math.min(90, r0 * 10),
        specks
      });
    }

    // Активация всех точек в заданном радиусе вокруг (cx, cy)
    activateInRadius(cx, cy, rad) {
      const { X, Y, IN, active, bins, binCols, binRows } = this;
      const r2 = rad * rad;
      const x0 = Math.max(0, Math.floor((cx - rad + PAD) / BIN));
      const x1 = Math.min(binCols - 1, Math.floor((cx + rad + PAD) / BIN));
      const y0 = Math.max(0, Math.floor((cy - rad + PAD) / BIN));
      const y1 = Math.min(binRows - 1, Math.floor((cy + rad + PAD) / BIN));
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const bin = bins[by * binCols + bx];
          for (let j = 0; j < bin.length; j++) {
            const i = bin[j];
            if (IN[i]) continue;
            const ddx = X[i] - cx;
            const ddy = Y[i] - cy;
            if (ddx * ddx + ddy * ddy < r2) {
              IN[i] = 1;
              active.push(i);
            }
          }
        }
      }
    }

    triggerPopAt(cx, cy) {
      const { active, R, PD, CD, SF, X, Y, DX, DY } = this;
      const maxR = Math.max(10, config.clickRadius);
      const pw = config.clickPower;
      const mode = config.clickMode;

      if (mode === 'pop') {
        this.activateInRadius(cx, cy, maxR);
        const minDotR = Math.max(0.8, config.maxRadius * 0.15);
        for (let n = 0; n < active.length; n++) {
          const i = active[n];
          if (PD[i] > 0) continue;
          const d = Math.hypot(X[i] + DX[i] - cx, Y[i] + DY[i] - cy);
          if (d > maxR) continue;
          // Если точка была скрыта (при большом радиусе клика), даём ей начальный размер для хлопка
          if (R[i] <= 0.35) {
            const prox = 1 - d / maxR;
            R[i] = (minDotR + (config.maxRadius - minDotR) * Math.pow(prox, 1.25)) * SF[i] * 0.75;
            CD[i] = 0;
          }
          // Волна лопания от центра клика к краям (1..60 мс)
          PD[i] = 1 + Math.min(1, d / maxR) * 45 + Math.random() * 15;
        }
        return;
      }

      const durations = {
        shockwave: 440,
        implode: 460,
        vortex: 540,
        ripple: 760
      };
      const dur = durations[mode] || 460;
      this.activateInRadius(cx, cy, maxR);
      this.waves.push({ type: mode, cx, cy, t: 0, dur, maxR, pw });
    }

    // --- Кадр ---
    frame(dt, s, ptr) {
      const ctx = this.ctx;
      const { X, Y, DX, DY, R, T, SF, GS, SS, PD, CD, IN, active, bins, binCols, binRows } = this;

      const fr = config.fieldRadius;
      const fr2 = fr * fr;
      const maxR = config.maxRadius;
      const minR = Math.max(0.8, maxR * 0.15);
      const speed = ptr.speed;
      const stretching = !reducedMotion.matches && speed > 0.4 && config.stretch > 0;

      // Вектор смещения при вытягивании с жёстким ограничением длины
      let sx = 0;
      let sy = 0;
      if (stretching) {
        sx = ptr.vx * 0.75 * config.stretch;
        sy = ptr.vy * 0.75 * config.stretch;
        const maxShift = Math.max(8, fr * 0.3);
        const m = Math.hypot(sx, sy);
        if (m > maxShift) {
          sx *= maxShift / m;
          sy *= maxShift / m;
        }
      }

      // Новые активные точки: те, что попали в область курсора
      if (ptr.inside) {
        const x0 = Math.max(0, Math.floor((ptr.x - fr + PAD) / BIN));
        const x1 = Math.min(binCols - 1, Math.floor((ptr.x + fr + PAD) / BIN));
        const y0 = Math.max(0, Math.floor((ptr.y - fr + PAD) / BIN));
        const y1 = Math.min(binRows - 1, Math.floor((ptr.y + fr + PAD) / BIN));
        for (let by = y0; by <= y1; by++) {
          for (let bx = x0; bx <= x1; bx++) {
            const bin = bins[by * binCols + bx];
            for (let j = 0; j < bin.length; j++) {
              const i = bin[j];
              if (IN[i]) continue;
              const ddx = X[i] - ptr.x;
              const ddy = Y[i] - ptr.y;
              if (ddx * ddx + ddy * ddy < fr2) {
                IN[i] = 1;
                active.push(i);
              }
            }
          }
        }
      }

      if (this.drawn) ctx.clearRect(0, 0, this.width, this.height);

      // Обновляем активные волновые эффекты кликов
      const waves = this.waves;
      for (let w = waves.length - 1; w >= 0; w--) {
        const wave = waves[w];
        wave.t += dt;
        if (wave.t >= wave.dur) {
          waves[w] = waves[waves.length - 1];
          waves.pop();
        } else {
          wave.prog = wave.t / wave.dur;
        }
      }
      const hasWaves = waves.length > 0;

      const cosA = Math.cos(ptr.angle);
      const sinA = Math.sin(ptr.angle);
      ctx.beginPath();
      let any = false;

      for (let n = active.length - 1; n >= 0; n--) {
        const i = active[n];

        // Точка готовится лопнуть — раздувается и взрывается кольцом
        if (PD[i] > 0) {
          PD[i] -= dt;
          R[i] *= 1 + 0.012 * config.clickPower * dt;
          if (PD[i] <= 0) {
            PD[i] = 0;
            this.spawnPopBurst(X[i] + DX[i], Y[i] + DY[i], R[i], config.clickPower);
            R[i] = 0;
            T[i] = 0;
            DX[i] = 0;
            DY[i] = 0;
            CD[i] = 380 + Math.random() * 180; // пауза перед появлением снова
            continue;
          }
        }

        if (CD[i] > 0) {
          CD[i] -= dt;
          if (CD[i] < 0) CD[i] = 0;
        }

        let proximity = 0;
        if (ptr.inside && CD[i] === 0 && PD[i] === 0) {
          const ddx = X[i] - ptr.x;
          const ddy = Y[i] - ptr.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < fr2) proximity = 1 - Math.sqrt(d2) / fr;
        }

        let tx = 0;
        let ty = 0;
        if (proximity > 0) {
          T[i] = (minR + (maxR - minR) * Math.pow(proximity, 1.25)) * SF[i];
          if (stretching) {
            tx = sx * proximity;
            ty = sy * proximity;
          }
        } else if (PD[i] === 0) {
          T[i] = 0;
        }

        // Воздействие клик-анимаций (shockwave / implode / vortex / ripple)
        let waveActive = false;
        let customAngle = ptr.angle;
        let customStretch = 0;

        if (hasWaves && PD[i] === 0) {
          for (let w = 0; w < waves.length; w++) {
            const wave = waves[w];
            const wdx = X[i] - wave.cx;
            const wdy = Y[i] - wave.cy;
            const wd = Math.hypot(wdx, wdy);
            if (wd >= wave.maxR) continue;

            waveActive = true;
            const p = wave.prog;
            const pw = wave.pw || 1;
            const ux = wd > 0.1 ? wdx / wd : 0;
            const uy = wd > 0.1 ? wdy / wd : 0;

            if (wave.type === 'shockwave') {
              const ease = 1 - Math.pow(1 - p, 2.2);
              const front = wave.maxR * ease;
              const band = Math.max(12, wave.maxR * 0.28);
              const diff = wd - front;
              if (Math.abs(diff) < band) {
                const pulse = Math.cos((diff / band) * (Math.PI * 0.5)) * (1 - p);
                const push = pulse * Math.max(8, wave.maxR * 0.25) * pw;
                tx += ux * push;
                ty += uy * push;
                const boostR = (minR + (maxR - minR) * 0.9) * SF[i] * (0.65 + pulse * 0.85 * pw);
                if (boostR > T[i]) T[i] = boostR;
                customAngle = Math.atan2(wdy, wdx);
                customStretch = pulse * 0.9 * pw;
              } else if (diff < 0 && p < 0.65) {
                // Разрежение внутри ударного кольца
                T[i] *= Math.max(0.05, 1 - 0.8 * pw);
              }
            } else if (wave.type === 'implode') {
              if (p < 0.6) {
                // Стягивание всех точек в эпицентр клика
                const k = Math.min(1, Math.pow(p / 0.6, 1.8) * (0.6 + 0.4 * pw));
                tx = -wdx * k;
                ty = -wdy * k;
                const implR = (minR + (maxR - minR) * (1 - wd / wave.maxR)) * SF[i] * (1 - k * 0.65);
                T[i] = Math.max(T[i] * (1 - k), implR * pw);
                customAngle = Math.atan2(-wdy, -wdx);
                customStretch = Math.sin((p / 0.6) * Math.PI) * 1.1 * pw;
              } else {
                // После схлопывания держим паузу тишины до конца эффекта
                T[i] = 0;
                R[i] *= 0.65;
              }
            } else if (wave.type === 'vortex') {
              const env = Math.sin(p * Math.PI);
              const vp = 1 - wd / wave.maxR;
              const rot = env * (0.9 + vp * 2.5) * pw;
              const pull = 1 - Math.min(0.75, env * vp * 0.36 * pw);
              const ca = Math.cos(rot);
              const sa = Math.sin(rot);
              const rx = (wdx * ca - wdy * sa) * pull;
              const ry = (wdx * sa + wdy * ca) * pull;
              tx += rx - wdx;
              ty += ry - wdy;
              const vorR = (minR + (maxR - minR) * Math.pow(vp, 1.1)) * SF[i] * (1 + env * 0.25 * pw);
              if (vorR > T[i]) T[i] = vorR;
              customAngle = Math.atan2(ry, rx) + Math.PI * 0.5;
              customStretch = env * vp * 1.1 * pw;
            } else if (wave.type === 'ripple') {
              const front = wave.maxR * p;
              const wl = Math.max(14, wave.maxR * 0.26);
              if (wd <= front + wl * 0.5) {
                const phase = ((wd - front) / wl) * Math.PI * 2;
                const osc = Math.cos(phase);
                const env = (1 - p) * (1 - wd / wave.maxR * 0.65);
                tx += ux * osc * env * 5 * pw;
                ty += uy * osc * env * 5 * pw;
                if (osc > 0) {
                  const ripR = (minR + (maxR - minR) * osc * env * 1.35 * pw) * SF[i];
                  if (ripR > T[i]) T[i] = ripR;
                } else {
                  T[i] *= Math.max(0.1, 1 + osc * Math.min(0.95, 0.75 * pw));
                }
              }
            }
          }
        }

        // Упругое смещение (в покое точка возвращается на якорь)
        const ek = Math.min(1, (waveActive ? 0.35 : stretching && proximity > 0 ? 0.25 : 0.3) * s);
        DX[i] += (tx - DX[i]) * ek;
        DY[i] += (ty - DY[i]) * ek;

        // Рост / затухание с индивидуальной скоростью
        if (PD[i] === 0) {
          const r = R[i];
          const t = T[i];
          if (r < t) {
            const gs = waveActive ? Math.max(GS[i], 0.22) : GS[i];
            R[i] = r + (t - r) * Math.min(1, gs * s);
          } else if (r > t) {
            const ss = waveActive ? Math.max(SS[i], 0.22) : SS[i];
            const nr = r + (t - r) * Math.min(1, ss * s);
            R[i] = nr < 0.2 ? 0 : nr;
          }
        }

        // Точка затухла и вернулась на якорь — снимаем с учёта
        if (!waveActive && R[i] === 0 && T[i] === 0 && PD[i] === 0 && CD[i] === 0 &&
            Math.abs(DX[i]) < 0.05 && Math.abs(DY[i]) < 0.05) {
          DX[i] = 0;
          DY[i] = 0;
          IN[i] = 0;
          active[n] = active[active.length - 1];
          active.pop();
          continue;
        }

        const cr = R[i];
        if (cr <= 0.25) continue;

        const px = X[i] + DX[i];
        const py = Y[i] + DY[i];
        any = true;

        const moveRatio = (stretching && speed > 0.8)
          ? Math.min(1.2, (speed / 12) * (cr / maxR) * config.stretch)
          : 0;
        const ratio = Math.max(moveRatio, customStretch);

        if (ratio > 0.03) {
          const ang = customStretch > moveRatio ? customAngle : ptr.angle;
          const ca = customStretch > moveRatio ? Math.cos(ang) : cosA;
          const sa = customStretch > moveRatio ? Math.sin(ang) : sinA;
          const major = cr * (1 + ratio * 0.65);
          const minor = cr / Math.sqrt(1 + ratio * 0.65);
          ctx.moveTo(px + major * ca, py + major * sa);
          ctx.ellipse(px, py, major, minor, ang, 0, Math.PI * 2);
          continue;
        }
        ctx.moveTo(px + cr, py);
        ctx.arc(px, py, cr, 0, Math.PI * 2);
      }

      // Центральное ядро для анимации «Схлопывание» (implode)
      for (let w = 0; w < waves.length; w++) {
        const wave = waves[w];
        if (wave.type !== 'implode') continue;
        const p = wave.prog;
        const pw = wave.pw || 1;
        if (p < 0.62) {
          // Растущая чёрная точка сингулярности в центре
          const k = Math.sin((p / 0.62) * Math.PI * 0.5);
          const coreR = maxR * (0.35 + k * 1.45 * pw);
          any = true;
          ctx.moveTo(wave.cx + coreR, wave.cy);
          ctx.arc(wave.cx, wave.cy, coreR, 0, Math.PI * 2);
        } else {
          // Схлопывающееся тонкое кольцо в финале
          const k = (p - 0.62) / 0.38;
          const outerR = maxR * (0.5 + 1.35 * pw) * (1 - k * 0.65);
          const innerR = outerR * Math.pow(k, 0.55);
          if (outerR - innerR > 0.35) {
            any = true;
            ctx.moveTo(wave.cx + outerR, wave.cy);
            ctx.arc(wave.cx, wave.cy, outerR, 0, Math.PI * 2, false);
            ctx.moveTo(wave.cx + innerR, wave.cy);
            ctx.arc(wave.cx, wave.cy, innerR, 0, Math.PI * 2, true);
          }
        }
      }

      // Лопающиеся шарики: тонкое кольцо + микро-брызги (в том же батче)
      const pops = this.pops;
      for (let p = pops.length - 1; p >= 0; p--) {
        const pop = pops[p];
        pop.t += dt;
        if (pop.t >= pop.dur) {
          pops[p] = pops[pops.length - 1];
          pops.pop();
          continue;
        }

        const prog = pop.t / pop.dur;
        const easeOut = 1 - Math.pow(1 - prog, 2.2);
        const outerR = pop.r0 * (1.05 + 0.65 * (pop.pw || 1) * easeOut);
        const innerR = outerR * Math.pow(prog, 0.68);

        if (outerR - innerR > 0.35) {
          any = true;
          ctx.moveTo(pop.x + outerR, pop.y);
          ctx.arc(pop.x, pop.y, outerR, 0, Math.PI * 2, false);
          ctx.moveTo(pop.x + innerR, pop.y);
          ctx.arc(pop.x, pop.y, innerR, 0, Math.PI * 2, true);
        }

        const specks = pop.specks;
        for (let k = 0; k < specks.length; k++) {
          const sp = specks[k];
          const sr = sp.r * (1 - prog);
          if (sr <= 0.2) continue;
          const dist = pop.r0 * 0.8 + sp.travel * easeOut;
          const spx = pop.x + sp.ux * dist;
          const spy = pop.y + sp.uy * dist;
          any = true;
          ctx.moveTo(spx + sr, spy);
          ctx.arc(spx, spy, sr, 0, Math.PI * 2);
        }
      }

      if (any) ctx.fill();
      this.drawn = any;
    }
  }

  // ==========================================================================
  // Страница
  // ==========================================================================
  const fluidCanvas = document.getElementById('fluid-canvas');
  const debugCanvas = document.getElementById('debug-canvas');
  const ctxDebug = debugCanvas.getContext('2d');
  const speedEl = document.getElementById('speed-meter');

  const mainField = new Field(fluidCanvas);
  const mainPtr = new Pointer();

  let debugDirty = false;

  function resizeMain() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mainField.resize(w, h, dpr);
    debugCanvas.width = Math.round(w * dpr);
    debugCanvas.height = Math.round(h * dpr);
    ctxDebug.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ==========================================================================
  // Превью: отдельное окошко с виртуальным курсором
  // ==========================================================================
  const previewWindow = document.getElementById('preview-window');
  const previewCanvas = document.getElementById('preview-canvas');
  const PREVIEW_W = 280;
  const PREVIEW_H = 170;

  let previewField = null;
  const previewPtr = new Pointer();
  const sim = { x: 0, y: 0, tx: 0, ty: 0, wait: 0, popIn: -1, arrivals: 0, ready: false };
  let previewVisible = false;

  if (previewCanvas) {
    previewField = new Field(previewCanvas);
    previewField.resize(PREVIEW_W, PREVIEW_H, Math.min(window.devicePixelRatio || 1, 2));
  }

  function pickTarget() {
    let nx, ny;
    do {
      nx = PREVIEW_W * (0.18 + Math.random() * 0.64);
      ny = PREVIEW_H * (0.22 + Math.random() * 0.56);
    } while (Math.hypot(nx - sim.x, ny - sim.y) < 70);
    sim.tx = nx;
    sim.ty = ny;
  }

  // Виртуальный курсор: едет к случайной точке, останавливается, иногда кликает
  function stepSim(dt, s) {
    if (!sim.ready) {
      sim.ready = true;
      sim.x = PREVIEW_W * 0.25;
      sim.y = PREVIEW_H * 0.5;
      previewPtr.moveTo(sim.x, sim.y);
      pickTarget();
      sim.wait = 500;
    }

    if (sim.wait > 0) {
      sim.wait -= dt;
      if (sim.popIn >= 0) {
        sim.popIn -= dt;
        if (sim.popIn < 0) previewField.triggerPopAt(sim.x, sim.y);
      }
      if (sim.wait <= 0) pickTarget();
      return;
    }

    const dx = sim.tx - sim.x;
    const dy = sim.ty - sim.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) {
      sim.arrivals++;
      sim.wait = 1500;
      sim.popIn = sim.arrivals % 2 === 0 ? 800 : -1; // каждый второй раз — клик
      return;
    }

    const step = Math.min(dist, Math.min(7.5, 1.2 + dist * 0.07) * s);
    sim.x += (dx / dist) * step;
    sim.y += (dy / dist) * step;
    previewPtr.moveTo(sim.x, sim.y);
  }

  // Ставим окно строго над панелью (панель может переноситься на 2 строки)
  function positionPreview() {
    const bar = document.querySelector('.controls-bar');
    if (!bar || !previewWindow) return;
    const top = bar.getBoundingClientRect().top;
    const available = window.innerHeight - previewWindow.offsetHeight - 12;
    previewWindow.style.bottom = `${Math.max(12, Math.min(available, window.innerHeight - top + 14))}px`;
  }

  function setPreviewVisible(v) {
    v = v && window.innerWidth > 700;
    if (v === previewVisible) return;
    previewVisible = v;
    if (v) positionPreview();
    if (previewWindow) previewWindow.classList.toggle('visible', v);
  }

  // ==========================================================================
  // Цикл
  // ==========================================================================
  let lastTime = performance.now();
  let meterTimer = 0;
  let meterText = '';

  function frame(now) {
    const dt = Math.min(50, now - lastTime) || 16.667;
    lastTime = now;
    const s = dt / 16.667;

    mainPtr.update(s);
    mainField.frame(dt, s, mainPtr);
    drawDebug();

    if (previewField && previewVisible) {
      if (!reducedMotion.matches) stepSim(dt, s);
      else previewPtr.moveTo(PREVIEW_W / 2, PREVIEW_H / 2);
      previewPtr.inside = true;
      previewPtr.update(s);
      previewField.frame(dt, s, previewPtr);
    }

    // Спидометр (DOM обновляем редко и только при изменении)
    meterTimer += dt;
    if (meterTimer > 100 && speedEl) {
      meterTimer = 0;
      const text = `${Math.round(mainPtr.speed * 60)} px/s`;
      if (text !== meterText) {
        meterText = text;
        speedEl.textContent = text;
      }
    }

    requestAnimationFrame(frame);
  }

  function drawDebug() {
    if (!config.showVectors) {
      if (debugDirty) {
        ctxDebug.clearRect(0, 0, mainField.width, mainField.height);
        debugDirty = false;
      }
      return;
    }
    debugDirty = true;
    ctxDebug.clearRect(0, 0, mainField.width, mainField.height);
    if (!mainPtr.inside) return;

    ctxDebug.save();
    ctxDebug.beginPath();
    ctxDebug.arc(mainPtr.x, mainPtr.y, config.fieldRadius, 0, Math.PI * 2);
    ctxDebug.strokeStyle = '#d4d4d4';
    ctxDebug.lineWidth = 1;
    ctxDebug.setLineDash([4, 4]);
    ctxDebug.stroke();

    if (mainPtr.speed > 0.8) {
      const len = Math.min(85, mainPtr.speed * 4);
      const ax = mainPtr.x + Math.cos(mainPtr.angle) * len;
      const ay = mainPtr.y + Math.sin(mainPtr.angle) * len;
      ctxDebug.setLineDash([]);
      ctxDebug.beginPath();
      ctxDebug.moveTo(mainPtr.x, mainPtr.y);
      ctxDebug.lineTo(ax, ay);
      ctxDebug.strokeStyle = '#000';
      ctxDebug.lineWidth = 1.5;
      ctxDebug.stroke();
      ctxDebug.font = '500 10px monospace';
      ctxDebug.fillStyle = '#000';
      ctxDebug.fillText('ТЯГА', ax + 8, ay + 4);
    }
    ctxDebug.restore();
  }

  // ==========================================================================
  // Ввод
  // ==========================================================================
  let uiDragging = false; // тянем ползунок — превью остаётся открытым

  window.addEventListener('pointermove', (e) => {
    const overUI = !!(e.target.closest && e.target.closest(UI_SELECTOR));
    setPreviewVisible(overUI || uiDragging);

    if (overUI || uiDragging) {
      // Над панелью — только обычный курсор, эффект на странице скрыт
      mainPtr.leave();
      return;
    }
    mainPtr.moveTo(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const overUI = !!(e.target.closest && e.target.closest(UI_SELECTOR));
    if (overUI) {
      uiDragging = true;
      setPreviewVisible(true);
      mainPtr.leave();
      return;
    }
    mainPtr.down = true;
    mainPtr.moveTo(e.clientX, e.clientY);
    if (!reducedMotion.matches) mainField.triggerPopAt(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', (e) => {
    mainPtr.down = false;
    if (uiDragging) {
      uiDragging = false;
      const overUI = !!(e.target.closest && e.target.closest(UI_SELECTOR));
      setPreviewVisible(overUI);
    }
    if (e.pointerType === 'touch') mainPtr.leave();
  });

  window.addEventListener('pointercancel', () => {
    mainPtr.down = false;
    uiDragging = false;
    mainPtr.leave();
    setPreviewVisible(false);
  });

  document.documentElement.addEventListener('mouseleave', () => {
    mainPtr.leave();
    if (!uiDragging) setPreviewVisible(false);
  });

  window.addEventListener('resize', () => {
    resizeMain();
    if (previewVisible) positionPreview();
  });

  // ==========================================================================
  // Панель управления
  // ==========================================================================
  function bindSlider(id, valueId, onInput, format) {
    const input = document.getElementById(id);
    const label = document.getElementById(valueId);
    if (!input) return;
    const apply = () => {
      const v = parseFloat(input.value);
      onInput(v);
      if (label) label.textContent = format(v);
      input.setAttribute('aria-valuetext', format(v));
    };
    input.addEventListener('input', apply);
    apply();
  }

  function regenerateAll() {
    mainField.generate();
    if (previewField) previewField.generate();
  }

  let regenTimer;
  const regenerateSoon = () => {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(regenerateAll, 120);
  };

  bindSlider('slider-radius', 'val-radius', (v) => { config.fieldRadius = v; }, (v) => `${v}px`);
  bindSlider('slider-size', 'val-size', (v) => { config.maxRadius = v; }, (v) => `${v}px`);
  bindSlider('slider-density', 'val-density', (v) => {
    const changed = config.density !== v;
    config.density = v;
    if (changed) regenerateSoon();
  }, (v) => `${v}/10`);

  const stretchLabels = ['Без вытягивания', 'Слабое', 'Умеренное', 'Сильное', 'Максимальное'];
  const stretchPowers = [0, 0.5, 1.0, 1.6, 2.2];
  bindSlider('slider-stretch', 'val-stretch', (v) => { config.stretch = stretchPowers[v - 1]; }, (v) => stretchLabels[v - 1]);

  let clickDemoTimer = 0;
  function schedulePreviewClick() {
    if (!previewField || !sim.ready || reducedMotion.matches) return;
    const now = performance.now();
    if (now - clickDemoTimer < 260) return;
    clickDemoTimer = now;
    sim.wait = 1200;
    sim.popIn = 40;
  }

  const selectClick = document.getElementById('select-click');
  if (selectClick) {
    selectClick.addEventListener('change', () => {
      config.clickMode = selectClick.value;
      schedulePreviewClick();
    });
  }

  bindSlider('slider-click-radius', 'val-click-radius', (v) => {
    const changed = config.clickRadius !== v;
    config.clickRadius = v;
    if (changed) schedulePreviewClick();
  }, (v) => `${v}px`);

  bindSlider('slider-click-power', 'val-click-power', (v) => {
    const changed = config.clickPower !== v;
    config.clickPower = v;
    if (changed) schedulePreviewClick();
  }, (v) => `${v.toFixed(1)}x`);

  const toggle = (id, onChange) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const on = !btn.classList.contains('active');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      onChange(on);
    });
  };

  toggle('btn-toggle-goo', (on) => {
    fluidCanvas.classList.toggle('goo-active', on);
    if (previewCanvas) previewCanvas.classList.toggle('goo-active', on);
  });
  toggle('btn-toggle-vectors', (on) => { config.showVectors = on; });
  toggle('btn-toggle-system-cursor', (on) => {
    config.hideCursor = on;
    document.body.classList.toggle('hide-cursor', on);
  });

  const shuffle = document.getElementById('btn-shuffle');
  if (shuffle) shuffle.addEventListener('click', regenerateAll);

  const copyBtn = document.getElementById('btn-copy-config');
  if (copyBtn) {
    let copyResetTimer;
    copyBtn.addEventListener('click', async () => {
      const payload = {
        fieldRadius: config.fieldRadius,
        density: config.density,
        minDist: Number(minDistance().toFixed(2)),
        maxRadius: config.maxRadius,
        stretch: config.stretch,
        goo: fluidCanvas.classList.contains('goo-active'),
        clickMode: config.clickMode,
        clickRadius: config.clickRadius,
        clickPower: config.clickPower,
        hideCursor: config.hideCursor
      };
      const text = JSON.stringify(payload, null, 2);

      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      clearTimeout(copyResetTimer);
      copyBtn.textContent = 'Скопировано!';
      copyBtn.classList.add('active');
      copyResetTimer = setTimeout(() => {
        copyBtn.textContent = 'Скопировать параметры';
        copyBtn.classList.remove('active');
      }, 1500);
    });
  }

  window.addEventListener('blur', () => {
    uiDragging = false;
    mainPtr.down = false;
    mainPtr.leave();
    setPreviewVisible(false);
  });
  document.addEventListener('focusin', (event) => {
    if (event.target.closest('.controls-bar')) {
      mainPtr.leave();
      setPreviewVisible(true);
    }
  });
  document.addEventListener('focusout', (event) => {
    if (!event.relatedTarget?.closest('.controls-bar')) setPreviewVisible(false);
  });
  window.addEventListener('scroll', () => {
    mainPtr.leave();
    if (previewVisible) positionPreview();
  }, { passive: true });

  // Hide the native pointer only after the effect has initialized successfully.
  // --- Старт ---
  resizeMain();
  document.body.classList.toggle('hide-cursor', config.hideCursor);
  requestAnimationFrame(frame);
})();
