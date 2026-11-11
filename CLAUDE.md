# «Мнения»

Продукт «Мнения»: площадка, где мнение — это **один короткий простой ответ** на вопрос (см. `Идеи.md`).
Сейчас есть промо-лендинг с WebGL-героем и каркас фронта/бэка. Владелец общается по-русски — отвечай по-русски.

## Стек и запуск

Монорепо на **Yarn 4** workspaces (`apps/*`, `nodeLinker: node-modules`), **Node 26 LTS** (`.nvmrc`, `nvm use 26.13.0`).
Yarn — через corepack (`packageManager` в корневом `package.json`); npm в проекте не использовать.
Пакет в приложение: `yarn workspace web add <pkg>` / `yarn workspace api add <pkg>` — только с решения владельца.

- `apps/web` — **Next.js 16** (App Router, React 19, Turbopack, `cacheComponents`). SSR/пререндер обязателен — нужен SEO:
  контент страниц рендерится на сервере, метаданные через `metadata`, `robots.ts`, `sitemap.ts`;
  базовый URL — `NEXT_PUBLIC_SITE_URL`. API Next 16 отличается от привычного: перед кодом смотреть
  `node_modules/next/dist/docs/` (см. `apps/web/AGENTS.md`).
- `apps/api` — **NestJS 12** (ESM, Vitest, oxlint). Все ручки под префиксом `/api`, порт `PORT` (4000), CORS на `WEB_ORIGIN`.
  Пока есть только `GET /api/health`. Свежая дока Nest — https://docs.nestjs.com/llms.txt (см. `apps/api/AGENTS.md`).
- Команды из корня: `yarn dev:web` (:3000), `yarn dev:api` (:4000), `yarn build`, `yarn lint`, `yarn test`.
  CI — `.github/workflows/ci.yml` (install --immutable, lint, test, build, audit).
  Конфиги превью в `.claude/launch.json`: `web`, `api`, `attach` (если :3000 уже поднят).
- Деплой пока не настроен: GitHub Pages SSR не умеет, нужен Node-хостинг. Пуш в `main` — только по просьбе владельца.

## Карта файлов

| Путь | Что это |
|---|---|
| `apps/web/app/layout.tsx` | Корневой layout: `lang="ru"`, SEO-метаданные, viewport, preload шрифта |
| `apps/web/app/page.tsx` | Лендинг: разметка героя рендерится на сервере (server component) |
| `apps/web/app/landing-scripts.tsx` | Клиентский загрузчик старых модулей героя по порядку **после гидрации**; здесь же их `?v=N` |
| `apps/web/app/landing.css` | Стили лендинга (импорт в layout, бандлит Next) |
| `apps/web/public/js/landing.js` | Логика героя: вордмарк из капель (SDF + `smin`), флюидный курсор, хореография GSAP |
| `apps/web/public/js/cloud-relief.js` | Облака на three.js: рельеф по heightmap/normal-картам, дрейф, 3D-наклон, фолбэк на `<img>` |
| `apps/web/public/js/bust-section.js` | Секция с точечным бюстом (большой файл с данными точек — читать кусками) |
| `apps/web/public/js/three.min.js`, `gsap.min.js` | three.js и GSAP 3.12.5, локальные (без CDN) |
| `apps/web/public/assets/` | Картинки, карты облаков, шрифты (`fonts/`), исходники бюста (`credits.json` — лицензии) |
| `apps/web/security-headers.ts` | CSP и заголовки безопасности (подключены в `next.config.ts`) |
| `apps/api/src/` | Nest: `main.ts` (bootstrap), `configure-app.ts` (заголовки, префикс, CORS, shutdown), `config/env.schema.ts` (zod-схема env), `app.module.ts` (config, throttler), health |
| `.claude/rules/` | Правила кода (см. ниже) |
| `scripts/build_final_untesis_font.py` | Сборка шрифта Untesis (fonttools, skia-pathops) → `apps/web/public/assets/fonts/` |
| `scripts/check.sh` | Быстрые проверки одной командой |
| `Идеи.md` | Продуктовые идеи и ограничения дизайна |

## Правила кода

Подробные правила — в `.claude/rules/` (Claude Code подгружает их сам, по путям файлов). **Перед кодом — прочитать нужные:**

