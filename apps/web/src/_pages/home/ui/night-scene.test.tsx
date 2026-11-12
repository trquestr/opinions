import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Клиентский драйвер в этом тесте не нужен — проверяется серверная разметка.
vi.mock('./night-scene-driver', () => ({ NightSceneDriver: () => null }));

import { NIGHT_EPILOGUE, NIGHT_PHRASES } from '../model/night-script';
import { NightScene } from './night-scene';

afterEach(cleanup);

describe('NightScene', () => {
  it('рендерит секцию #night', () => {
    const { container } = render(<NightScene />);
    expect(container.querySelector('section#night')).not.toBeNull();
  });

  it('рендерит все фразы по порядку', () => {
    const { container } = render(<NightScene />);
    const texts = [...container.querySelectorAll('[data-night-phrase]')].map((el) => el.textContent);
    expect(texts).toEqual(NIGHT_PHRASES.map((phrase) => phrase.text));
  });

  it('главная фраза — единственный h2', () => {
    const { container } = render(<NightScene />);
    const headings = container.querySelectorAll('h2');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Звёзды — общие. Созвездия — твои.');
  });

  it('рендерит эпилог', () => {
    const { container } = render(<NightScene />);
    expect(container.querySelector('[data-night-epilogue]')?.textContent).toBe(NIGHT_EPILOGUE);
  });

  it('канвас скрыт от читалок экрана', () => {
    const { container } = render(<NightScene />);
    expect(container.querySelector('canvas[data-night-canvas]')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('NightScene: сторона фигуры', () => {
  it('data-side стоит только у фраз с фигурой', () => {
    const { container } = render(<NightScene />);

    const sides = [...container.querySelectorAll('[data-night-phrase]')].map((el) =>
      el.getAttribute('data-side'),
    );

    expect(sides).toEqual([null, 'right', 'left', 'right', 'left', null, null, null, null]);
  });
});
