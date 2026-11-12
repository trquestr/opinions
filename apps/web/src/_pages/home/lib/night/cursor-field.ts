import type { Size } from './layout';

/*
 * Курсор ночной сцены — тот же, что в прологе (apps/web/public/js/landing.js: pointer, CURSOR_CFG, buildCursorField,
 * цикл поля в render). Перенесён один в один, меняется только цвет туши (ночью светлая).
 *
 * Как устроен:
 *   - по всему экрану заранее рассыпано «полотно» скрытых точек (диск Пуассона, шаг minDist ≈ 19 px);
 *   - точки в радиусе fieldRadius (≈ 42 px) от курсора «прорастают»: целевой радиус
 *       FT = (minR + (maxR − minR) · prox^1.25) · FSF · (e + 0.2·sin(πe)),
 *     prox = 1 − d/fieldRadius, e — доля прорастания (растёт со скоростью (0.10 + 0.14·prox)·FSF за кадр 60 Гц),
 *     0.2·sin(πe) — выпуклость поверхностного натяжения при рождении капли;
 *   - радиус догоняет цель: растёт с личной скоростью FGS, тает с FSS (+ ускорение у совсем мелких);
 *   - при движении капли сносит по скорости курсора (0.75·v, не дальше 0.32·fieldRadius) и вытягивает:
 *       stretch = min(1.2, speed/12 · FR/maxR);
 *   - щелчок — ударная волна радиуса clickRadius за 440 мс: в полосе фронта капли толкает наружу и раздувает,
 *     внутри кольца — разрежение.
 * Шейдер склеивает эти капли между собой smin с k = 13 и с тушью — smin с k = min(6.5, 1.3·r) (как в прологе).
 */
export const MAX_CURSOR_DOTS = 256;
const BIN = 64;
const PAD = 32;
const WAVE_MS = 440;
const CLICK_POWER = 0.4;
const STRETCH = 1.0;

interface SwarmRing {
  readonly alpha: number;
  readonly beta: number;
  readonly r: number;
  readonly speed: number;
  readonly count: number;
}

interface SwarmDroplet {
  readonly ring: SwarmRing;
  readonly phase: number;
  readonly baseRadius: number;
  readonly spawnAngle: number;
  readonly spawnRadius: number;
  readonly spawnDelay: number;
  curX: number;
  curY: number;
  currentRadius: number;
  migration: number;
  originX: number;
  originY: number;
  deflectX: number;
  deflectY: number;
}

interface FieldConfig {
  readonly fieldRadius: number;
  readonly minDist: number;
  readonly maxRadius: number;
  readonly clickRadius: number;
}

/** Размеры поля зависят от окна так же, как в прологе (там они считаются от высоты слова). */
export function fieldConfig(view: Size): FieldConfig {
  const { width, height } = view;
  const wordHeight = Math.max(1, Math.min(width * 0.12, (width - 40) / 7.02, height * 0.28, 134));
  const dotScale = Math.max(
    0.5,
    Math.min(1.0, 0.45 + 0.55 * Math.max(0, (wordHeight - 35) / (134 - 35)) ** 0.85),
  );
  const soft = Math.max(0.7, dotScale);
  return {
    maxRadius: Math.max(6, Math.round(12 * dotScale)),
    fieldRadius: Math.max(28, Math.round(42 * soft)),
    clickRadius: Math.max(38, Math.round(55 * soft)),
    minDist: Math.max(13, 18.8 * soft),
  };
}

/** Указатель с накоплением смещения между кадрами и сглаженной скоростью (pointer из landing.js). */
class Pointer {
  x = -9999;
  y = -9999;
  vx = 0;
  vy = 0;
  speed = 0;
  angle = 0;
  isInside = false;
  private lastX = -9999;
  private lastY = -9999;
  private accX = 0;
  private accY = 0;

  moveTo(x: number, y: number): void {
    if (!this.isInside) {
      this.isInside = true;
      this.lastX = x;
      this.lastY = y;
    }
    this.accX += x - this.lastX;
    this.accY += y - this.lastY;
    this.lastX = this.x = x;
    this.lastY = this.y = y;
  }

  leave(): void {
    this.isInside = false;
    this.accX = 0;
    this.accY = 0;
  }

