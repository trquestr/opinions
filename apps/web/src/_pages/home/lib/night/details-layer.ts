import { NIGHT_DETAILS } from '../../model/night-details';
import { createDetailSlot, detailOpacity, detailVisibility, placeDetail, solidValue } from './details';
import type { NightDetail } from '../../model/night-details';
import type { DetailSlot } from './details';
import type { Projector } from './projection';
import type { NightFrame } from './timeline';

/*
 * Слой гравюрных деталей: пишет в <img> положение, ширину, прозрачность, растр точек и видимость.
 * Каждое значение округляется и записывается, только если изменилось: px — до 0.5, прозрачность и --solid — до 0.01.
 * Маска (--solid) задаётся в CSS (landing.css): картинка видна россыпью случайных точек, как тушь фигур.
 * Картинки не качаются с первым экраном: src ставится в load(), когда до сцены остаётся экран.
 */

const PX_STEP = 2;
const VALUE_STEP = 100;
/** Меньше этой прозрачности деталь не рисуется вовсе. */
const MIN_OPACITY = 0.01;

/** Что записано в элемент в прошлый раз (NaN — ещё ничего). */
interface Written {
  x: number;
  y: number;
  widthPx: number;
  opacity: number;
  solid: number;
  isVisible: boolean;
}

interface Entry {
  readonly element: HTMLImageElement;
  readonly detail: NightDetail;
  readonly slot: DetailSlot;
  readonly written: Written;
}

function roundTo(value: number, step: number): number {
  return Math.round(value * step) / step;
}

/** Деталь берётся по data-index элемента (ui/night-scene.tsx); null — разметка не та. */
function createEntry(element: HTMLImageElement): Entry | null {
  const detail = NIGHT_DETAILS[Number(element.dataset.index)];
  if (!detail) return null;
  const written = { x: NaN, y: NaN, widthPx: NaN, opacity: NaN, solid: NaN, isVisible: false };
  return { element, detail, slot: createDetailSlot(), written };
}

export class DetailsLayer {
  private readonly entries: Entry[];
  private isLoaded = false;

  constructor(elements: readonly HTMLImageElement[]) {
    this.entries = elements.map(createEntry).filter((entry): entry is Entry => entry !== null);
  }

  /** Начинает загрузку картинок: адрес берётся из data-src, один раз. Повторный вызов ничего не делает. */
  load(): void {
    if (this.isLoaded) return;
    this.isLoaded = true;
    for (const { element } of this.entries) {
      const { src } = element.dataset;
      if (src) element.src = src;
    }
  }

  /** Раскладывает детали по текущей проекции. Вызывается каждый кадр; без аллокаций. */
  update(projector: Projector, frame: NightFrame): void {
    for (const entry of this.entries) {
      const opacity = detailOpacity(frame, entry.detail);
      if (opacity < MIN_OPACITY || !this.place(entry, projector)) {
        this.hide(entry);
        continue;
      }
      this.write(entry, opacity, detailVisibility(frame));
    }
  }

  /** Считает положение; false — деталь не видна (картинка не загружена или за камерой). */
  private place(entry: Entry, projector: Projector): boolean {
    const { element, detail, slot } = entry;
    if (slot.aspect === 0 && element.naturalHeight > 0)
      slot.aspect = element.naturalWidth / element.naturalHeight;
    placeDetail(projector, detail, slot);
    return slot.isVisible;
  }

  private hide(entry: Entry): void {
    if (!entry.written.isVisible) return;
    entry.written.isVisible = false;
    entry.element.style.visibility = 'hidden';
  }

  private write(entry: Entry, opacity: number, visibility: number): void {
    const { element, slot, written } = entry;
    const x = roundTo(slot.x, PX_STEP);
    const y = roundTo(slot.y, PX_STEP);
    const widthPx = roundTo(slot.widthPx, PX_STEP);
    const alpha = roundTo(opacity, VALUE_STEP);
    const solid = roundTo(solidValue(visibility), VALUE_STEP);
    if (!written.isVisible) element.style.visibility = 'visible';
    if (x !== written.x || y !== written.y) element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (widthPx !== written.widthPx) element.style.width = `${widthPx}px`;
    if (alpha !== written.opacity) element.style.opacity = String(alpha);
    if (solid !== written.solid) element.style.setProperty('--solid', String(solid));
    written.x = x;
    written.y = y;
    written.widthPx = widthPx;
    written.opacity = alpha;
    written.solid = solid;
    written.isVisible = true;
  }
}
