import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Загрузчик скриптов в этом тесте не нужен — проверяется разметка.
vi.mock('./landing-scripts', () => ({ LandingScripts: () => null }));
// Драйверы сцен (WebGL) тоже клиентские — здесь проверяется только разметка.
vi.mock('./clouds-scene-driver', () => ({ CloudsSceneDriver: () => null }));
vi.mock('./night-scene-driver', () => ({ NightSceneDriver: () => null }));
vi.mock('./smooth-scroll-driver', () => ({ SmoothScrollDriver: () => null }));

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

  it('рендерит секцию ночной сцены #night и облаков #clouds', () => {
    const { container } = render(<HomePage />);
    expect(container.querySelector('section#clouds')).not.toBeNull();
    expect(container.querySelector('section#night')).not.toBeNull();
  });
});
