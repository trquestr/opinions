'use client';

import { useEffect } from 'react';
import type { NightElements } from '../lib/night/scene';

/** Находит разметку сцены (night-scene.tsx) по data-атрибутам; без неё — null. */
export function findNightElements(root: HTMLElement | null): NightElements | null {
  const stage = root?.querySelector<HTMLElement>('[data-night-stage]');
  const canvas = root?.querySelector<HTMLCanvasElement>('canvas[data-night-canvas]');
  const epilogue = root?.querySelector<HTMLElement>('[data-night-epilogue]');
  if (!root || !stage || !canvas || !epilogue) return null;
  return {
    root,
    stage,
    canvas,
    epilogue,
    details: [...root.querySelectorAll<HTMLImageElement>('img[data-night-detail]')],
    phrases: [...root.querySelectorAll<HTMLElement>('[data-night-phrase]')],
  };
}

/*
 * Поднимает ночную сцену после гидрации. Код сцены (WebGL, шейдеры) грузится отдельным чанком, чтобы не утяжелять
 * первый экран. Синхронизация с внешней системой (DOM, WebGL, события окна) — ровно то, для чего нужен эффект.
 */
export function NightSceneDriver({ rootId }: { readonly rootId: string }) {
  useEffect(() => {
    const elements = findNightElements(document.getElementById(rootId));
    if (!elements) return;
    let stop: (() => void) | null = null;
    let isCancelled = false;
    import('../lib/night/scene')
      .then(({ startNightScene }) => {
        if (!isCancelled) stop = startNightScene(elements);
      })
      .catch((error: unknown) => console.error('Ночная сцена не запустилась', error));
    return () => {
      isCancelled = true;
      stop?.();
    };
  }, [rootId]);
  return null;
}