  /** s — длительность кадра в кадрах 60 Гц. */
  update(s: number): void {
    const k = 1 - 0.75 ** s;
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
}

interface Wave {
  readonly cx: number;
  readonly cy: number;
  readonly maxR: number;
  t: number;
}

/** Расстановка точек полотна: диск Пуассона (алгоритм Бридсона), как buildCursorField. */
function poissonDisk(view: Size, minDist: number, random: () => number): { xs: number[]; ys: number[] } {
  const cell = minDist / Math.SQRT2;
  const gw = Math.ceil((view.width + PAD * 2) / cell);
  const gh = Math.ceil((view.height + PAD * 2) / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const xs: number[] = [];
  const ys: number[] = [];
  const queue: number[] = [];
  const cellOf = (x: number, y: number) => Math.floor((y + PAD) / cell) * gw + Math.floor((x + PAD) / cell);
  const add = (x: number, y: number) => {
    grid[cellOf(x, y)] = xs.length;
    queue.push(xs.length);
    xs.push(x);
    ys.push(y);
  };
  const isFree = (x: number, y: number) => {
    const gx = Math.floor((x + PAD) / cell);
    const gy = Math.floor((y + PAD) / cell);
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) {
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const n = grid[yy * gw + xx] ?? -1;
        if (n !== -1 && ((xs[n] ?? 0) - x) ** 2 + ((ys[n] ?? 0) - y) ** 2 < minDist * minDist) return false;
      }
    }
    return true;
  };
  const isOnScreen = (x: number, y: number) =>
    x >= -PAD && x <= view.width + PAD && y >= -PAD && y <= view.height + PAD;
  /** До 20 попыток поставить точку в кольце [minDist, 1.95·minDist] вокруг точки p. */
  const placeNear = (p: number): boolean => {
    for (let k = 0; k < 20; k++) {
      const a = random() * Math.PI * 2;
      const d = minDist * (1 + random() * 0.95);
      const x = (xs[p] ?? 0) + Math.cos(a) * d;
      const y = (ys[p] ?? 0) + Math.sin(a) * d;
      if (isOnScreen(x, y) && isFree(x, y)) {
        add(x, y);
        return true;
      }
    }
    return false;
  };
  add(view.width * 0.5, view.height * 0.5);
  while (queue.length > 0) {
    const qi = Math.floor(random() * queue.length);
    if (!placeNear(queue[qi] ?? 0)) {
      queue[qi] = queue[queue.length - 1] ?? 0;
      queue.pop();
    }
  }
  return { xs, ys };
}

