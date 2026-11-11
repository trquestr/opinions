'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { applyTheme, readTheme } from './apply-theme';
import { DEFAULT_THEME, THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type Theme } from './config';

function subscribe(onChange: () => void): () => void {
  // Своё событие — переключения в этой вкладке; `storage` — в других вкладках.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Другая вкладка сменила тему — приводим атрибут <html> к ней (без записи обратно).
    const root = document.documentElement;
    if (event.newValue === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerSnapshot = (): Theme => DEFAULT_THEME;

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerSnapshot);
  const toggleTheme = useCallback(() => applyTheme(readTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme: applyTheme, toggleTheme };
}
