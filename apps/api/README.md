# apps/api — бэк «Мнений»

NestJS 12 (ESM) + Drizzle ORM + PostgreSQL 18 + Redis 8 / BullMQ. Все ручки под `/api`, каждая описана
контрактом из `@opinions/contracts`.

Запуск, команды и окружение — в корневом [README](../../README.md); правила — `.claude/rules/api.md`,
архитектура — [`docs/architecture.md`](../../docs/architecture.md).

```bash
docker compose up -d --wait          # из корня: Postgres + Redis
cp apps/api/.env.example apps/api/.env
yarn workspace api dev               # http://localhost:4000/api/health
yarn workspace api test              # unit + e2e
yarn workspace api test:int          # с настоящими Postgres и Redis
yarn workspace api db:generate       # миграция после изменения схемы
```