| Файл | Где действует | О чём |
|---|---|---|
| `.claude/rules/general.md` | везде | Документация через context7, TypeScript, безопасность (OWASP), устойчивость к отказам, тесты, эффективность |
| `.claude/rules/web.md` | `apps/web/**` | SSR/SEO, Server/Client Components, Data Access Layer, CSP и заголовки, error boundaries, Core Web Vitals |
| `.claude/rules/api.md` | `apps/api/**` | Модули Nest, валидация, guard'ы, rate limit, CORS, graceful shutdown, health, e2e-тесты |
| `.claude/rules/hero.md` | `public/js/**`, `landing-scripts.tsx`, `landing.css` | WebGL-герой: загрузка после гидрации, `?v=N`, 60 FPS, фолбэки |

Коротко, без чего изменение не принимается:
- **Доку библиотек — через context7** (`resolve-library-id` → `query-docs` с версией из `yarn.lock`), а не по памяти.
- Каждый внешний вход валидируется схемой (zod), доступ проверяется на каждом эндпоинте и объекте, ошибки — fail closed.
- Каждый исходящий вызов — с таймаутом; ретраи только идемпотентных, с backoff и jitter; ошибки не глотать.
- Новый код — с тестами в том же изменении, покрытие ≥ 80%, тесты не ослаблять.
- Новые зависимости, ORM, БД, UI-киты — только по решению владельца.
- Коммиты: короткое английское сообщение в стиле истории (`feat: …`, `Fix …`), только по просьбе владельца.

## Как проверять изменения

1. `bash scripts/check.sh` — синтаксис модулей героя, наличие файлов из `SCRIPTS`, поднятый `?v=`, lint и тесты
   обоих приложений. Одна команда, агент не нужен. Перед коммитом — ещё `yarn build`; покрытие — `yarn workspace <web|api> test:cov`.
2. Браузер — один заход: `preview_start` `name: "web"` → ожидание ~15 с (интро: белый экран, потом капли собирают вордмарк)
   → ошибки консоли → скриншот десктоп + 375px. Без повторных ожиданий.
   - Сначала `tabs_context`. Если панель скрыта — сразу попросить владельца её открыть (в скрытой панели нет rAF,
     анимация стоит). Headless Chrome/Edge для WebGL не пробовать — рисует белый кадр.
   - Если :3000 уже отвечает — `preview_start` с `name: "attach"`, второй сервер не поднимать.
   - Ошибка консоли `getComputedStyle ... at eff (<anonymous>)` — от инструментов панели, не от страницы.
   - SEO без браузера: `curl -s localhost:3000/ | grep -E '<title>|<h1|description'` — контент должен быть в HTML.
3. Визуальное качество (форма капель, плавность, композиция) оценивает основная сессия или владелец — не агенты.

## Агенты проекта (`.claude/agents/`)

Основная сессия — постановщик задач и ревьюер: решает, проектирует, пишет шейдерную математику, ставит ТЗ,
сама смотрит дифф и делает финальный взгляд. Объём механики отдаёт агентам.

| Агент | Модель | Когда звать |
|---|---|---|
| `coder` | Sonnet | Код по готовому ТЗ: вёрстка, правка модуля, перенос параметров, рефакторинг |
| `scout` | Haiku | Найти, где что лежит в коде; найти неиспользуемые файлы/ссылки; прочитать доку (three.js, GSAP, WebGL) |
| `verifier` | Haiku | Браузерная проверка по пункту 2 выше, когда её много (несколько страниц/размеров) |

Цикл: решение (сессия) → `coder` → `scripts/check.sh` → ревью диффа сессией → браузер → коммит по просьбе.

## Экономия лимита

- Ревью — сама сессия, точечно: `git diff --stat`, затем рискованные куски (шейдеры, uniform-ы, жизненный цикл).
  Отдельного ревью-агента нет.
- Перед большим рефактором — предложить коммит-чекпоинт, чтобы база для `git diff` была чистой (не бэкап в scratchpad).
- На «улучши всё» — сначала назвать объём и цену: «безопасный минимум» или «полный проход».
- ТЗ на аудит: «оглавление через grep + точечное чтение», не «прочитай целиком». Поиск мусора и ссылок — `scout`, не Sonnet.
- Отчёты агентов — до 500 слов.
- ТЗ агенту самодостаточное: цель, файлы, ограничения, критерий готовности, формат отчёта — агент не видит разговор.

## code-review-graph

В проекте есть граф кода (`.code-review-graph/`, MCP `mcp__code-review-graph__*`, грузится через ToolSearch `+code-review-graph`).
Для поиска по коду сначала граф (`semantic_search_nodes_tool`, `query_graph_tool`), Grep/Read — если граф не покрывает.
Если граф пустой — `build_or_update_graph_tool`.
