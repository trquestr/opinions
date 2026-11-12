import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Клиентский драйвер в этом тесте не нужен — проверяется серверная разметка.
vi.mock('./night-scene-driver', () => ({ NightSceneDriver: () => null }));

import { NIGHT_DETAILS } from '../model/night-details';
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

describe('NightScene: гравюрные детали', () => {
  it('по картинке на каждую деталь, с пустым alt, внутри скрытого от читалок контейнера', () => {
    const { container } = render(<NightScene />);

    const wrapper = container.querySelector('[data-night-details]');
    const images = [...container.querySelectorAll('img[data-night-detail]')];

    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
    expect(images).toHaveLength(NIGHT_DETAILS.length);
    expect(images.every((img) => img.getAttribute('alt') === '' && wrapper?.contains(img))).toBe(true);
  });

  it('адреса картинок собраны из имён деталей, номера проставлены', () => {
    const { container } = render(<NightScene />);

    const images = [...container.querySelectorAll('img[data-night-detail]')];

    expect(images[0]?.getAttribute('data-src')).toBe('/assets/night/details/detail-pine-branch.webp');
    expect(images[0]?.getAttribute('data-index')).toBe('0');
    expect(images.at(-1)?.getAttribute('data-src')).toBe('/assets/night/details/detail-dune.webp');
    expect(images.at(-1)?.getAttribute('data-index')).toBe('7');
  });

  it('в разметке у деталей нет src: картинки не качаются с первым экраном', () => {
    const { container } = render(<NightScene />);

    const images = [...container.querySelectorAll('img[data-night-detail]')];

    expect(images.every((img) => !img.hasAttribute('src'))).toBe(true);
  });

  it('контейнер деталей стоит раньше канваса, то есть под тушью', () => {
    const { container } = render(<NightScene />);

    const wrapper = container.querySelector('[data-night-details]');
    const canvas = container.querySelector('canvas[data-night-canvas]');

    expect(wrapper?.compareDocumentPosition(canvas as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
