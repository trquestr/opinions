import { NIGHT_DETAILS } from '../../model/night-details';
import { createDetailSlot, detailOpacity, placeDetail, shiftDetail } from './details';
import type { NightDetail } from '../../model/night-details';
import type { DetailMotion, DetailSlot } from './details';
import type { NightFrame } from './timeline';

/*
 * Слой гравюрных деталей: пишет в <img> положение, ширину, прозрачность и видимость.
 * Каждое значение округляется и записывается, только если изменилось: px — до 0.5, прозрачность — до 0.01.
 * Картинки не качаются с первым экраном: src ставится в load(), когда до сцены остаётся экран.
 */

const PX_STEP = 2;
const VALUE_STEP = 100;
/** Меньше этой прозрачности деталь скрывается. */
const MIN_OPACITY = 0.01;

/** Что записано в элемент в прошлый раз (NaN — ещё ничего). */
interface Written {
  x: number;
  y: number;
  widthPx: number;
  opacity: number;
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

function formatTransform(entry: Entry, x: number, y: number): string {
  const isFlipped = Boolean(entry.detail.flipX);
  const widthPx = roundTo(entry.slot.widthPx, PX_STEP);
  const tx = isFlipped ? x + widthPx : x;
  const rotate = entry.detail.rotationDeg ? ` rotate(${entry.detail.rotationDeg}deg)` : '';
  const scaleX = isFlipped ? ' scaleX(-1)' : '';
  return `translate3d(${tx}px, ${y}px, 0)${rotate}${scaleX}`;
}

/** Деталь берётся по data-index элемента (ui/night-scene.tsx); null — разметка не та. */
function createEntry(element: HTMLImageElement): Entry | null {
  const detail = NIGHT_DETAILS[Number(element.dataset.index)];
  if (!detail) return null;
  const written = { x: NaN, y: NaN, widthPx: NaN, opacity: NaN, isVisible: false };
  return { element, detail, slot: createDetailSlot(), written };
}

export class DetailsLayer {
  private readonly entries: Entry[];
  private isLoaded = false;

  constructor(elements: readonly HTMLImageElement[]) {
    this.entries = elements.map(createEntry).filter((entry): entry is Entry => entry !== null);
  }

  /** Начинает загрузку картинок: адрес берётся из data-src, один раз. */
  load(): void {
    if (this.isLoaded) return;
    this.isLoaded = true;
    for (const { element } of this.entries) {
      const { src } = element.dataset;
      if (src) element.src = src;
    }
  }

  /** Раскладывает детали по экрану и движению камеры. Вызывается каждый кадр; без аллокаций. */
  update(view: { width: number; height: number }, frame: NightFrame, motion: DetailMotion): void {
    for (const entry of this.entries) {
      const opacity = detailOpacity(frame, entry.detail, motion);
      if (opacity < MIN_OPACITY || !this.place(entry, view, motion)) {
        this.hide(entry);
        continue;
      }
      this.write(entry, opacity);
    }
  }

  /** Считает положение; false — деталь не видна (картинка не загружена). */
  private place(entry: Entry, view: { width: number; height: number }, motion: DetailMotion): boolean {
    const { element, detail, slot } = entry;
    if (slot.aspect === 0 && element.naturalHeight > 0)
      slot.aspect = element.naturalWidth / element.naturalHeight;
    placeDetail(view, detail, slot);
    shiftDetail(slot, detail, motion);
    return slot.isVisible;
  }

  private hide(entry: Entry): void {
    if (!entry.written.isVisible) return;
    entry.written.isVisible = false;
    entry.written.opacity = 0;
    entry.element.style.visibility = 'hidden';
    entry.element.style.opacity = '0';
  }

  private syncTransform(entry: Entry, x: number, y: number): void {
    const isFlipped = Boolean(entry.detail.flipX);
    const widthPx = roundTo(entry.slot.widthPx, PX_STEP);
    if (x === entry.written.x && y === entry.written.y && (!isFlipped || widthPx === entry.written.widthPx)) {
      return;
    }
    entry.element.style.transform = formatTransform(entry, x, y);
  }

  private write(entry: Entry, opacity: number): void {
    const { element, slot, written } = entry;
    const x = roundTo(slot.x, PX_STEP);
    const y = roundTo(slot.y, PX_STEP);
    const widthPx = roundTo(slot.widthPx, PX_STEP);
    const alpha = roundTo(opacity, VALUE_STEP);
    if (!written.isVisible) element.style.visibility = 'visible';
    this.syncTransform(entry, x, y);
    if (widthPx !== written.widthPx) element.style.width = `${widthPx}px`;
    if (alpha !== written.opacity) element.style.opacity = String(alpha);
    written.x = x;
    written.y = y;
    written.widthPx = widthPx;
    written.opacity = alpha;
    written.isVisible = true;
  }
}
