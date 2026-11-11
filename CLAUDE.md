# «Мнения»

Продукт «Мнения»: личная библиотека мнений — каждый день вопрос, короткий ответ, история изменений взглядов
(концепция — `Идеи.md`, архитектура и карта доменов — `docs/architecture.md`). Сейчас готовы промо-лендинг
с WebGL-героем и инфраструктура под домены; доменных функций ещё нет. Владелец общается по-русски — отвечай по-русски.

## Стек и запуск

Монорепо **Yarn 4** workspaces (`packages/*`, `apps/*`, `nodeLinker: node-modules`), **Node 26 LTS** (`.nvmrc`).
Yarn — через corepack; npm в проекте не использовать. Пакеты — `yarn workspace <web|api|@opinions/contracts> add` —
только с решения владельца. Корневой `postinstall` собирает контракты.

- `packages/contracts` — **@opinions/contracts**: zod-схемы и контракты эндпоинтов + типизированный клиент
  (`@opinions/contracts/client`: таймауты, ретраи GET, проверка ответа). Общий для фронта и бэка.
- `apps/web` — **Next.js 16** (App Router, SSR/пререндер ради SEO), архитектура **FSD** (`src/`), стили **Tailwind 4**.
  Next 16 отличается от привычного — `node_modules/next/dist/docs/` и context7.
- `apps/api` — **NestJS 12** (ESM) + **Drizzle** + **PostgreSQL 18** + **Redis 8 / BullMQ**. Все ручки под `/api`.
  Дока Nest — https://docs.nestjs.com/llms.txt.
- Локально: `docker compose up -d --wait` (Postgres + Redis), `cp apps/api/.env.example apps/api/.env`, `yarn dev`
  (контракты в watch + api :4000 + web :3000; в dev Next проксирует `/api` на api). По отдельности: `yarn dev:web`, `yarn dev:api`.
- Команды из корня: `yarn typecheck`, `yarn lint` (ESLint + Steiger + oxlint), `yarn test`, `yarn build`, `yarn format`.
  Интеграционные тесты бэка: `yarn workspace api test:int` (нужен docker compose). Миграции: `yarn workspace api db:generate`.
- Прод: свой VPS, Docker Compose из `deploy/` (Caddy → web/api, Postgres, Redis, миграции отдельным контейнером).
  GitHub Pages больше не используется. CI — `.github/workflows/ci.yml` (проверки, интеграция с БД, сборка образов).
  Пуш в `main` — только по просьбе владельца.
- Конфиги превью в `.claude/launch.json`: `web`, `api`, `attach` (если :3000 уже поднят).

## Карта файлов

| Путь | Что это |
|---|---|
| `docs/architecture.md` | Принятые решения, поток данных, карта доменов (продукт → модуль Nest → контракты → слайсы FSD) |
| `packages/contracts/src/core/` | `defineEndpoint` (типобезопасные контракты), `ApiError`, пагинация, примитивы (id, даты, текст) |
| `packages/contracts/src/client/` | `createApiClient`: таймаут, ретраи GET с backoff+jitter, проверка ответа, типизированные ошибки |
| `apps/web/app/` | Только роутинг Next: тонкие ре-экспорты из `src/` |
| `apps/web/src/_app/` | Корневой layout, `styles/globals.css` (Tailwind, `@theme`, шрифты), базовые metadata, robots, sitemap |
| `apps/web/src/_pages/home/` | Лендинг: `ui/hero.tsx`, `ui/landing-scripts.tsx` (грузит модули героя после гидрации), `landing.css` |
| `apps/web/src/_pages/errors/` | Страницы ошибки, глобальной ошибки, 404 |
| `apps/web/src/shared/lib/theme/`, `src/features/theme-switch/` | Две темы: скрипт до отрисовки, `applyTheme`/`useTheme`; переключатель (пока не размещён) |
| `apps/web/src/shared/` | `api` (serverApi / userServerApi / browserApi), `config` (env на zod, site, security-headers), `ui`, `lib` |
| `apps/web/public/js/` | Модули героя (vanilla JS): `landing.js`, `cloud-relief.js`, `bust-section.js`, `three.min.js`, `gsap.min.js` |
| `apps/web/public/assets/` | Картинки, карты облаков, шрифты (`fonts/`), исходники бюста (`credits.json` — лицензии) |
| `apps/api/src/core/` | Инфраструктура: контракты, доступ, ошибки, БД, Redis, очереди, health, request-id, логи |
| `apps/api/src/modules/` | Доменные модули (появятся по карте доменов) |
| `apps/api/drizzle/` | SQL-миграции (генерирует drizzle-kit) |
| `docker-compose.yml` | Postgres + Redis для разработки |
| `deploy/` | Прод: Dockerfile'ы в приложениях, `docker-compose.prod.yml`, `Caddyfile`, `.env.example` |
| `tsconfig.base.json` | Общая строгость TypeScript для всех пакетов |
| `scripts/build_final_untesis_font.py` | Сборка шрифта Untesis (fonttools, skia-pathops) → `apps/web/public/assets/fonts/` |
| `scripts/check.sh` | Быстрые проверки одной командой |

## Правила кода

Подробные правила — в `.claude/rules/` (Claude Code подгружает их сам, по путям файлов). **Перед кодом — прочитать нужные:**

| Файл | Где действует | О чём |
|---|---|---|
| `.claude/rules/general.md` | везде | context7, TypeScript, безопасность (OWASP), устойчивость к отказам, тесты, эффективность |
| `.claude/rules/contracts.md` | `packages/contracts`, `apps/api/src`, `shared/api` | Как описать ручку контрактом и использовать его на бэке и фронте |
| `.claude/rules/web.md` | `apps/web/**` | FSD, SSR/SEO, данные через контракты, Tailwind, CSP, Core Web Vitals |
| `.claude/rules/api.md` | `apps/api/**` | Структура Nest, Drizzle и миграции, доступ, rate limit, очереди, health, тесты |
| `.claude/rules/hero.md` | `public/js/**`, `_pages/home/**` | WebGL-герой: загрузка после гидрации, Preflight, 60 FPS, фолбэки |

Коротко, без чего изменение не принимается:
- **Не править код, который не касается задачи.** Нужно тронуть что-то за её пределами — сначала спросить владельца.
- **Доку библиотек — через context7** (`resolve-library-id` → `query-docs` с версией из `yarn.lock`), а не по памяти.
- Всё, что пересекает HTTP, описано контрактом; типы — из схем, ручных интерфейсов ответа нет.
- Каждый внешний вход валидируется схемой, доступ проверяется на каждом эндпоинте и объекте, ошибки — fail closed.
- Каждый исходящий вызов — с таймаутом; ретраи только идемпотентных, с backoff и jitter; долгое — в очередь.
- Новый код — с тестами в том же изменении, покрытие ≥ 80%, тесты не ослаблять.
- Новые зависимости, ORM, БД, UI-киты — только по решению владельца.
- Коммиты: короткое английское сообщение в стиле истории (`feat: …`, `Fix …`), только по просьбе владельца.

## Как проверять изменения

1. `bash scripts/check.sh` — синтаксис модулей героя, наличие их файлов, typecheck, lint и тесты всех воркспейсов.
   Одна команда, агент не нужен. Перед коммитом — ещё `yarn build` и `yarn format:check`;
   покрытие — `yarn workspace <web|api|@opinions/contracts> test:cov`.
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
