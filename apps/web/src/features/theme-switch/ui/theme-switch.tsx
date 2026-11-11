'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from '@/shared/lib/theme';

const subscribeNoop = () => () => {};

export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  // До гидрации скрипт уже мог поставить dark, а сервер рендерит светлую. Чтобы гидрация не разошлась,
  // первый клиентский рендер повторяет серверный (светлая), затем подхватывается реальная тема.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const isDark = hydrated && theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isDark ? (
          // Солнце: в тёмной теме кнопка предлагает вернуть светлую.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          // Луна.
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
