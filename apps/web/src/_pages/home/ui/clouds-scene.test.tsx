import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Клиентский драйвер в этом тесте не нужен — проверяется серверная разметка.
vi.mock('./clouds-scene-driver', () => ({ CloudsSceneDriver: () => null }));

import { CLOUDS_FORMATION } from '../lib/clouds/clouds-formation';
import { CLOUDS_PHRASES } from '../model/clouds-script';
import { CloudsScene } from './clouds-scene';

afterEach(cleanup);

describe('CloudsScene', () => {
  it('рендерит секцию #clouds с доступным лейблом', () => {
    const { container } = render(<CloudsScene />);
    expect(container.querySelector('section#clouds')).not.toBeNull();
  });

  it('содержит все фразы сценария по порядку', () => {
    const { container } = render(<CloudsScene />);
    const texts = [...container.querySelectorAll('[data-clouds-phrase]')].map((el) => el.textContent?.trim());
    expect(texts).toEqual(CLOUDS_PHRASES.map((phrase) => phrase.text));
  });

  it('рендерит холст для капель туши', () => {
    const { container } = render(<CloudsScene />);
    expect(container.querySelector('canvas[data-clouds-canvas]')).not.toBeNull();
    expect(container.querySelector('canvas[data-clouds-canvas-back]')).not.toBeNull();
    expect(container.querySelector('canvas[data-clouds-canvas-front]')).not.toBeNull();
  });

  it('рендерит холст вуали сумерек последним в сцене с режимом difference', () => {
    const { container } = render(<CloudsScene />);
    const stage = container.querySelector('[data-clouds-stage]');
    const veil = container.querySelector('canvas[data-clouds-veil]');

    expect(veil).not.toBeNull();
    expect(stage?.lastElementChild).toBe(veil);
    expect(veil?.getAttribute('aria-hidden')).toBe('true');
    expect(veil?.classList.contains('mix-blend-difference')).toBe(true);
  });

  it('содержит 3D-эшелоны облаков', () => {
    const { container } = render(<CloudsScene />);
    expect(container.querySelectorAll('[data-cloud-id]')).toHaveLength(CLOUDS_FORMATION.length);
  });
});
