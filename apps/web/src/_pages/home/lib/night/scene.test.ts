import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NIGHT_EPILOGUE, NIGHT_PHRASES } from '../../model/night-script';
import { Camera, figureBounds } from './camera';
import manifest from './night-manifest.json';
import { Projector } from './projection';
import { Cursor } from './cursor';
import { CursorField } from './cursor-field';
import { FINISH_IDLE_MS } from './drawing';
import { InkGrid } from './ink-grid';
import { InkSimulation } from './ink-sim';
import { startNightScene } from './scene';
import { STAR_STRIDE } from './stars';
import type { NightElements } from './scene';

const mocks = vi.hoisted(() => ({
  createNightRenderer: vi.fn(),
  loadFigures: vi.fn(),
}));

// Настоящий createInputState нужен сцене; WebGL-рендерер подменяется.
vi.mock('./renderer', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  createNightRenderer: mocks.createNightRenderer,
}));
vi.mock('./ink', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  loadFigures: mocks.loadFigures,
}));

const VIEW = { width: 1000, height: 800 };
/** Звёзд для рисования (ковш и тусклые) — последние строки таблицы звёзд. */
const DRAWABLE_COUNT = 14;
const EPILOGUE_DELAY_MS = 900;

let top = 0;
let frameQueue: FrameRequestCallback[] = [];
let observerCallback: IntersectionObserverCallback | null = null;
let stop: (() => void) | null = null;

function createRendererSpy() {
  return { resize: vi.fn(), uploadStars: vi.fn(), uploadInk: vi.fn(), uploadCursor: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}

function buildElements(): NightElements {
  const root = document.createElement('section');
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const phrases = NIGHT_PHRASES.map((phrase) => {
    const element = Object.assign(document.createElement('p'), { textContent: phrase.text });
    if (phrase.side) element.dataset.side = phrase.side;
    return element;
  });
  const epilogue = Object.assign(document.createElement('p'), { textContent: NIGHT_EPILOGUE });
  stage.append(canvas, ...phrases, epilogue);
  root.append(stage);
  document.body.append(root);
  vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => ({ top }) as DOMRect);
  return { root, stage, canvas, phrases, epilogue };
}

/** Ставит прокрутку так, чтобы сцена прошла u экранов, и шлёт scroll. */
function scrollTo(u: number): void {
  top = -u * VIEW.height;
  window.dispatchEvent(new Event('scroll'));
}

function flushFrames(): void {
  const queue = frameQueue;
  frameQueue = [];
  queue.forEach((callback) => callback(1000));
}

function flushAt(nowMs: number): void {
  const queue = frameQueue;
  frameQueue = [];
  queue.forEach((callback) => callback(nowMs));
}

/** matchMedia: совпадают только запросы, в тексте которых есть одна из подстрок. */
function stubMedia(...matching: string[]): void {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: matching.some((part) => query.includes(part)) })));
}

/** Экранное положение звезды для рисования: берём из живой таблицы звёзд, которую сцена отдала рендереру. */
function starPoint(index: number): { x: number; y: number } {
  const table: Float32Array = mocks.createNightRenderer.mock.calls.at(-1)?.[1].stars;
  const at = (table.length / STAR_STRIDE - DRAWABLE_COUNT + index) * STAR_STRIDE;
  return { x: table[at] ?? 0, y: table[at + 1] ?? 0 };
}

function pressStar(elements: NightElements, index: number): void {
  const point = starPoint(index);
  elements.stage.dispatchEvent(new MouseEvent('pointerdown', { clientX: point.x, clientY: point.y, bubbles: true }));
}

function start(elements: NightElements) {
  stop = startNightScene(elements);
}

