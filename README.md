# UNTESIS — «Мнения»

Монорепо: фронт на **Next.js 16** (SSR, для SEO) и бэк на **NestJS 12**.
Сейчас фронт — промо-лендинг с WebGL-героем: вордмарк **UNTESIS** собирается из чернильных капель,
по экрану дрейфуют объёмные облака, вокруг — пунктирные орбиты, ниже — интерактивный точечный бюст.

## Структура

- `apps/web` — Next.js (App Router). Разметка рендерится на сервере, WebGL-модули героя
  (`public/js/`) подгружаются на клиенте после гидрации (`app/landing-scripts.tsx`).
- `apps/api` — NestJS, ручки под `/api` (пока `GET /api/health`).

## Запуск

Нужны Node 26 LTS (`.nvmrc`) и Yarn 4 через corepack (`corepack enable`).

```bash
yarn install
yarn dev:web   # http://localhost:3000
yarn dev:api   # http://localhost:4000/api/health
```

Сборка, линт, тесты: `yarn build`, `yarn lint`, `yarn test`, быстрые проверки — `bash scripts/check.sh`.

Переменные: `NEXT_PUBLIC_SITE_URL` (canonical, sitemap) для web; `PORT`, `WEB_ORIGIN` (CORS) для api.

## Правила кода

В `.claude/rules/`: общие (безопасность, отказоустойчивость, тесты, эффективность), фронт, бэк, WebGL-герой.

## Технологии героя

WebGL2 (GLSL), three.js (локальный), GSAP 3.12.5, свой шрифт Untesis
(`apps/web/public/assets/fonts/`, сборка — `scripts/build_final_untesis_font.py`).
