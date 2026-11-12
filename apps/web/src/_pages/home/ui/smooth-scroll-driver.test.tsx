import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPageStops, SmoothScrollDriver } from './smooth-scroll-driver';

function addSection(id: string, top: number): HTMLElement {
  const section = document.createElement('section');
  section.id = id;
  section.getBoundingClientRect = () => ({ top }) as DOMRect;
  document.body.appendChild(section);
  return section;
}

describe('SmoothScrollDriver', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('монтируется и размонтируется без ошибок', () => {
    const { unmount } = render(<SmoothScrollDriver />);
    expect(() => unmount()).not.toThrow();
  });

  it('подписывается на колесо и снимает подписку при размонтировании', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<SmoothScrollDriver />);
    expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
});

describe('readPageStops', () => {
  beforeEach(() => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(20000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('собирает остановки обеих секций и границы страницы', () => {
    addSection('clouds', 1000);
    addSection('night', 4000);
    const stops = readPageStops();
    expect(stops[0]).toBe(0);
    expect(stops[1]).toBeCloseTo(1700, 6);
    expect(stops).toContain(19000);
    expect(stops.some((px) => Math.abs(px - 4600) < 0.001)).toBe(true);
    expect(stops).toHaveLength(15);
  });

  it('пропускает отсутствующие секции и не падает', () => {
    addSection('night', 4000);
    expect(() => readPageStops()).not.toThrow();
    expect(readPageStops()).toHaveLength(11);
  });

  it('без секций возвращает только начало и конец страницы', () => {
    expect(readPageStops()).toEqual([0, 19000]);
  });
});