let spy = createRendererSpy();
const spyOnSetState = () => vi.spyOn(InkSimulation.prototype, 'setState');
const spyOnStep = () => vi.spyOn(InkSimulation.prototype, 'step');
const spyOnSetPose = () => vi.spyOn(Projector.prototype, 'setPose');
let setPose: ReturnType<typeof spyOnSetPose>;
let setState: ReturnType<typeof spyOnSetState>;
let stepSpy: ReturnType<typeof spyOnStep>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  top = VIEW.height; // u = -1: сцена ещё не началась
  frameQueue = [];
  observerCallback = null;
  spy = createRendererSpy();
  setState = spyOnSetState();
  setPose = spyOnSetPose();
  stepSpy = spyOnStep();
  mocks.createNightRenderer.mockReturnValue(spy);
  mocks.loadFigures.mockResolvedValue([new Int16Array(3), new Int16Array(6), new Int16Array(9), new Int16Array(12)]);
  vi.stubGlobal('innerWidth', VIEW.width);
  vi.stubGlobal('innerHeight', VIEW.height);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frameQueue.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frameQueue = [];
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('startNightScene: DOM по скроллу', () => {
  it('до начала сцены сцена скрыта', () => {
    const elements = buildElements();

    start(elements);

    expect(elements.stage.style.opacity).toBe('0');
    expect(elements.stage.style.visibility).toBe('hidden');
  });

  it('при прокрутке сцена проявляется', () => {
    const elements = buildElements();
    start(elements);

    scrollTo(0.5);

    expect(elements.stage.style.opacity).toBe('1');
    expect(elements.stage.style.visibility).toBe('visible');
  });

  it('видна только активная фраза', () => {
    const elements = buildElements();
    start(elements);

    scrollTo(0.5);

    expect(elements.phrases.map((phrase) => phrase.style.opacity)).toEqual(['1', '0', '0', '0', '0', '0', '0', '0', '0']);
  });

  it('после скролла рисует кадр', () => {
    const elements = buildElements();
    start(elements);

    scrollTo(0.5);
    flushFrames();

    expect(spy.render).toHaveBeenCalledTimes(1);
  });

  it('в кадре считает тушь, загружает сетку в текстуру и рисует', () => {
    const elements = buildElements();
    start(elements);

    scrollTo(0.5);
    flushFrames();

    expect(stepSpy).toHaveBeenCalledTimes(1);
    expect(spy.uploadInk).toHaveBeenCalledWith(expect.any(InkGrid));
  });

  it('цель туши следует за скроллом: на 1,0 экрана это медведица, без прямого перехода', () => {
    start(buildElements());

    scrollTo(1);
    flushFrames();

    expect(stepSpy.mock.calls.at(-1)?.[0]).toMatchObject({ target: 1, isDirect: false });
  });

  it('время звёзд идёт вместе с кадрами', () => {
    start(buildElements());

    scrollTo(0.5);
    flushFrames();

    expect(spy.render.mock.calls[0]?.[0]).toMatchObject({ starTimeSeconds: 1 });
  });

  it('при prefers-reduced-motion время звёзд стоит на нуле', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })));
    start(buildElements());

    scrollTo(0.5);
    flushFrames();

    expect(spy.render.mock.calls[0]?.[0]).toMatchObject({ starTimeSeconds: 0 });
  });

  it('снос роя идёт в сторону новой фигуры: к левой фигуре −1, к правой +1', () => {
    start(buildElements());

    scrollTo(1.2);
    flushFrames();
    const left = stepSpy.mock.calls.at(-1)?.[0].sweep;
    scrollTo(2);
    flushFrames();
    const right = stepSpy.mock.calls.at(-1)?.[0].sweep;

    expect(left).toBe(-1);
    expect(right).toBe(1);
  });

  it('пока сцена на экране, просит следующий кадр сама', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(0.5);

    flushFrames();

    expect(frameQueue).toHaveLength(1);
  });

  it('при prefers-reduced-motion после кадра покой: следующий кадр не просит', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })));
    const elements = buildElements();
    start(elements);
    scrollTo(0.5);

    flushFrames();

    expect(spy.render).toHaveBeenCalledTimes(1);
    expect(frameQueue).toHaveLength(0);
  });

  it('пока сцена не началась, кадр не рисует', () => {
    const elements = buildElements();
    start(elements);

    flushFrames();

    expect(spy.render).not.toHaveBeenCalled();
  });

  it('при изменении размера окна перекладывает рендерер', () => {
    const elements = buildElements();
    start(elements);

    window.dispatchEvent(new Event('resize'));

    expect(spy.resize.mock.calls.at(-1)?.[0]).toEqual(VIEW);
  });

  it('клики принимает только в Н9', () => {
    const elements = buildElements();
    start(elements);

    scrollTo(5.3);
    const before = elements.stage.style.pointerEvents;
    scrollTo(5.5);

    expect(before).toBe('none');
    expect(elements.stage.style.pointerEvents).toBe('auto');
  });
});

