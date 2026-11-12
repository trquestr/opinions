import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudsScene, startCloudsScene, type CloudsElements } from './scene';
import { createDuskVeil, VEIL_FALLBACK_COLOR, type DuskVeil } from './dusk-veil';
import { VEIL_END, VEIL_START } from './timeline';

// По умолчанию вуаль настоящая (в jsdom нет WebGL, значит вернёт null); отдельные тесты подменяют её на заглушку.
vi.mock('./dusk-veil', async (importOriginal) => {
  const original = await importOriginal<{ createDuskVeil: typeof createDuskVeil }>();
  return { ...original, createDuskVeil: vi.fn(original.createDuskVeil) };
});

function createMockElements(): CloudsElements {
  const root = document.createElement('section');
  const stage = document.createElement('div');
  const canvasBack = document.createElement('canvas');
  const canvasFront = document.createElement('canvas');
  const veil = document.createElement('canvas');
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
  stage.appendChild(veil);
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
    veil,
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
    // Активная фраза помечена для проявления букв, остальные — нет
    expect(elements.phrases[2]?.dataset.shown).toBe('true');
    expect(elements.phrases[0]?.dataset.shown).toBe('false');

    stop();
  });

  it('передаёт зум слова в WebGL-хук, если он уже зарегистрирован', () => {
    const setZoom = vi.fn();
    window.__setWordmarkCameraZoom = setZoom;
    const stop = startCloudsScene(elements);

    expect(setZoom).toHaveBeenCalled();
    stop();
    delete window.__setWordmarkCameraZoom;
  });

  it('реагирует на скролл страницы и на смену размера окна без ошибок', () => {
    const stop = startCloudsScene(elements);

    window.scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    expect(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    }).not.toThrow();

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    stop();
  });

  it('отслеживает перемещение курсора', () => {
    const scene = new CloudsScene(elements);
    const stop = scene.start();

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 300 }));
    document.dispatchEvent(new Event('mouseleave'));

    stop();
  });

  describe('вуаль сумерек', () => {
    /** Ставит скролл на u экранов сцены и прокручивает один кадр анимации. */
    function scrollToScreens(u: number): void {
      vi.spyOn(elements.root, 'getBoundingClientRect').mockReturnValue({
        top: -window.innerHeight * u,
        bottom: window.innerHeight * (3 - u),
        left: 0,
        right: window.innerWidth,
        width: window.innerWidth,
        height: window.innerHeight * 3,
        x: 0,
        y: -window.innerHeight * u,
        toJSON: () => ({}),
      });
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(16);
    }

    function createFakeVeil(): DuskVeil {
      return { resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('без WebGL закрашивает холст вуали запасным цветом', () => {
      const stop = startCloudsScene(elements);

      expect(elements.veil?.style.backgroundColor).toBe('rgb(244, 244, 242)');
      expect(VEIL_FALLBACK_COLOR).toBe('rgb(244, 244, 242)');
      stop();
    });

    it('до VEIL_START вуаль скрыта', () => {
      const stop = startCloudsScene(elements);

      scrollToScreens(VEIL_START - 0.1);

      expect(elements.veil?.style.visibility).toBe('hidden');
      stop();
    });

    it('в запасном режиме во время вуали холст виден и проявляется по ходу вуали', () => {
      const stop = startCloudsScene(elements);

      scrollToScreens((VEIL_START + VEIL_END) / 2);

      expect(elements.veil?.style.visibility).toBe('visible');
      expect(elements.veil?.style.opacity).toBe('0.5');
      stop();
    });

    it('после окончания вуали запасный холст полностью непрозрачен', () => {
      const stop = startCloudsScene(elements);

      scrollToScreens(VEIL_END + 0.05);

      expect(elements.veil?.style.opacity).toBe('1');
      stop();
    });

    it('при возврате вверх вуаль снова скрывается', () => {
      const stop = startCloudsScene(elements);
      scrollToScreens(VEIL_END);

      scrollToScreens(1);

      expect(elements.veil?.style.visibility).toBe('hidden');
      stop();
    });

    it('за пределами сцены вуаль скрыта, даже если ход вуали ненулевой', () => {
      const stop = startCloudsScene(elements);

      scrollToScreens(-1);

      expect(elements.veil?.style.visibility).toBe('hidden');
      stop();
    });

    it('с рабочей вуалью рисует её шейдером и не красит холст запасным цветом', () => {
      const veil = createFakeVeil();
      vi.mocked(createDuskVeil).mockReturnValueOnce(veil);
      const stop = startCloudsScene(elements);

      scrollToScreens((VEIL_START + VEIL_END) / 2);

      expect(veil.render).toHaveBeenCalled();
      expect(veil.resize).toHaveBeenCalled();
      expect(elements.veil?.style.backgroundColor).toBe('');
      stop();
      expect(veil.dispose).toHaveBeenCalledTimes(1);
    });

    it('при prefers-reduced-motion вуаль получает нулевое время', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })),
      );
      const veil = createFakeVeil();
      vi.mocked(createDuskVeil).mockReturnValueOnce(veil);
      const stop = startCloudsScene(elements);

      scrollToScreens((VEIL_START + VEIL_END) / 2);

      expect(veil.render).toHaveBeenLastCalledWith(expect.closeTo(0.5, 5), 0);
      stop();
    });

    it('при потере контекста переходит на запасную заливку и перестаёт рисовать шейдером', () => {
      const veil = createFakeVeil();
      let onContextLost = (): void => undefined;
      vi.mocked(createDuskVeil).mockImplementationOnce((_canvas, options) => {
        onContextLost = options.onContextLost;
        return veil;
      });
      const stop = startCloudsScene(elements);
      scrollToScreens((VEIL_START + VEIL_END) / 2);
      vi.mocked(veil.render).mockClear();

      onContextLost();
      scrollToScreens((VEIL_START + VEIL_END) / 2 + 0.1);

      expect(elements.veil?.style.backgroundColor).toBe('rgb(244, 244, 242)');
      expect(veil.render).not.toHaveBeenCalled();
      expect(elements.veil?.style.opacity).not.toBe('');
      stop();
    });

    it('работает без холста вуали в разметке', () => {
      const withoutVeil: CloudsElements = { ...elements, veil: null };
      const stop = startCloudsScene(withoutVeil);

      expect(() => scrollToScreens(VEIL_END)).not.toThrow();
      stop();
    });
  });
});
