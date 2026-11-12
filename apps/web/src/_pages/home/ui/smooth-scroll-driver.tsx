'use client';

import { useEffect } from 'react';
import { startSmoothScroll } from '../lib/smooth-scroll';
import { CLOUDS_STOPS, NIGHT_STOPS, pageStops, type StopSection } from '../model/scroll-stops';

function sectionStops(id: string, stops: readonly number[]): StopSection[] {
  const element = document.getElementById(id);
  if (!element) return [];
  return [{ topPx: element.getBoundingClientRect().top + window.scrollY, stops }];
}

/** Читает раскладку страницы в момент вызова: высота окна и секции могут меняться. */
export function readPageStops(): number[] {
  const viewportHeightPx = window.innerHeight;
  return pageStops({
    sections: [...sectionStops('clouds', CLOUDS_STOPS), ...sectionStops('night', NIGHT_STOPS)],
    viewportHeightPx,
    maxScrollPx: Math.max(0, document.documentElement.scrollHeight - viewportHeightPx),
  });
}

/**
 * Включает ступенчатый скролл колёсиком на клиенте после гидрации.
 */
export function SmoothScrollDriver() {
  useEffect(() => {
    return startSmoothScroll({ getStops: readPageStops });
  }, []);

  return null;
}
