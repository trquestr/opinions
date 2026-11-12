import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSmoothScroll } from './smooth-scroll';

describe('startSmoothScroll', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('запускается и возвращает функцию отписки', () => {
    const stop = startSmoothScroll();
    expect(typeof stop).toBe('function');
    stop();
  });

  it('при prefers-reduced-motion не перехватывает скролл', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const stop = startSmoothScroll();
    expect(typeof stop).toBe('function');
    stop();
  });

  it('при событии wheel предотвращает дефолт и запускает плавный шаг', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(16);
      return 1;
    });

    const stop = startSmoothScroll();
    const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.scrollTo).toHaveBeenCalled();
    stop();
  });
  it('при coarse-pointer (тач) не перехватывает скролл', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('pointer: coarse'), media: query })),
    );
    startSmoothScroll()();
    expect(addSpy).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());
  });

  it('wheel с ctrl (зум) не перехватывается', () => {
    const stop = startSmoothScroll();
    const event = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('wheel внутри прокручиваемого блока остаётся родным', () => {
    const box = document.createElement('div');
    box.style.overflowY = 'auto';
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 100 });
    document.body.appendChild(box);
    const stop = startSmoothScroll();
    const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    box.remove();
    stop();
  });

  it('wheel по непрокручиваемому блоку перехватывается', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const box = document.createElement('div');
    document.body.appendChild(box);
    const stop = startSmoothScroll();
    const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    box.remove();
    stop();
  });

  it('строчный и постраничный режимы deltaMode тоже перехватываются', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const stop = startSmoothScroll();
    const lines = new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true });
    const pages = new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, cancelable: true });
    window.dispatchEvent(lines);
    window.dispatchEvent(pages);
    expect(lines.defaultPrevented).toBe(true);
    expect(pages.defaultPrevented).toBe(true);
    stop();
  });

  it('инерция доезжает до цели и останавливается', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(5000);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const stop = startSmoothScroll();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
    let time = 0;
    while (frames.length > 0 && time < 100) {
      time += 1;
      frames.shift()?.(time * 16);
    }
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1);
    expect(frames).toHaveLength(0);
    stop();
  });

  it('событие scroll без анимации синхронизирует позицию, touchstart её сбрасывает', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const stop = startSmoothScroll();
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('touchstart'));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    stop();
  });

  it('scroll во время анимации не сбивает цель', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const stop = startSmoothScroll();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    window.dispatchEvent(new Event('scroll'));
    expect(window.scrollTo).not.toHaveBeenCalled();
    stop();
  });
});
