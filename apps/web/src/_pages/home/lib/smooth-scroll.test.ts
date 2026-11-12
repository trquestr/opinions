import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextStop, startSmoothScroll, stepDurationMs } from './smooth-scroll';

const STOPS = [0, 1000, 2000, 3000];
const VIEWPORT = 1000;

let now = 0;
let scrollY = 0;
let frames: FrameRequestCallback[] = [];

function stubMedia(matching: string[] = []): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.some((m) => query.includes(m)), media: query })),
  );
}

/** Прокручивает время вперёд кадрами по 16 мс, пока анимация не закончится. */
function runFrames(maxMs = 10000): void {
  const end = now + maxMs;
  while (frames.length > 0 && now < end) {
    now += 16;
    const queue = frames;
    frames = [];
    queue.forEach((cb) => cb(now));
  }
}

function wheel(deltaY: number, init: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('nextStop', () => {
  it('возвращает ближайшую остановку вниз', () => {
    expect(nextStop([0, 500, 1000], 100, 1)).toBe(500);
  });

  it('возвращает ближайшую остановку вверх', () => {
    expect(nextStop([0, 500, 1000], 900, -1)).toBe(500);
  });

  it('пропускает остановку, на которой уже стоим (в пределах 2 px)', () => {
    expect(nextStop([0, 500, 1000], 499, 1)).toBe(1000);
    expect(nextStop([0, 500, 1000], 501, -1)).toBe(0);
  });

  it('возвращает null, когда дальше остановок нет', () => {
    expect(nextStop([0, 500], 500, 1)).toBeNull();
    expect(nextStop([0, 500], 0, -1)).toBeNull();
    expect(nextStop([], 0, 1)).toBeNull();
  });
});

describe('stepDurationMs', () => {
  it('пропорциональна пути в пределах одного экрана', () => {
    expect(stepDurationMs(1000, 1000)).toBe(2200);
  });

  it('межсценовый переход длиннее экрана замедляется', () => {
    expect(stepDurationMs(1500, 1000)).toBe(8500);
  });

  it('не короче минимума', () => {
    expect(stepDurationMs(100, 1000)).toBe(900);
  });

  it('не длиннее максимума', () => {
    expect(stepDurationMs(5000, 1000)).toBe(8500);
  });
});

describe('startSmoothScroll', () => {
  let stop: () => void;

  beforeEach(() => {
    now = 1000;
    scrollY = 0;
    frames = [];
    stubMedia();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VIEWPORT);
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frames = [];
    });
    window.scrollTo = vi.fn((_x: number | ScrollToOptions, y?: number) => {
      scrollY = y ?? 0;
    }) as typeof window.scrollTo;
    stop = startSmoothScroll({ getStops: () => STOPS });
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('один щелчок вниз доезжает ровно до следующей остановки', () => {
    const event = wheel(100);
    runFrames();
    expect(event.defaultPrevented).toBe(true);
    expect(scrollY).toBe(1000);
    expect(frames).toHaveLength(0);
  });

  it('позиция во время шага монотонно растёт и не выходит за цель', () => {
    wheel(100);
    now += 16;
    frames.shift()?.(now);
    const first = scrollY;
    now += 400;
    frames.shift()?.(now);
    expect(first).toBeGreaterThan(0);
    expect(scrollY).toBeGreaterThan(first);
    expect(scrollY).toBeLessThan(1000);
  });

  it('несколько событий во время анимации заканчиваются на той же остановке', () => {
    wheel(100);
    now += 200;
    wheel(100);
    now += 200;
    wheel(100);
    runFrames();
    expect(scrollY).toBe(1000);
  });

  it('щелчок в обратную сторону посреди шага возвращает к предыдущей остановке', () => {
    wheel(100);
    now += 16;
    frames.shift()?.(now);
    now += 500;
    frames.shift()?.(now);
    const midway = scrollY;
    expect(midway).toBeGreaterThan(0);
    const back = wheel(-100);
    runFrames();
    expect(back.defaultPrevented).toBe(true);
    expect(scrollY).toBe(0);
  });

  it('обратный щелчок без остановки в том направлении не ломает текущий шаг', () => {
    scrollY = 0;
    wheel(100);
    now += 16;
    frames.shift()?.(now);
    const event = wheel(-100);
    runFrames();
    expect(event.defaultPrevented).toBe(true);
    expect(scrollY).toBe(1000);
  });

  it('на последней остановке щелчок вниз остаётся родным', () => {
    scrollY = 3000;
    const event = wheel(100);
    expect(event.defaultPrevented).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('на первой остановке щелчок вверх остаётся родным', () => {
    const event = wheel(-100);
    expect(event.defaultPrevented).toBe(false);
  });

  it('wheel с deltaY = 0 игнорируется', () => {
    const event = wheel(0);
    expect(event.defaultPrevented).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('инерция тачпада сразу после посадки не запускает второй шаг', () => {
    wheel(100);
    now += 2190;
    wheel(20);
    runFrames();
    now += 50;
    const tail = wheel(40);
    runFrames();
    expect(tail.defaultPrevented).toBe(true);
    expect(scrollY).toBe(1000);
  });

  it('событие после паузы 160+ мс запускает следующий шаг', () => {
    wheel(100);
    runFrames();
    now += 200;
    wheel(100);
    runFrames();
    expect(scrollY).toBe(2000);
  });

  it('непрерывный хвост инерции продлевает блокировку', () => {
    wheel(100);
    now += 2190;
    wheel(10);
    runFrames();
    for (let i = 0; i < 5; i += 1) {
      now += 100;
      wheel(10);
    }
    expect(frames).toHaveLength(0);
    expect(scrollY).toBe(1000);
  });

  it('обратное направление после посадки принимается сразу', () => {
    wheel(100);
    runFrames();
    now += 20;
    wheel(-100);
    runFrames();
    expect(scrollY).toBe(0);
  });

  it('wheel с ctrl (зум) не перехватывается', () => {
    const event = wheel(100, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it('wheel внутри прокручиваемого блока остаётся родным', () => {
    const box = document.createElement('div');
    box.style.overflowY = 'auto';
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 100 });
    document.body.appendChild(box);
    const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    box.remove();
  });

  it('wheel по непрокручиваемому блоку перехватывается', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    box.remove();
  });

  it('touchstart прерывает анимацию', () => {
    wheel(100);
    now += 16;
    frames.shift()?.(now);
    window.dispatchEvent(new Event('touchstart'));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    const before = scrollY;
    runFrames();
    expect(scrollY).toBe(before);
  });

  it('длинный межсценовый шаг замедляется в середине и доезжает до остановки', () => {
    stop();
    stop = startSmoothScroll({ getStops: () => [0, 1500] });
    const sampleAt = (fraction: number): number => {
      now = 1000 + 8500 * fraction;
      frames.shift()?.(now);
      return scrollY;
    };
    wheel(100);
    now += 16;
    frames.shift()?.(now);

    const wingStep = Math.abs(sampleAt(0.3) - sampleAt(0.2));
    const centerStep = Math.abs(sampleAt(0.55) - sampleAt(0.45));

    expect(centerStep).toBeGreaterThan(0);
    expect(centerStep).toBeLessThan(wingStep);

    runFrames();
    expect(scrollY).toBe(1500);
  });

  it('после dispose колесо не перехватывается, анимация остановлена', () => {
    wheel(100);
    stop();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    const event = wheel(100);
    expect(event.defaultPrevented).toBe(false);
    runFrames();
    expect(scrollY).toBe(0);
    stop = startSmoothScroll({ getStops: () => STOPS });
  });
});

describe('startSmoothScroll: пропуск', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('при prefers-reduced-motion не вешает слушателей', () => {
    stubMedia(['prefers-reduced-motion']);
    const addSpy = vi.spyOn(window, 'addEventListener');
    startSmoothScroll({ getStops: () => STOPS })();
    expect(addSpy).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());
  });

  it('при coarse-pointer (тач) не вешает слушателей', () => {
    stubMedia(['pointer: coarse']);
    const addSpy = vi.spyOn(window, 'addEventListener');
    startSmoothScroll({ getStops: () => STOPS })();
    expect(addSpy).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());
  });
});
