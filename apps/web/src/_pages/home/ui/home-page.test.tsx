import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Загрузчик скриптов в этом тесте не нужен — проверяется разметка.
vi.mock('./landing-scripts', () => ({ LandingScripts: () => null }));

import { HomePage } from './home-page';

afterEach(cleanup);

describe('HomePage', () => {
  it('рендерит h1, слой облаков и WebGL-канвас', () => {
    const { container } = render(<HomePage />);
    expect(container.querySelector('h1')?.textContent).toBe('UNTESIS');
    expect(container.querySelector('#drifting-clouds-layer')).not.toBeNull();
    expect(container.querySelector('#gl-canvas')).not.toBeNull();
  });

  it('не рендерит убранные декоративные части пролога', () => {
    const { container } = render(<HomePage />);
    for (const selector of ['#sculpture-section', '#hero-orbits', '#hero-arches', '#hero-scroll-down']) {
      expect(container.querySelector(selector)).toBeNull();
    }
  });
});
