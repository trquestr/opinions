export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

// Светлая по умолчанию; системную тему (prefers-color-scheme) намеренно не учитываем — решение владельца.
export const DEFAULT_THEME: Theme = 'light';
export const THEME_STORAGE_KEY = 'theme';

// Событие для подписчиков в этой же вкладке: `storage` срабатывает только в ДРУГИХ вкладках.
export const THEME_CHANGE_EVENT = 'untesis:theme-change';

/**
 * Самодостаточный скрипт для <head>: выполняется до отрисовки и ставит тёмную тему из localStorage,
 * чтобы страница не мигала светлой. Светлая — отсутствие атрибута. Это константа без внешних данных
 * (ключ вшит), поэтому вставка через dangerouslySetInnerHTML безопасна.
 * try/catch: localStorage бросает в приватном режиме и при заблокированных cookie.
 */
export const themeInitScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}})();`;
