import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudsScene, startCloudsScene, type CloudsElements } from './scene';

function createMockElements(): CloudsElements {
  const root = document.createElement('section');
  const stage = document.createElement('div');
  const canvasBack = document.createElement('canvas');
  const canvasFront = document.createElement('canvas');
  const cloud1 = document.createElement('div');
  const cloud2 = document.createElement('div');
  const phrase1 = document.createElement('p');
  const phrase2 = document.createElement('p');
  const phrase3 = document.createElement('p');
  const phrase4 = document.createElement('p');
  const glCanvas = document.createElement('canvas');
  const wordmark = document.createElement('h1');
  const hero = document.createElement('main');

  root.appendChild(stage);
  stage.appendChild(canvasBack);
  stage.appendChild(cloud1);
  stage.appendChild(cloud2);
  stage.appendChild(canvasFront);
  stage.appendChild(phrase1);
  stage.appendChild(phrase2);
  stage.appendChild(phrase3);
  stage.appendChild(phrase4);
  document.body.appendChild(root);
  document.body.appendChild(glCanvas);
  document.body.appendChild(wordmark);
  document.body.appendChild(hero);

  return {
    root,
    stage,
    canvas: canvasFront,
    canvasBack,
    canvasFront,
    cloudItems: [cloud1, cloud2],
    phrases: [phrase1, phrase2, phrase3, phrase4],
    glCanvas,
    wordmark,
    hero,
  };
}

describe('CloudsScene', () => {
  let elements: CloudsElements;

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    elements = createMockElements();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id as unknown as NodeJS.Timeout);
    });
  });

  afterEach(() => {
    elements.root.remove();
    elements.glCanvas?.remove();
    elements.wordmark?.remove();
    elements.hero?.remove();
    vi.restoreAllMocks();
  });

  it('запускается и останавливается без утечек', () => {
    const stop = startCloudsScene(elements);
    expect(typeof stop).toBe('function');
    stop();
  });

  it('в О1 масштабирует слово с фокусом на букву U', () => {
    const scene = new CloudsScene(elements);
    const stop = scene.start();

    // Симулируем 0.25 экрана (О1: влёт в чашу буквы U)
    vi.spyOn(elements.root, 'getBoundingClientRect').mockReturnValue({
      top: -window.innerHeight * 0.25,
      bottom: window.innerHeight * 2.75,
      left: 0,
      right: window.innerWidth,
      width: window.innerWidth,
      height: window.innerHeight * 3,
      x: 0,
      y: -window.innerHeight * 0.25,
      toJSON: () => ({}),
    });

    window.dispatchEvent(new Event('scroll'));

    expect(window.__pendingWordmarkZoom?.scale).toBeGreaterThan(1.0);
    expect(elements.glCanvas?.style.visibility).toBe('visible');

    stop();
  });

  it('обновляет свойства DOM по скроллу', () => {
    const scene = new CloudsScene(elements);
    const stop = scene.start();

    // Симулируем положение скролла: 1.5 экрана (О4: дождь вверх, фраза 3)
    vi.spyOn(elements.root, 'getBoundingClientRect').mockReturnValue({
      top: -window.innerHeight * 1.5,
      bottom: window.innerHeight * 1.5,
      left: 0,
      right: window.innerWidth,
      width: window.innerWidth,
      height: window.innerHeight * 3,
      x: 0,
      y: -window.innerHeight * 1.5,
      toJSON: () => ({}),
    });

    window.dispatchEvent(new Event('scroll'));

    // Фраза 2 (индекс 2, "Кажется, они поднимаются снизу —") активна в 1.3..1.8
    expect(Number(elements.phrases[2]?.style.opacity)).toBeGreaterThan(0.5);

    stop();
  });

  it('отслеживает перемещение курсора', () => {
    const scene = new CloudsScene(elements);
    const stop = scene.start();

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 300 }));
    document.dispatchEvent(new Event('mouseleave'));

    stop();
  });
});
