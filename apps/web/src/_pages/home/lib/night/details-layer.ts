import { NIGHT_DETAILS } from '../../model/night-details';
import { createDetailSlot, depthDetail, detailOpacity, placeDetail, shiftDetail } from './details';
import type { NightDetail } from '../../model/night-details';
import type { DetailMotion, DetailSlot } from './details';
import type { NightFrame } from './timeline';

/*
 * Слой гравюрных деталей: пишет в <img> положение, ширину, прозрачность и видимость.
 * Каждое значение округляется и записывается, только если изменилось: px — до 0.5, прозрачность — до 0.01,
 * масштаб глубины — до 0.001.
 * Картинки не качаются с первым экраном: src ставится в load(), когда до сцены остаётся экран.
 */

const PX_STEP = 2;
const VALUE_STEP = 100;
const SCALE_STEP = 1000;
/** Меньше этой прозрачности деталь скрывается. */
const MIN_OPACITY = 0.01;

/** Что записано в элемент в прошлый раз (NaN — ещё ничего). */
interface Written {
  x: number;
  y: number;
  widthPx: number;
  opacity: number;
  depthScale: number;
  isVisible: boolean;
}

/** Округлённая поза детали на экране: что идёт в transform. */
interface Pose {
  x: number;
  y: number;
  widthPx: number;
  depthScale: number;
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

/**
 * translate — верхний левый угол; затем уход вглубь — масштаб вокруг центра картинки (depthDetail в details.ts);
 * затем собственный поворот и отражение детали (отражение — вокруг левого края со сдвигом на ширину).
 * В покое масштаб 1, и деталь стоит ровно как без него.
 */
function formatTransform(entry: Entry, pose: Pose): string {
  const { detail, slot } = entry;
  const cx = pose.widthPx / 2;
  const cy = roundTo(slot.heightPx / 2, PX_STEP);
  const depth = ` translate(${cx}px, ${cy}px) scale(${pose.depthScale}) translate(${-cx}px, ${-cy}px)`;
  const flip = detail.flipX ? ` translate(${pose.widthPx}px, 0px)` : '';
  const rotate = detail.rotationDeg ? ` rotate(${detail.rotationDeg}deg)` : '';
  const scaleX = detail.flipX ? ' scaleX(-1)' : '';
  return `translate3d(${pose.x}px, ${pose.y}px, 0)${depth}${flip}${rotate}${scaleX}`;
}

/** Деталь берётся по data-index элемента (ui/night-scene.tsx); null — разметка не та. */
function createEntry(element: HTMLImageElement): Entry | null {
  const detail = NIGHT_DETAILS[Number(element.dataset.index)];
  if (!detail) return null;
  const written = {
    x: NaN,
    y: NaN,
    widthPx: NaN,
    opacity: NaN,
    depthScale: NaN,
    isVisible: false,
  };
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
    depthDetail(view, slot);
    return slot.isVisible;
  }

  private hide(entry: Entry): void {
    if (!entry.written.isVisible) return;
    entry.written.isVisible = false;
    entry.written.opacity = 0;
    entry.element.style.visibility = 'hidden';
    entry.element.style.opacity = '0';
  }

  private readonly pose: Pose = { x: 0, y: 0, widthPx: 0, depthScale: 1 };

  /** Округляет позу детали в this.pose (без аллокаций). */
  private roundPose(slot: DetailSlot): Pose {
    const { pose } = this;
    pose.x = roundTo(slot.x, PX_STEP);
    pose.y = roundTo(slot.y, PX_STEP);
    pose.widthPx = roundTo(slot.widthPx, PX_STEP);
    pose.depthScale = roundTo(slot.depthScale, SCALE_STEP);
    return pose;
  }

  private syncTransform(entry: Entry, pose: Pose): void {
    const { written } = entry;
    const isSame =
      pose.x === written.x &&
      pose.y === written.y &&
      pose.widthPx === written.widthPx &&
      pose.depthScale === written.depthScale;
    if (isSame) return;
    entry.element.style.transform = formatTransform(entry, pose);
  }

  private write(entry: Entry, opacity: number): void {
    const { element, written } = entry;
    const pose = this.roundPose(entry.slot);
    const alpha = roundTo(opacity, VALUE_STEP);
    if (!written.isVisible) element.style.visibility = 'visible';
    this.syncTransform(entry, pose);
    if (pose.widthPx !== written.widthPx) element.style.width = `${pose.widthPx}px`;
    if (alpha !== written.opacity) element.style.opacity = String(alpha);
    written.x = pose.x;
    written.y = pose.y;
    written.widthPx = pose.widthPx;
    written.depthScale = pose.depthScale;
    written.opacity = alpha;
    written.isVisible = true;
  }
}