export class CursorField {
  readonly pointer = new Pointer();
  /** Для шейдера: (x, y, r, stretch) на каплю, число капель, направление вытягивания и рамка капель. */
  readonly dots = new Float32Array(MAX_CURSOR_DOTS * 4);
  dotCount = 0;
  readonly bbox = new Float32Array(4);
  private config: FieldConfig = fieldConfig({ width: 1, height: 1 });
  private count = 0;
  private fx = new Float32Array(0);
  private fy = new Float32Array(0);
  private fdx = new Float32Array(0);
  private fdy = new Float32Array(0);
  private fr = new Float32Array(0);
  private ft = new Float32Array(0);
  private fe = new Float32Array(0);
  private fst = new Float32Array(0);
  private fsf = new Float32Array(0);
  private fgs = new Float32Array(0);
  private fss = new Float32Array(0);
  private fin = new Uint8Array(0);
  private active: number[] = [];
  private bins: number[][] = [];
  private binCols = 0;
  private binRows = 0;
  private readonly waves: Wave[] = [];
  /** Скретч цели капли и снос курсора на кадр — поля, а не объекты (без аллокаций в rAF). */
  private readonly target = { x: 0, y: 0, stretch: 0 };
  private shiftX = 0;
  private shiftY = 0;
  /** Рамка капель кадра (для раннего выхода в шейдере). */
  private minX = 1e5;
  private minY = 1e5;
  private maxX = -1e5;
  private maxY = -1e5;
  private readonly byRadiusDesc = (a: number, b: number) => (this.fr[b] ?? 0) - (this.fr[a] ?? 0);
  private hasAnchor = false;
  private anchorX = 0;
  private anchorY = 0;
  private targetAnchorX = 0;
  private targetAnchorY = 0;
  private swarmActive = 0.0;
  private swarmTime = 0.0;
  private readonly swarmEase = { migIn: 0, migOut: 0, rEase: 0, defEase: 0 };
  private readonly swarmDroplets: SwarmDroplet[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  build(view: Size): void {
    this.config = fieldConfig(view);
    const { xs, ys } = poissonDisk(view, this.config.minDist, this.random);
    const n = xs.length;
    this.count = n;
    this.fx = Float32Array.from(xs);
    this.fy = Float32Array.from(ys);
    this.fdx = new Float32Array(n);
    this.fdy = new Float32Array(n);
    this.fr = new Float32Array(n);
    this.ft = new Float32Array(n);
    this.fe = new Float32Array(n);
    this.fst = new Float32Array(n);
    this.fsf = Float32Array.from({ length: n }, () => 0.7 + this.random() * 0.6);
    this.fgs = Float32Array.from({ length: n }, () => 0.06 + this.random() * 0.12);
    this.fss = Float32Array.from({ length: n }, () => 0.13 + this.random() * 0.08);
    this.fin = new Uint8Array(n);
    this.active = [];
    this.waves.length = 0;
    this.binCols = Math.ceil((view.width + PAD * 2) / BIN);
    this.binRows = Math.ceil((view.height + PAD * 2) / BIN);
    this.bins = Array.from({ length: this.binCols * this.binRows }, () => []);
    for (let i = 0; i < n; i++) this.binOf(this.fx[i] ?? 0, this.fy[i] ?? 0)?.push(i);
    this.hasAnchor = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.targetAnchorX = 0;
    this.targetAnchorY = 0;
    this.swarmActive = 0;
    this.swarmTime = 0;
    this.buildSwarm();
  }

  /** Привязка к звезде созвездия: капли курсора переходят на 3D-орбиты вокруг звезды. */
  setStarAnchor(point: { readonly x: number; readonly y: number } | null): void {
    if (point) {
      if (!this.hasAnchor) {
        this.anchorX = point.x;
        this.anchorY = point.y;
      }
      this.targetAnchorX = point.x;
      this.targetAnchorY = point.y;
      this.hasAnchor = true;
    } else {
      this.hasAnchor = false;
    }
  }

  /** Есть ли живые капли или волны (нужен следующий кадр). */
  isActive(): boolean {
    return (
      this.active.length > 0 ||
      this.waves.length > 0 ||
      this.pointer.isInside ||
      this.swarmActive > 0.001 ||
      this.hasAnchor
    );
  }

  click(cx: number, cy: number): void {
    const maxR = Math.max(10, this.config.clickRadius);
    this.activateAround(cx, cy, maxR);
    this.waves.push({ cx, cy, maxR, t: 0 });
  }

  /** Кадр: dtMs — длительность кадра; результат — в dots/dotCount/bbox. */
  step(dtMs: number): void {
    const s = dtMs / 16.667;
    this.pointer.update(s);
    this.updateShift();
    this.advanceWaves(dtMs);
    this.updateSwarm(s, dtMs);
    if (this.pointer.isInside) this.activateAround(this.pointer.x, this.pointer.y, this.config.fieldRadius);
    let write = 0;
    for (const i of this.active) {
      if (this.stepDot(i, s)) this.active[write++] = i;
    }
    this.active.length = write;
    this.pack();
  }

  private binOf(x: number, y: number): number[] | undefined {
    const bx = Math.floor((x + PAD) / BIN);
    const by = Math.floor((y + PAD) / BIN);
    if (bx < 0 || by < 0 || bx >= this.binCols || by >= this.binRows) return undefined;
    return this.bins[by * this.binCols + bx];
  }

  /** Включает в работу точки полотна в радиусе r от (cx, cy). */
  private activateAround(cx: number, cy: number, r: number): void {
    const x0 = Math.max(0, Math.floor((cx - r + PAD) / BIN));
    const x1 = Math.min(this.binCols - 1, Math.floor((cx + r + PAD) / BIN));
    const y0 = Math.max(0, Math.floor((cy - r + PAD) / BIN));
    const y1 = Math.min(this.binRows - 1, Math.floor((cy + r + PAD) / BIN));
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++)
        this.activateBin(this.bins[by * this.binCols + bx] ?? [], { cx, cy, r });
    }
  }

  private activateBin(
    bin: readonly number[],
    around: { readonly cx: number; readonly cy: number; readonly r: number },
  ): void {
    for (const i of bin) {
      if (this.fin[i]) continue;
      const dx = (this.fx[i] ?? 0) - around.cx;
      const dy = (this.fy[i] ?? 0) - around.cy;
      if (dx * dx + dy * dy >= around.r * around.r) continue;
      this.fin[i] = 1;
      this.fe[i] = 0;
      this.active.push(i);
    }
  }

  private advanceWaves(dtMs: number): void {
    for (let w = this.waves.length - 1; w >= 0; w--) {
      const wave = this.waves[w];
      if (!wave) continue;
      wave.t += dtMs;
      if (wave.t >= WAVE_MS) this.waves.splice(w, 1);
    }
  }

  /**
   * 3D-орбитальный рой круговых орбит Резерфорда (как на эскизе):
   * 3 наклонных круговых кольца под углами (α, β), встречные направления вращения,
   * мелкие звёздные капли с уменьшением размера при прохождении «за звездой» (эффект 3D-глубины).
   */
  private buildSwarm(): void {
    const scale = Math.max(0.65, Math.min(1.0, this.config.maxRadius / 12));
    const orbitR = 48 * scale;
    const beta = (64 * Math.PI) / 180;
    const rings: SwarmRing[] = [
      {
        alpha: (-35 * Math.PI) / 180,
        beta,
        r: orbitR,
        speed: 1.4,
        count: 4,
      },
      {
        alpha: (35 * Math.PI) / 180,
        beta: -beta,
        r: orbitR,
        speed: -1.2,
        count: 4,
      },
      {
        alpha: (90 * Math.PI) / 180,
        beta,
        r: orbitR * 0.95,
        speed: 1.6,
        count: 4,
      },
    ];

    // Мелкие капли-звёзды (от 2.0 до 3.4 px), чтобы не слипаться в единое пятно
    const ringRadii = [
      [2.2, 3.2, 2.0, 3.0],
      [2.8, 2.2, 3.4, 2.4],
      [2.0, 3.4, 2.2, 3.0],
    ];

    this.swarmDroplets.length = 0;
    rings.forEach((ring, ringIdx) => {
      const sizes = ringRadii[ringIdx] ?? [2.5, 2.0, 2.5, 2.0];
      for (let k = 0; k < ring.count; k++) {
        const totalIdx = ringIdx * ring.count + k;
        this.swarmDroplets.push({
          ring,
          phase: (k / ring.count) * Math.PI * 2,
          baseRadius: (sizes[k % sizes.length] ?? 2.5) * scale,
          spawnAngle: totalIdx * 2.399963,
          spawnRadius: (6 + (totalIdx % 4) * 4) * scale,
          spawnDelay: totalIdx * 0.045,
          curX: 0,
          curY: 0,
          currentRadius: 0,
          migration: 0,
          originX: 0,
          originY: 0,
          deflectX: 0,
          deflectY: 0,
        });
      }
    });
  }

  private updateSwarm(s: number, dtMs: number): void {
    const targetSwarm = this.hasAnchor && this.pointer.isInside ? 1.0 : 0.0;
    const swarmEase = targetSwarm > 0.5 ? 0.075 : 0.085;
    this.swarmActive += (targetSwarm - this.swarmActive) * (1.0 - (1.0 - swarmEase) ** s);
    if (Math.abs(this.swarmActive - targetSwarm) < 0.001) {
      this.swarmActive = targetSwarm;
    }
    this.updateAnchor(s);
    if (this.swarmActive > 0.0005) {
      this.swarmTime += dtMs * 0.001 * 1.8;
    }
    this.swarmEase.migIn = 1.0 - (1.0 - 0.065) ** s;
    this.swarmEase.migOut = 1.0 - (1.0 - 0.085) ** s;
    this.swarmEase.rEase = 1.0 - (1.0 - 0.12) ** s;
    this.swarmEase.defEase = 1.0 - (1.0 - 0.18) ** s;
    for (const d of this.swarmDroplets) {
      this.stepSwarmDroplet(d);
    }
  }

  private updateAnchor(s: number): void {
    if (!this.hasAnchor) return;
    const anchorEase = 1.0 - (1.0 - 0.2) ** s;
    this.anchorX += (this.targetAnchorX - this.anchorX) * anchorEase;
    this.anchorY += (this.targetAnchorY - this.anchorY) * anchorEase;
  }

  private updateDropletOrigin(d: SwarmDroplet): void {
    if (this.hasAnchor && d.migration < 0.001) {
      d.originX = this.pointer.x + Math.cos(d.spawnAngle) * d.spawnRadius;
      d.originY = this.pointer.y + Math.sin(d.spawnAngle) * d.spawnRadius;
    } else if (!this.hasAnchor && this.pointer.isInside) {
      d.originX = this.pointer.x + Math.cos(d.spawnAngle) * d.spawnRadius;
      d.originY = this.pointer.y + Math.sin(d.spawnAngle) * d.spawnRadius;
    }
  }

  private updateDropletMigration(d: SwarmDroplet): void {
    const effectiveActive = Math.max(0.0, this.swarmActive - d.spawnDelay);
    const targetMig = this.hasAnchor && effectiveActive > 0 ? 1.0 : 0.0;
    const factor = targetMig > 0.5 ? this.swarmEase.migIn : this.swarmEase.migOut;
    d.migration += (targetMig - d.migration) * factor;
    if (!this.hasAnchor && d.migration < 0.01) d.migration = 0.0;
  }

  private stepSwarmDroplet(d: SwarmDroplet): void {
    this.updateDropletOrigin(d);
    this.updateDropletMigration(d);

    const m = Math.max(0.0, Math.min(1.0, d.migration));
    const easeM = 0.5 - 0.5 * Math.cos(m * Math.PI);

    const th = d.phase + this.swarmTime * d.ring.speed;
    const u = d.ring.r * Math.cos(th);
    const v = d.ring.r * Math.sin(th);
    const xPrime = u;
    const yPrime = v * Math.cos(d.ring.beta);
    const zPrime = v * Math.sin(d.ring.beta);

    const xOrbit = xPrime * Math.cos(d.ring.alpha) - yPrime * Math.sin(d.ring.alpha);
    const yOrbit = xPrime * Math.sin(d.ring.alpha) + yPrime * Math.cos(d.ring.alpha);

    d.curX = (1.0 - easeM) * d.originX + easeM * (this.anchorX + xOrbit);
    d.curY = (1.0 - easeM) * d.originY + easeM * (this.anchorY + yOrbit);

    this.deflectSwarmDroplet(d, easeM);

    // Глубина zPrime: перед звездой (zPrime > 0) капля больше, за звездой (zPrime < 0) — заметно меньше
    const zNorm = d.ring.r > 0 ? zPrime / d.ring.r : 0;
    const depthScale = Math.max(0.35, Math.min(1.3, 0.85 + 0.45 * zNorm));
    this.growSwarmDroplet(d, m, depthScale);
  }

  private deflectSwarmDroplet(d: SwarmDroplet, easeM: number): void {
    let targetDefX = 0;
    let targetDefY = 0;
    if (this.pointer.isInside && easeM > 0.5) {
      const ddx = d.curX - this.pointer.x;
      const ddy = d.curY - this.pointer.y;
      const dist = Math.hypot(ddx, ddy);
      const reactRadius = 45;
      if (dist < reactRadius) {
        const prox = 1.0 - dist / reactRadius;
        targetDefX = this.pointer.vx * 0.25 * prox;
        targetDefY = this.pointer.vy * 0.25 * prox;
      }
    }
    d.deflectX += (targetDefX - d.deflectX) * this.swarmEase.defEase;
    d.deflectY += (targetDefY - d.deflectY) * this.swarmEase.defEase;
    d.curX += d.deflectX;
    d.curY += d.deflectY;
  }

  private growSwarmDroplet(d: SwarmDroplet, m: number, depthScale: number): void {
    const bloom = Math.min(1.0, m * 2.2);
    const presence = this.hasAnchor ? 1.0 : this.swarmActive;
    const targetR = d.baseRadius * presence * (0.55 + bloom * 0.45) * depthScale;
    d.currentRadius += (targetR - d.currentRadius) * this.swarmEase.rEase;
    if (d.currentRadius < 0.05) d.currentRadius = 0.0;
  }

  /** Одна капля поля за кадр. Возвращает false, если капля растаяла и выходит из работы. */
  private stepDot(i: number, s: number): boolean {
    const { target } = this;
    target.x = 0;
    target.y = 0;
    target.stretch = 0;
    this.growTowardPointer(i, s, target);
    for (const wave of this.waves) this.applyWave(i, wave, target);
    this.easeRadius(i, s);
    this.easeMotion(i, 1 - (1 - 0.18) ** s);
    if ((this.fr[i] ?? 0) <= 0.02 && this.ft[i] === 0) {
      this.resetDot(i);
      return false;
    }
    return true;
  }

  /** Снос и вытягивание догоняют цель кадра на долю pEase. */
  private easeMotion(i: number, pEase: number): void {
    const { target } = this;
    const dx = this.fdx[i] ?? 0;
    const dy = this.fdy[i] ?? 0;
    const st = this.fst[i] ?? 0;
    this.fdx[i] = dx + (target.x - dx) * pEase;
    this.fdy[i] = dy + (target.y - dy) * pEase;
    this.fst[i] = st + (target.stretch - st) * pEase;
  }

  /** Прорастание у курсора, снос и вытягивание по его скорости; вне поля — увядание. */
  private growTowardPointer(i: number, s: number, target: { x: number; y: number; stretch: number }): void {
    const { pointer, config } = this;
    const proximity = pointer.isInside ? this.proximity(i) : 0;
    if (proximity <= 0) {
      this.ft[i] = 0;
      this.fe[i] = (this.fe[i] ?? 0) * 0.8 ** s;
      return;
    }
    const sf = this.fsf[i] ?? 1;
    const emerge = (0.1 + proximity * 0.14) * sf;
    const e = Math.min(1, (this.fe[i] ?? 0) + (1 - (this.fe[i] ?? 0)) * (1 - (1 - emerge) ** s));
    this.fe[i] = e;
    const minR = Math.max(0.8, config.maxRadius * 0.15);
    const swarmFade = Math.max(0, 1 - this.swarmActive);
    this.ft[i] =
      (minR + (config.maxRadius - minR) * proximity ** 1.25) *
      sf *
      (e + Math.sin(e * Math.PI) * 0.2) *
      swarmFade;
    if (pointer.speed <= 0.4) return;
    target.x = this.shiftX * proximity;
    target.y = this.shiftY * proximity;
    if (proximity > 0.06) {
      target.stretch = Math.min(1.2, (pointer.speed / 12) * ((this.fr[i] ?? 0) / config.maxRadius) * STRETCH);
    }
  }

  private proximity(i: number): number {
    const fieldRadius = this.config.fieldRadius;
    const d = Math.hypot((this.fx[i] ?? 0) - this.pointer.x, (this.fy[i] ?? 0) - this.pointer.y);
    return d < fieldRadius ? 1 - d / fieldRadius : 0;
  }

  /** Снос по скорости курсора: 0.75·v, длина не больше 0.32·fieldRadius. Один раз на кадр. */
  private updateShift(): void {
    const sx = this.pointer.vx * 0.75 * STRETCH;
    const sy = this.pointer.vy * 0.75 * STRETCH;
    const maxShift = this.config.fieldRadius * 0.32;
    const m = Math.hypot(sx, sy);
    const k = m > maxShift ? maxShift / m : 1;
    this.shiftX = sx * k;
    this.shiftY = sy * k;
  }

  private applyWave(i: number, wave: Wave, target: { x: number; y: number; stretch: number }): void {
    const dx = (this.fx[i] ?? 0) - wave.cx;
    const dy = (this.fy[i] ?? 0) - wave.cy;
    const d = Math.hypot(dx, dy);
    if (d >= wave.maxR) return;
    const p = wave.t / WAVE_MS;
    const band = Math.max(12, wave.maxR * 0.28);
    const diff = d - wave.maxR * (1 - (1 - p) ** 2.2);
    if (Math.abs(diff) >= band) {
      // Разрежение внутри ударного кольца
      if (diff < 0 && p < 0.65) this.ft[i] = (this.ft[i] ?? 0) * Math.max(0.05, 1 - 0.8 * CLICK_POWER);
      return;
    }
    const pulse = Math.cos((diff / band) * (Math.PI * 0.5)) * (1 - p);
    const pushPerPx = d > 0.1 ? (pulse * Math.max(8, wave.maxR * 0.25) * CLICK_POWER) / d : 0;
    target.x += dx * pushPerPx;
    target.y += dy * pushPerPx;
    target.stretch = Math.max(target.stretch, pulse * 0.9 * CLICK_POWER);
    this.boostOnWave(i, pulse);
  }

  /** Капля на фронте волны раздувается до 0.9 от наибольшего размера (с запасом по пульсу). */
  private boostOnWave(i: number, pulse: number): void {
    const minR = Math.max(0.8, this.config.maxRadius * 0.15);
    const boost =
      (minR + (this.config.maxRadius - minR) * 0.9) *
      (this.fsf[i] ?? 1) *
      (0.65 + pulse * 0.85 * CLICK_POWER);
    if (boost > (this.ft[i] ?? 0)) this.ft[i] = boost;
  }

  /** Радиус догоняет цель; без цели капля тает (у мелких — быстрее, чтобы не ползли субпиксельно). */
  private easeRadius(i: number, s: number): void {
    const r = this.fr[i] ?? 0;
    const goal = this.ft[i] ?? 0;
    if (goal === 0) {
      const shrink = (this.fss[i] ?? 0.15) + Math.max(0, (2 - r) * 0.08);
      this.fr[i] = Math.max(0, r - Math.max(r * (1 - (1 - shrink) ** s), 0.04 * s));
      return;
    }
    const ease = goal > r ? (this.fgs[i] ?? 0.1) : (this.fss[i] ?? 0.15);
    this.fr[i] = r + (goal - r) * (1 - (1 - ease) ** s);
  }

  private resetDot(i: number): void {
    this.fr[i] = 0;
    this.fdx[i] = 0;
    this.fdy[i] = 0;
    this.fst[i] = 0;
    this.fin[i] = 0;
    this.fe[i] = 0;
  }

  /** Самые крупные MAX_CURSOR_DOTS капель (поле + орбитальный рой) — в массив для шейдера. */
  private pack(): void {
    if (this.active.length > MAX_CURSOR_DOTS) {
      this.active.sort(this.byRadiusDesc);
      for (let n = MAX_CURSOR_DOTS; n < this.active.length; n++) this.resetDot(this.active[n] ?? 0);
      this.active.length = MAX_CURSOR_DOTS;
    }
    this.minX = 1e5;
    this.minY = 1e5;
    this.maxX = -1e5;
    this.maxY = -1e5;
    let count = 0;
    for (const i of this.active) {
      if (count >= MAX_CURSOR_DOTS) break;
      this.packDot(i, count++);
    }
    for (const d of this.swarmDroplets) {
      if (d.currentRadius <= 0.05 || count >= MAX_CURSOR_DOTS) continue;
      this.packSwarmDot(d, count++);
    }
    this.dotCount = count;
    if (count > 0) {
      this.bbox[0] = this.minX;
      this.bbox[1] = this.minY;
      this.bbox[2] = this.maxX;
      this.bbox[3] = this.maxY;
    } else {
      this.bbox[0] = 0;
      this.bbox[1] = 0;
      this.bbox[2] = 0;
      this.bbox[3] = 0;
    }
  }

  private packSwarmDot(d: SwarmDroplet, n: number): void {
    const x = d.curX;
    const y = d.curY;
    const r = d.currentRadius;
    const pad = r + 32;
    const at = n * 4;
    this.dots[at] = x;
    this.dots[at + 1] = y;
    this.dots[at + 2] = r;
    this.dots[at + 3] = 0;
    this.minX = Math.min(this.minX, x - pad);
    this.minY = Math.min(this.minY, y - pad);
    this.maxX = Math.max(this.maxX, x + pad);
    this.maxY = Math.max(this.maxY, y + pad);
  }

  private packDot(i: number, n: number): void {
    const x = (this.fx[i] ?? 0) + (this.fdx[i] ?? 0);
    const y = (this.fy[i] ?? 0) + (this.fdy[i] ?? 0);
    const r = this.fr[i] ?? 0;
    const st = this.fst[i] ?? 0;
    const pad = r * (1 + st) + 32;
    const at = n * 4;
    this.dots[at] = x;
    this.dots[at + 1] = y;
    this.dots[at + 2] = r;
    this.dots[at + 3] = st;
    this.minX = Math.min(this.minX, x - pad);
    this.minY = Math.min(this.minY, y - pad);
    this.maxX = Math.max(this.maxX, x + pad);
    this.maxY = Math.max(this.maxY, y + pad);
  }
}