describe('startNightScene: загрузка фигур', () => {
  it('дымка загружается сразу как состояние 0', () => {
    start(buildElements());

    expect(setState).toHaveBeenCalledWith(0, expect.any(Int16Array));
  });

  it('фигуры грузятся, когда сцена приближается, и уходят в состояния 1…4', async () => {
    start(buildElements());

    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(0);

    expect([1, 2, 3, 4].map((index) => setState.mock.calls.some((args) => args[0] === index))).toEqual([true, true, true, true]);
  });

  it('пока сцена далеко, фигуры не грузятся', () => {
    start(buildElements());

    observerCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(mocks.loadFigures).not.toHaveBeenCalled();
  });

  it('ошибку загрузки пишет в консоль, сцена остаётся в дымке', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.loadFigures.mockRejectedValue(new Error('404'));
    start(buildElements());

    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(0);

    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('startNightScene: рисование в Н9', () => {
  it('наведение на звезду передаёт её положение симуляции туши', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(0.5);
    const point = starPoint(0);

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: point.x, clientY: point.y }));
    flushFrames();

    expect(stepSpy.mock.calls[0]?.[0].hover).toEqual({ x: 1, y: 0 });
  });

  it('два нажатия на звёзды создают линию, и через паузу тушь обводит её', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);

    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(setState).toHaveBeenCalledWith(5, expect.any(Int16Array));
  });

  it('одно нажатие линии не создаёт', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);

    pressStar(elements, 0);
    vi.advanceTimersByTime(FINISH_IDLE_MS * 2);

    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });

  it('нажатие мимо звёзд отпускает линию', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);

    pressStar(elements, 0);
    elements.stage.dispatchEvent(new MouseEvent('pointerdown', { clientX: 1, clientY: 1, bubbles: true }));
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });

  it('щелчок вне Н9 пускает волну по туши и ничего не рисует', () => {
    const click = vi.spyOn(Cursor.prototype, 'click');
    const elements = buildElements();
    start(elements);
    scrollTo(1);

    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(click).toHaveBeenCalledTimes(2);
    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });

  it('при prefers-reduced-motion волну не пускает', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })));
    const click = vi.spyOn(Cursor.prototype, 'click');
    const elements = buildElements();
    start(elements);
    scrollTo(1);

    pressStar(elements, 0);

    expect(click).not.toHaveBeenCalled();
  });

  it('щелчок пускает волну в поле курсора', () => {
    const click = vi.spyOn(CursorField.prototype, 'click');
    const elements = buildElements();
    start(elements);
    scrollTo(1);

    pressStar(elements, 0);

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('при prefers-reduced-motion поле курсора щелчок не получает', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })));
    const click = vi.spyOn(CursorField.prototype, 'click');
    const elements = buildElements();
    start(elements);
    scrollTo(1);

    pressStar(elements, 0);

    expect(click).not.toHaveBeenCalled();
  });

  it('движение мыши передаётся курсору, касание — нет', () => {
    const move = vi.spyOn(Cursor.prototype, 'move');
    start(buildElements());
    scrollTo(0.5);

    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 40, clientY: 50 }), { pointerType: 'mouse' }));
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 60, clientY: 70 }), { pointerType: 'touch' }));

    expect(move).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledWith(40, 50);
  });

  it('в кадре отдаёт рендереру капли курсора', () => {
    start(buildElements());

    scrollTo(0.5);
    flushFrames();

    expect(spy.uploadCursor).toHaveBeenCalledWith(expect.any(CursorField));
  });

  it('при изменении размера окна пересобирает поле курсора', () => {
    const build = vi.spyOn(CursorField.prototype, 'build');
    start(buildElements());

    window.dispatchEvent(new Event('resize'));

    expect(build).toHaveBeenLastCalledWith(VIEW);
  });

  it('пока сцена не началась, щелчок волну не пускает', () => {
    const click = vi.spyOn(Cursor.prototype, 'click');
    const elements = buildElements();
    start(elements);

    pressStar(elements, 0);

    expect(click).not.toHaveBeenCalled();
  });

  it('уход мыши с окна снимает влияние курсора', () => {
    const leave = vi.spyOn(Cursor.prototype, 'leave');
    start(buildElements());

    document.dispatchEvent(new Event('mouseleave'));
    window.dispatchEvent(new Event('blur'));

    expect(leave).toHaveBeenCalledTimes(2);
  });

  it('мышь в Н9: нажатие на звезду мышью использует радиус мыши и рисует линию', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    const press = (index: number) => {
      const point = starPoint(index);
      const event = Object.assign(new MouseEvent('pointerdown', { clientX: point.x, clientY: point.y, bubbles: true }), {
        pointerType: 'mouse',
      });
      elements.stage.dispatchEvent(event);
    };

    press(0);
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 500, clientY: 400 }), { pointerType: 'mouse' }));
    press(1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(setState).toHaveBeenCalledWith(5, expect.any(Int16Array));
  });

  it('после завершения фигуры тушь плывёт к линиям зрителя, пока кадры просят следующий', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    flushFrames();

    expect(stepSpy.mock.calls.at(-1)?.[0]).toMatchObject({ target: 5, isDirect: true });
    expect(frameQueue).toHaveLength(1);
  });

  it('вне Н9 нажатия игнорируются', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(1);

    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });

  it('после завершения через 900 мс проступает эпилог, а приглашение гаснет', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);

    vi.advanceTimersByTime(FINISH_IDLE_MS);
    const before = elements.epilogue.style.opacity;
    vi.advanceTimersByTime(EPILOGUE_DELAY_MS);

    expect(before).toBe('0');
    expect(elements.epilogue.style.opacity).toBe('1');
    expect(elements.phrases.at(-1)?.style.opacity).toBe('0');
  });

  it('прокрутка выше Н9 прячет эпилог', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS + EPILOGUE_DELAY_MS);

    scrollTo(5.0);

    expect(elements.epilogue.style.opacity).toBe('0');
  });

  it('прокрутка до конца сцены завершает рисование без ожидания паузы', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);

    scrollTo(6.6);

    expect(setState).toHaveBeenCalledWith(5, expect.any(Int16Array));
  });

  it('повторное завершение фигуры при скролле до конца ничего не меняет', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    scrollTo(6.6);

    expect(setState.mock.calls.filter((args) => args[0] === 5)).toHaveLength(1);
  });

  it('прокрутка до конца без линий ничего не завершает', () => {
    start(buildElements());

    scrollTo(6.6);

    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });
});

