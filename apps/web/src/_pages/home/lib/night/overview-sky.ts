import { figureSide, figureSkyTurn } from './camera';

/*
 * Мнимое небо общего плана — движение гравюр, когда камера к фигуре не едет (узкий экран, SIDE_LAYOUT_QUERY).
 *
 * На широком экране гравюра въезжает в угол вместе с небом: сдвиг = −f · отставание неба (details.ts).
 * На общем плане небо стоит, а настоящий угол доворота на узком экране дал бы лишь сотню пикселей, поэтому у
 * каждой фигуры есть мнимое положение неба в долях экрана: направление — знак доворота её бокового ракурса
 * (figureSkyTurn), шаг — TRAVEL_SHARE ширины/высоты; у общего плана положение 0. Соседние фигуры стоят по разные
 * стороны (±1 шаг), так что при смене фигуры уходящая уезжает на целый экран, а входящая въезжает из-за края.
 * За ход камеры мнимое небо идёт от S_from к S_to по той же кривой, что камера, e = smoothstep(p):
 *   сдвиг входящей = −(S_from − S_to) · (1 − e) · размер экрана   — доезжает до своего угла;
 *   сдвиг уходящей = −(S_to − S_from) · e · размер экрана         — уплывает в ту же сторону.
 * Если новая цель пришла посреди хода, S_from — текущее мнимое положение: деталь не прыгает.
 */

/** Шаг мнимого неба на одну фигуру, доля ширины (x) и высоты (y) экрана. */
const TRAVEL_SHARE = 0.5;

export interface SkyPoint {
  x: number;
  y: number;
}

interface View {
  readonly width: number;
  readonly height: number;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Мнимое положение неба для состояния туши, доли экрана: знак доворота её бокового ракурса × шаг; общий план — 0. */
export function overviewSkyPosition(state: number, out: SkyPoint): void {
  const side = figureSide(state);
  const turn = side ? figureSkyTurn(state, side) : null;
  out.x = Math.sign(turn?.yaw ?? 0) * TRAVEL_SHARE;
  out.y = Math.sign(turn?.pitch ?? 0) * TRAVEL_SHARE;
}

/** Мнимое небо общего плана: помнит начало и цель хода. Меняется на месте — без аллокаций в rAF. */
export class OverviewSky {
  private readonly from: SkyPoint = { x: 0, y: 0 };
  private readonly to: SkyPoint = { x: 0, y: 0 };

  /** Новая цель хода; progress — доля прежнего хода к этому моменту (откуда мнимое небо стартует). */
  aim(state: number, progress: number): void {
    const e = smoothstep(progress);
    this.from.x += (this.to.x - this.from.x) * e;
    this.from.y += (this.to.y - this.from.y) * e;
    overviewSkyPosition(state, this.to);
  }

  /** Сразу встать в цель (без анимации): ни отставания, ни сноса. */
  snap(state: number): void {
    overviewSkyPosition(state, this.to);
    this.from.x = this.to.x;
    this.from.y = this.to.y;
  }

  /** Сдвиг входящей детали, px: −(S_from − S_to)·(1 − e)·размер экрана. */
  lagShift(progress: number, view: View, out: SkyPoint): void {
    const rest = 1 - smoothstep(progress);
    out.x = (this.to.x - this.from.x) * rest * view.width;
    out.y = (this.to.y - this.from.y) * rest * view.height;
  }

  /** Сдвиг уходящей детали, px: −(S_to − S_from)·e·размер экрана. */
  driftShift(progress: number, view: View, out: SkyPoint): void {
    const e = smoothstep(progress);
    out.x = (this.from.x - this.to.x) * e * view.width;
    out.y = (this.from.y - this.to.y) * e * view.height;
  }
}
