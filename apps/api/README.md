# apps/api — the Untesis backend

NestJS 12 (ESM) + Drizzle ORM + PostgreSQL 18 + Redis 8 / BullMQ. All endpoints are under `/api`, each one is described
by a contract from `@untesis/contracts`.

Running, commands and environment — in the root [README](../../README.md); rules — `.claude/rules/api.md`,
architecture — [`docs/architecture.md`](../../docs/architecture.md).

```bash
docker compose up -d --wait          # from the root: Postgres + Redis
cp apps/api/.env.example apps/api/.env
yarn workspace api dev               # http://localhost:4000/api/health
yarn workspace api test              # unit + e2e
yarn workspace api test:int          # with real Postgres and Redis
yarn workspace api db:generate       # migration after a schema change
```
