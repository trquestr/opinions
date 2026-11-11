---
paths:
  - "apps/web/public/js/**"
  - "apps/web/src/_pages/home/**"
---

# WebGL-герой лендинга

- Модули `apps/web/public/js/*.js` (landing, cloud-relief, bust-section, three.min, gsap.min) — vanilla JS, IIFE,
  `'use strict'`, глобалы `THREE`/`gsap`, стартуют сразу при загрузке. Не импортировать в React и не вставлять
  `<script>` в JSX: DOM, который они меняют, ломает гидрацию. Грузятся только через
  `src/_pages/home/ui/landing-scripts.tsx`, по порядку, после гидрации.
- Разметка героя — `src/_pages/home/ui/hero.tsx` (серверный компонент), стили — `src/_pages/home/landing.css`.
  Новый UI вокруг героя — на Tailwind; `landing.css` — только для героя.
- Tailwind Preflight уже действует: правила `landing.css` вне слоя и побеждают `@layer base`, но свойства,
  которые Preflight задаёт, а `landing.css` нет (display/max-width у img/svg/canvas, line-height) — задавать явно.
- Ассеты — абсолютные пути `/assets/...` из `public/`. Кэш-бастинг `?v=` не нужен: Next отдаёт `public/` с ETag.
- 60 FPS — требование: никакой аллокации в `requestAnimationFrame`, `uniform`-ы не загружать каждый кадр без нужды.
- Уважать `prefers-reduced-motion`, обрабатывать потерю WebGL-контекста, иметь фолбэк без WebGL.
- Мобильные: тач-события, `viewport-fit=cover`, devicePixelRatio ограничен.
- Комментарии к шейдерам и физике — по-русски, подробно, с формулами.
- Тяжёлые файлы (`three.min.js`, `gsap.min.js`, `bust-section.js`) целиком не читать — grep и куски.
- Визуальное качество (форма капель, плавность, композиция) оценивает основная сессия или владелец, не агенты.
