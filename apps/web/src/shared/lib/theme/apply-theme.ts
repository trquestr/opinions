import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type Theme } from './config';

/** Читает текущую тему из атрибута <html> — единственного источника правды на клиенте. */
export function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Применяет тему: атрибут на <html>, запись в localStorage, событие для подписчиков вкладки. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.dataset.theme = 'dark';
  } else {
    delete root.dataset.theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Приватный режим/квота: тема применена на эту сессию, просто не запомнится.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
