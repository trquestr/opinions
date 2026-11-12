'use client';

import { useEffect } from 'react';
import type { CloudsElements } from '../lib/clouds/scene';

/** Находит разметку сцены «Облака» (clouds-scene.tsx) по data-атрибутам; без неё — null. */
export function findCloudsElements(root: HTMLElement | null): CloudsElements | null {
  if (!root) return null;
  const stage = root.querySelector<HTMLElement>('[data-clouds-stage]');
  const canvasBack = root.querySelector<HTMLCanvasElement>('canvas[data-clouds-canvas-back]');
  const canvasFront = root.querySelector<HTMLCanvasElement>('canvas[data-clouds-canvas-front]');
  const canvas = canvasFront ?? root.querySelector<HTMLCanvasElement>('canvas[data-clouds-canvas]');
  if (!stage || !canvas) return null;

  return {
    root,
    stage,
    canvas,
    canvasBack,
    canvasFront,
    cloudItems: [...root.querySelectorAll<HTMLElement>('[data-cloud-id]')],
    phrases: [...root.querySelectorAll<HTMLElement>('[data-clouds-phrase]')],
    glCanvas: document.getElementById('gl-canvas'),
    wordmark: document.querySelector<HTMLElement>('.wordmark'),
    hero: document.querySelector<HTMLElement>('.hero'),
  };
}

/**
 * Поднимает сцену «Облака» после гидрации. Код сцены (3D-пролёт, влёт в чашу U)
 * грузится отдельным чанком через динамический импорт.
 */
export function CloudsSceneDriver({ rootId }: { readonly rootId: string }) {
  useEffect(() => {
    const elements = findCloudsElements(document.getElementById(rootId));
    if (!elements) return;
    let stop: (() => void) | null = null;
    let isCancelled = false;
    import('../lib/clouds/scene')
      .then(({ startCloudsScene }) => {
        if (!isCancelled) stop = startCloudsScene(elements);
      })
      .catch((error: unknown) => console.error('Сцена «Облака» не запустилась', error));
    return () => {
      isCancelled = true;
      stop?.();
    };
  }, [rootId]);
  return null;
}
