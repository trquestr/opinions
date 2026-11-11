import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { LandingScripts, SCRIPTS } from './landing-scripts';

const scripts = () => Array.from(document.body.querySelectorAll('script'));
// Даём цепочке промисов (await loadScript) исполниться между событиями.
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  delete window.__landingScriptsLoaded;
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LandingScripts', () => {
  it('грузит скрипты строго по очереди, каждый следующий — после load предыдущего', async () => {
    render(<LandingScripts />);
    await flush();
    expect(scripts().map((s) => s.getAttribute('src'))).toEqual([SCRIPTS[0]]);
    expect(SCRIPTS[0]).toBe('/js/three.min.js');

    for (let i = 0; i < SCRIPTS.length; i++) {
      expect(scripts()).toHaveLength(i + 1);
      scripts()[i]?.dispatchEvent(new Event('load'));
      await flush();
    }
    expect(scripts().map((s) => s.getAttribute('src'))).toEqual(SCRIPTS);
    expect(SCRIPTS).toContain('/js/gsap.min.js');
  });

  it('повторный mount скрипты не добавляет', async () => {
    render(<LandingScripts />);
    await flush();
    cleanup();
    render(<LandingScripts />);
    await flush();
    expect(scripts()).toHaveLength(1);
    expect(window.__landingScriptsLoaded).toBe(true);
  });

  it('при ошибке скрипта логирует и не грузит следующие', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LandingScripts />);
    await flush();
    scripts()[0]?.dispatchEvent(new Event('error'));
    await flush();
    expect(spy).toHaveBeenCalled();
    expect(scripts()).toHaveLength(1);
  });
});
