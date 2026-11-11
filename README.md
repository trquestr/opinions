# «Мнения»

Личная библиотека мнений: каждый день — один вопрос, короткий ответ, со временем — история того, как менялись
взгляды. Концепция — [`Идеи.md`](Идеи.md), архитектура и карта доменов — [`docs/architecture.md`](docs/architecture.md).

Сейчас готовы промо-лендинг с WebGL-героем (вордмарк **UNTESIS** из чернильных капель, облака, точечный бюст)
и инфраструктура под домены продукта.

## Состав

| Пакет | Что это |
|---|---|
| `packages/contracts` | `@opinions/contracts` — zod-контракты API и типизированный клиент, общие для фронта и бэка |
| `apps/web` | Next.js 16 (SSR для SEO), Feature-Sliced Design, Tailwind CSS 4 |
| `apps/api` | NestJS 12, Drizzle ORM + PostgreSQL 18, Redis 8 + BullMQ |
| `deploy/` | Прод на VPS: Docker Compose, Caddy (HTTPS), миграции отдельным контейнером |

## Запуск

Нужны Node 26 LTS (`.nvmrc`), Yarn 4 через corepack (`npm i -g corepack && corepack enable`) и Docker.

```bash
yarn install
docker compose up -d --wait
cp apps/api/.env.example apps/api/.env
yarn dev          # контракты (watch) + api :4000 + web :3000
```

Проверки: `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build`, `yarn format:check`; всё сразу — `bash scripts/check.sh`.
Интеграционные тесты бэка (нужен docker compose): `yarn workspace api test:int`.

## Правила кода

`.claude/rules/`: общие (безопасность, отказоустойчивость, тесты, эффективность), контракты, фронт, бэк, WebGL-герой.

## Технологии героя

WebGL2 (GLSL), three.js и GSAP 3.12.5 (локально, без CDN), свой шрифт Untesis
(`apps/web/public/assets/fonts/`, сборка — `scripts/build_final_untesis_font.py`).