describe('startNightScene: сбои и остановка', () => {
  it('без рендерера прячет канвас и не падает', () => {
    mocks.createNightRenderer.mockReturnValue(null);
    const elements = buildElements();

    start(elements);

    expect(() => scrollTo(0.5)).not.toThrow();
    expect(elements.canvas.hidden).toBe(true);
    expect(elements.phrases[0]?.style.opacity).toBe('1');
  });

  it('потеря контекста прячет канвас и отменяет событие', () => {
    const elements = buildElements();
    start(elements);
    const event = new Event('webglcontextlost', { cancelable: true });

    elements.canvas.dispatchEvent(event);

    expect(elements.canvas.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('после потери контекста кадры больше не рисуются', () => {
    const elements = buildElements();
    start(elements);
    elements.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

    scrollTo(0.5);
    flushFrames();

    expect(spy.render).not.toHaveBeenCalled();
  });

  it('остановка освобождает рендерер', () => {
    start(buildElements());

    stop?.();
    stop = null;

    expect(spy.dispose).toHaveBeenCalledTimes(1);
  });

  it('после остановки скролл ничего не меняет', () => {
    const elements = buildElements();
    start(elements);

    stop?.();
    stop = null;
    scrollTo(0.5);

    expect(elements.stage.style.opacity).toBe('0');
  });

  it('остановка отменяет таймер завершения рисования', () => {
    const elements = buildElements();
    start(elements);
    scrollTo(5.5);
    pressStar(elements, 0);
    pressStar(elements, 1);

    stop?.();
    stop = null;
    vi.advanceTimersByTime(FINISH_IDLE_MS);

    expect(setState).not.toHaveBeenCalledWith(5, expect.anything());
  });
});

describe('startNightScene: камера', () => {
  /** Центр рамки медведицы по x, единицы ковша (из манифеста). */
  const bounds = figureBounds(1);
  const FIGURE_1_CENTER_X = ((bounds?.minX ?? 0) + (bounds?.maxX ?? 0)) / 2;

  function lastPose() {
    const call = setPose.mock.calls.at(-1);
    if (!call) throw new Error('setPose не вызывался');
    return call[0];
  }

  it('на широком экране камера приезжает к медведице: цель — центр рамки, опора на 0,34·W, камера повёрнута к фигуре слева', () => {
    stubMedia('min-aspect-ratio');
    start(buildElements());
    scrollTo(1.2);

    flushAt(1000);
    flushAt(1000 + 3200);

    expect(lastPose().targetX).toBeCloseTo(FIGURE_1_CENTER_X, 5);
    expect(lastPose().anchorX).toBeCloseTo(340, 3);
    expect(lastPose().yaw).toBeGreaterThan(0);
    expect(lastPose().pitch).toBe(0);
  });

  it('на узком экране камера остаётся в общем плане: качается не больше 5° и 2°, опора в центре', () => {
    stubMedia();
    start(buildElements());
    scrollTo(1.2);

    flushAt(1000);
    flushAt(1000 + 3200);

    expect(Math.abs(lastPose().yaw)).toBeLessThanOrEqual((5 * Math.PI) / 180 + 1e-9);
    expect(Math.abs(lastPose().pitch)).toBeLessThanOrEqual((2 * Math.PI) / 180 + 1e-9);
    expect(lastPose().anchorX).toBe(500);
    expect(lastPose().anchorY).toBe(400);
  });

  it('в кадре отдаёт рендереру таблицу звёзд', () => {
    start(buildElements());

    scrollTo(0.5);
    flushFrames();

    expect(spy.uploadStars).toHaveBeenCalledWith(expect.any(Float32Array));
  });

  it('боковая фраза на широком экране гаснет при смене фигуры и проступает, когда камера доехала', () => {
    stubMedia('min-aspect-ratio');
    const elements = buildElements();
    start(elements);
    scrollTo(1.2);

    flushAt(1000);
    const atStart = elements.phrases[1]?.style.opacity;
    flushAt(1000 + 3200);

    expect(atStart).toBe('0');
    expect(elements.phrases[1]?.style.opacity).toBe('1');
  });

  it('на узком экране боковая фраза не зависит от камеры', () => {
    stubMedia();
    const elements = buildElements();
    start(elements);
    scrollTo(1.2);

    flushAt(1000);

    expect(elements.phrases[1]?.style.opacity).toBe('1');
  });

  it('без анимации камера встаёт сразу, и фраза не ждёт хода', () => {
    stubMedia('min-aspect-ratio', 'prefers-reduced-motion');
    const elements = buildElements();
    start(elements);
    scrollTo(1.2);

    flushAt(1000);

    expect(lastPose().anchorX).toBeCloseTo(340, 3);
    expect(lastPose().yaw).toBeGreaterThan(0);
    expect(elements.phrases[1]?.style.opacity).toBe('1');
  });
});

describe('startNightScene: курсор и экран', () => {
  it('движение мыши до начала сцены курсору не передаётся', () => {
    const move = vi.spyOn(Cursor.prototype, 'move');
    start(buildElements());

    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: 40, clientY: 50 }), { pointerType: 'mouse' }));

    expect(move).not.toHaveBeenCalled();
  });

  it('на телефоне грузит файл с меньшим числом капель, на десктопе — с большим', async () => {
    stubMedia('max-width');
    start(buildElements());
    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(0);
    const phoneCount = mocks.loadFigures.mock.calls[0]?.[0];

    expect(phoneCount).toBe(manifest.counts[1]);
  });

  it('на десктопе грузит файл с полным числом капель', async () => {
    stubMedia();
    start(buildElements());
    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.loadFigures.mock.calls[0]?.[0]).toBe(manifest.counts[0]);
  });
});

