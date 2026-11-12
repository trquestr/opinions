import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudsSceneDriver, findCloudsElements } from './clouds-scene-driver';

describe('CloudsSceneDriver', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('находит элементы сцены по контракту разметки', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-clouds-stage>
        <canvas data-clouds-canvas></canvas>
        <div data-cloud-id="c1"></div>
        <div data-cloud-id="c2"></div>
        <p data-clouds-phrase>Текст 1</p>
      </div>
    `;
    const elements = findCloudsElements(root);
    expect(elements).not.toBeNull();
    expect(elements?.cloudItems).toHaveLength(2);
    expect(elements?.phrases).toHaveLength(1);
  });

  it('находит холсты под и над облаками', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-clouds-stage>
        <canvas data-clouds-canvas data-clouds-canvas-back></canvas>
        <div data-cloud-id="c1"></div>
        <canvas data-clouds-canvas data-clouds-canvas-front></canvas>
      </div>
    `;
    const elements = findCloudsElements(root);
    expect(elements?.canvasBack).not.toBeNull();
    expect(elements?.canvasFront).not.toBeNull();
  });

  it('возвращает null, если разметка неполная', () => {
    const root = document.createElement('div');
    expect(findCloudsElements(root)).toBeNull();
  });

  it('монтируется и не падает, если rootId не найден', () => {
    expect(() => render(<CloudsSceneDriver rootId="non-existent" />)).not.toThrow();
  });
});
