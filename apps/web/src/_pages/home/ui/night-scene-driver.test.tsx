import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { stop, startNightScene } = vi.hoisted(() => {
  const stopScene = vi.fn();
  return { stop: stopScene, startNightScene: vi.fn(() => stopScene) };
});
// Код сцены (WebGL) в jsdom не запускается — подменяется отдельный чанк.
vi.mock('../lib/night/scene', () => ({ startNightScene }));

import { findNightElements, NightSceneDriver } from './night-scene-driver';

const SCENE_HTML = `
  <div data-night-stage>
    <canvas data-night-canvas></canvas>
    <p data-night-phrase>раз</p>
    <p data-night-phrase>два</p>
    <p data-night-epilogue>конец</p>
  </div>`;

function mountRoot(html: string): HTMLElement {
  const root = document.createElement('section');
  root.id = 'night';
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('findNightElements', () => {
  it('возвращает null, если корня нет', () => {
    expect(findNightElements(null)).toBeNull();
  });

  it('возвращает null, если нет канваса', () => {
    const root = mountRoot('<div data-night-stage></div><p data-night-epilogue></p>');
    expect(findNightElements(root)).toBeNull();
  });

  it('находит сцену, канвас, эпилог и все фразы по порядку', () => {
    const root = mountRoot(SCENE_HTML);

    const elements = findNightElements(root);

    expect(elements?.root).toBe(root);
    expect(elements?.canvas.tagName).toBe('CANVAS');
    expect(elements?.epilogue.textContent).toBe('конец');
    expect(elements?.phrases.map((p) => p.textContent)).toEqual(['раз', 'два']);
  });
});

describe('NightSceneDriver', () => {
  it('ничего не рисует и не падает, если корневого элемента нет', () => {
    const { container } = render(<NightSceneDriver rootId="missing" />);

    expect(container.innerHTML).toBe('');
    expect(startNightScene).not.toHaveBeenCalled();
  });

  it('запускает сцену и останавливает её при размонтировании', async () => {
    mountRoot(SCENE_HTML);

    const { unmount } = render(<NightSceneDriver rootId="night" />);
    await vi.waitFor(() => expect(startNightScene).toHaveBeenCalledTimes(1));
    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