describe('startNightScene: взгляд за курсором', () => {
  const DEGREE = Math.PI / 180;

  function mouseMove(x: number, y: number, pointerType = 'mouse'): void {
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: x, clientY: y }), { pointerType }));
  }

  /** Серия кадров с шагом 50 мс — взгляд успевает догнать цель. */
  function runFrames(count: number): void {
    Array.from({ length: count }, (_, k) => k).forEach((k) => flushAt(1000 + 50 * k));
  }

  function lastLook(setLook: ReturnType<typeof vi.spyOn>): { yaw: number; pitch: number } {
    const call = setLook.mock.calls.at(-1);
    if (!call) throw new Error('setLook не вызывался');
    return { yaw: call[0], pitch: call[1] };
  }

  it.each([
    { edge: 'правому', x: 1000, sign: -1 },
    { edge: 'левому', x: 0, sign: 1 },
  ])('мышь у $edge краю поворачивает камеру: знак рыскания $sign', ({ x, sign }) => {
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(0.5);

    mouseMove(x, 400);
    runFrames(40);

    expect(Math.sign(lastLook(setLook).yaw)).toBe(sign);
    expect(Math.abs(lastLook(setLook).yaw)).toBeCloseTo(3 * DEGREE, 3);
  });

  it.each([
    ['верху', 0, 1],
    ['низу', 800, -1],
  ])('мышь у %s экрана наклоняет камеру: знак наклона %s', (_, y, sign) => {
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(0.5);

    mouseMove(500, y);
    runFrames(40);

    expect(Math.sign(lastLook(setLook).pitch)).toBe(sign);
  });

  it('в Н9 (u ≥ 5,6) взгляд за курсором выключен', () => {
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(5.8);

    mouseMove(1000, 400);
    runFrames(40);

    expect(lastLook(setLook).yaw).toBeCloseTo(0, 6);
  });

  it('при prefers-reduced-motion взгляд за курсором выключен', () => {
    stubMedia('prefers-reduced-motion');
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(0.5);

    mouseMove(1000, 400);
    runFrames(10);

    expect(lastLook(setLook).yaw).toBeCloseTo(0, 6);
  });

  it('касание взгляд не двигает', () => {
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(0.5);

    mouseMove(1000, 400, 'touch');
    runFrames(10);

    expect(lastLook(setLook).yaw).toBeCloseTo(0, 6);
  });

  it('когда мышь уходит с окна, взгляд возвращается в ноль', () => {
    const setLook = vi.spyOn(Camera.prototype, 'setLook');
    start(buildElements());
    scrollTo(0.5);
    mouseMove(1000, 400);
    runFrames(40);

    document.dispatchEvent(new Event('mouseleave'));
    runFrames(80);

    expect(Math.abs(lastLook(setLook).yaw)).toBeLessThan(0.01 * DEGREE);
  });
});

