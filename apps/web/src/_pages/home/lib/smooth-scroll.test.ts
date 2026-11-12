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
});
