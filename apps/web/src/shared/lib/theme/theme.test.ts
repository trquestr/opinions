import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { applyTheme, DEFAULT_THEME, THEME_STORAGE_KEY, themeInitScript, useTheme } from './index';

const root = document.documentElement;

function runInitScript(): void {
  // Выполняем строку так же, как браузер из <head>.
  new Function(themeInitScript)();
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('themeInitScript', () => {
  it('ставит тёмную тему, если в localStorage dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runInitScript();
    expect(root.dataset.theme).toBe('dark');
  });

  it.each([null, 'light', 'мусор', '', 'DARK'])('оставляет светлую при значении %j', (value) => {
    if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);
    runInitScript();
    expect(root.dataset.theme).toBeUndefined();
  });

  it('не падает, если localStorage бросает исключение', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(runInitScript).not.toThrow();
    expect(root.dataset.theme).toBeUndefined();
  });
});

describe('applyTheme', () => {
  it('тёмная: атрибут и localStorage', () => {
    applyTheme('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('светлая: снимает атрибут и запоминает выбор', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(root.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('применяет тему, даже если localStorage недоступен для записи', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(root.dataset.theme).toBe('dark');
  });
});

describe('useTheme', () => {
  it('по умолчанию светлая', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe(DEFAULT_THEME);
  });

  it('читает уже установленную скриптом тёмную тему', () => {
    root.dataset.theme = 'dark';
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggleTheme и setTheme переключают тему и атрибут', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
  });

  it('синхронизируется с событием storage из другой вкладки', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    });
    expect(result.current.theme).toBe('dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }));
    });
    expect(result.current.theme).toBe('light');
  });

  it('игнорирует storage по чужому ключу', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'dark' }));
    });
    expect(result.current.theme).toBe('light');
  });

  it('после размонтирования отписывается от событий', () => {
    const { unmount } = renderHook(() => useTheme());
    unmount();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    // Обработчик снят: атрибут <html> не тронут.
    expect(root.dataset.theme).toBeUndefined();
  });
});