describe('startNightScene: объём фигур по ракурсу героя', () => {
  const DEGREE = Math.PI / 180;

  async function loadFigures(): Promise<void> {
    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(0);
  }

  function yawOf(setStateSpy: typeof setState, state: number): number | undefined {
    return setStateSpy.mock.calls.find((args) => args[0] === state)?.[2];
  }

  it('на широком экране фигуры получают ракурс ±20°: слева плюс, справа минус', async () => {
    stubMedia('min-aspect-ratio');
    start(buildElements());

    await loadFigures();

    expect(yawOf(setState, 1)).toBeCloseTo(20 * DEGREE, 8);
    expect(yawOf(setState, 2)).toBeCloseTo(-20 * DEGREE, 8);
    expect(yawOf(setState, 3)).toBeCloseTo(20 * DEGREE, 8);
    expect(yawOf(setState, 4)).toBeCloseTo(-20 * DEGREE, 8);
  });

  it('на узком экране ракурс героя нулевой', async () => {
    stubMedia();
    start(buildElements());

    await loadFigures();

    expect([1, 2, 3, 4].map((state) => yawOf(setState, state))).toEqual([0, 0, 0, 0]);
  });

  it('когда раскладка с боковым текстом переключается при ресайзе, состояния задаются заново', async () => {
    let isWide = true;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return query.includes('min-aspect-ratio') && isWide;
        },
      })),
    );
    start(buildElements());
    await loadFigures();
    setState.mockClear();

    isWide = false;
    window.dispatchEvent(new Event('resize'));

    expect([1, 2, 3, 4].map((state) => yawOf(setState, state))).toEqual([0, 0, 0, 0]);
  });

  it('если раскладка не изменилась, состояния при ресайзе не пересчитываются', async () => {
    stubMedia('min-aspect-ratio');
    start(buildElements());
    await loadFigures();
    setState.mockClear();

    window.dispatchEvent(new Event('resize'));

    expect(yawOf(setState, 1)).toBeUndefined();
  });
});
