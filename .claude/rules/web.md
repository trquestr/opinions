---
paths:
  - "apps/web/**"
---

# Фронт: Next.js 16 + FSD + Tailwind 4 (`apps/web`)

Источники: Next.js docs v16 (Data Security, CSP, Error Handling, Testing), Feature-Sliced Design v2.1
(гайд «Usage with Next.js»), Tailwind CSS v4. Сверять через context7: `/vercel/next.js/v16.x`,
`/feature-sliced/documentation`, Tailwind.

## Архитектура: Feature-Sliced Design

```
app/          роутинг Next — ТОЛЬКО тонкие файлы: export { HomePage as default, metadata } from '@/_pages/home'
src/
  _app/       корневой layout, глобальные стили (styles/globals.css), базовые metadata, robots, sitemap, провайдеры
  _pages/     страницы целиком: композиция виджетов/фич + metadata страницы (home, errors, потом question, profile…)
  widgets/    крупные самостоятельные блоки (daily-question, opinion-timeline, streak)
  features/   действия пользователя (answer-question, revisit-opinion, share-opinion, auth-by-telegram)
  entities/   бизнес-сущности и их отображение (question, opinion, topic, user)
  shared/     без бизнес-логики: api (клиенты), config (env, site), ui (кит), lib
```
- Слои `app`/`pages` названы `_app`/`_pages` (конфликт имён с Next); Steiger понимает их как слои.
- Импорт **только вниз** по слоям и **только через публичный API** слайса (`index.ts`): `@/entities/opinion`,
  а не `@/entities/opinion/ui/card`. Слайсы одного слоя друг друга не импортируют (для entities — `@x`-нотация).
- Сегменты внутри слайса: `ui/`, `model/` (типы, состояние, metadata), `api/` (запросы этого слайса через `shared/api`),
  `lib/`, `config/`. Пустые слои и слайсы не создавать; слайс, используемый одной страницей, — живёт в этой странице.
- Карта будущих слайсов — `docs/architecture.md` («Карта доменов»). Проверка — `yarn workspace web lint` (ESLint + Steiger).

## SSR и SEO — главное требование

- Всё индексируемое (тексты вопросов и мнений, профили, заголовки, ссылки) рендерится **на сервере**.
  Не загружать контент в `useEffect` / клиентским fetch.
- Server Components по умолчанию. `"use client"` — только на листьях с интерактивностью.
- У каждой страницы — `metadata`/`generateMetadata` в `_pages/<страница>/model`: уникальные `title`,
  `description`, `alternates.canonical` (у каждой страницы свой!), OpenGraph. Публичная страница — в `sitemap`.
  Один `h1`, семантические теги. Карточки мнений для шеринга — OG-картинки через `next/og`.
- Кэш: `cacheComponents` включён — публичные данные через `"use cache"` + `cacheLife` + `cacheTag`,
  персональные — динамически под `<Suspense>`.

## Данные и API

- Только через контракты (`.claude/rules/contracts.md`) и клиенты `shared/api`:
  - `serverApi` (`@/shared/api/server`, server-only) — публичные данные, без cookie, кэшируемо;
  - `userServerApi()` — от имени пользователя (пробрасывает cookie, делает рендер динамическим);
  - `browserApi` (`@/shared/api`) — из клиентских компонентов, тот же origin `/api`.
- Ошибки клиента: `ApiRequestError` (есть `error.code`), `ApiNetworkError` (сеть/таймаут), `ApiContractError` (баг).
  Обрабатывать по `code`, а не по тексту. Необязательный блок упал — страница рендерится без него (Suspense + фолбэк).
- Окружение — только через `shared/config` (zod): серверное (`server-env`, server-only) и публичное (`public-env`).
  `process.env` напрямую в коде не читать. `NEXT_PUBLIC_*` вшиваются при сборке.
- Мутации — Server Actions или `browserApi`; в Server Action — валидация входа схемой контракта и проверка доступа.

## Стили: Tailwind 4

- Утилиты Tailwind в разметке; токены (цвета, шрифты, отступы) — в `@theme` в `src/_app/styles/globals.css`,
  произвольные значения `[13px]` — исключение, а не норма. Классы склеивать `cx()` из `@/shared/lib`.
- **Две темы — светлая (по умолчанию) и тёмная.** Цвета — только семантическими токенами `background`,
  `foreground`, `muted`, `surface`, `border` (`bg-background`, `text-muted`, `border-border`…); значения обеих тем —
  в `globals.css` (`:root` и `[data-theme='dark']`). Хардкод цветов (`#000`, `bg-black`, `text-white`) в новом UI
  запрещён; особый случай для тёмной — вариант `dark:` (работает от атрибута, не от системной темы).
  Новый токен — сразу в обеих темах, с проверкой контраста ≥ 4.5:1.
- Механизм темы — `@/shared/lib/theme` (скрипт до отрисовки, `applyTheme`, `useTheme`), переключатель —
  `@/features/theme-switch`. Корневой layout не читает cookie: тема живёт в localStorage, рендер остаётся статическим.
- Герой лендинга всегда светлый (решение владельца) — его `landing.css` в темы не включать.
- Повторяющийся UI — компонент в `shared/ui` (кит) или в слайсе, а не копипаста классов.
- Порядок классов — Prettier (`prettier-plugin-tailwindcss`), вручную не сортировать.
- Свой CSS — только для героя (`_pages/home/landing.css`) и того, что утилитами не выразить (анимации, шейдеры).
- Доступность: фокус видим, контраст ≥ 4.5:1, интерактив — `<button>`/`<a>`, у картинок `alt`.

## Безопасность

- Секреты и доступ к данным — только на сервере; клиентский компонент получает готовый DTO.
- Заголовки безопасности и CSP — `shared/config/security-headers.ts`. `script-src 'unsafe-inline'` — осознанно:
  страницы пререндерятся статически, nonce требует динамического рендера. Ослаблять CSP — только с комментарием.
- Внешние скрипты с CDN не подключать. `dangerouslySetInnerHTML` — только для JSON-LD из своих данных.

## Производительность

- Минимум клиентского JS; тяжёлое — `next/dynamic`. Картинки контента — `next/image` с размерами.
- Core Web Vitals на мобильном: LCP < 2.5 с, CLS < 0.1, INP < 200 мс.

## Тесты

- Vitest + Testing Library, `*.test.ts(x)` рядом с кодом; `server-only` подменён в `test/server-only.ts`.
- Unit: компоненты (что видит пользователь), model, metadata, env, api-обёртки (fetch замокан).
- Async Server Components Vitest не поддерживает — E2E (Playwright, когда появятся сценарии).
- Покрытие ≥ 80% (`yarn workspace web test:cov`).
