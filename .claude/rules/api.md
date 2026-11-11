---
paths:
  - "apps/api/**"
---

# Back: NestJS 12 + Drizzle + Postgres 18 + Redis/BullMQ (`apps/api`)

Sources: docs.nestjs.com (Security, Configuration, Validation, Serialization, Lifecycle, Queues, Drizzle),
Drizzle ORM docs, OWASP REST Security Cheat Sheet. Verify via context7 (`/websites/nestjs`, Drizzle) or
https://docs.nestjs.com/llms.txt. The project is ESM: relative imports with `.js`.

## Structure

```
src/
  main.ts, configure-app.ts     bootstrap; headers, /api prefix, CORS, body limit 100kb, request-id, shutdown hooks
  config/env.schema.ts          zod schema of the environment (new variable = a field here + .env.example + deploy/.env.example)
  core/                         infrastructure, no business logic:
    contracts/                  @Endpoint, @ContractParams/@ContractQuery/@ContractBody, response serialization, coverage check
    access/                     global guard by contract.access
    errors/                     filter → ApiError, apiException({ status, code, message }), validation pipe
    database/                   DrizzleModule (pool, timeouts, snake_case casing), schema/, columns.ts
    redis/, queue/              ioredis (REDIS token), BullMQ (root connection and job defaults)
    health/                     /api/health (liveness), /api/health/ready (DB + Redis)
    request-id/, logging/       x-request-id, JSON logs with redact
  modules/<domain>/             domain modules — map in docs/architecture.md
    <domain>.module.ts
    <domain>.controller.ts      thin: contract → service
    <domain>.service.ts         business rules and object-level permission checks
    <domain>.repository.ts      the only place with Drizzle queries to the domain's tables
    *.spec.ts                   next to it
```
- Dependencies — via DI with an **explicit `@Inject(Token)`** in the constructor (Vitest does not emit decorator metadata).
- Domains communicate through the modules' public services (exports), not through other domains' repositories/tables.
- A service knows nothing about HTTP: it does not accept `Request`/`Response`, does not throw anything "HTTP-specific"
  except `apiException`; it can be called from a controller, a queue job or a script.
- Domain business rules (can an opinion be changed, does a day count toward a streak) — pure functions in
  `<domain>.rules.ts`, the service orchestrates them: this way the rules are testable without a DB.
- Mapping a DB row to a response DTO — in one domain function (`toOpinionDto`), not spread across endpoints.
- Time — via an injectable clock (the `Clock` provider), not `new Date()` in business logic: streaks and the
  "question of the day" depend on date and time zone and must be tested deterministically.

## Contracts and routes

- Every endpoint is `@Endpoint(contract)` (`.claude/rules/contracts.md`). Without it the application does not start
  (`contract-coverage`). The response is cut by the schema; a mismatch is a 500 and a log entry (this is a bug,
  fix the contract or the code).
- Input — `@ContractParams/@ContractQuery/@ContractBody(contract)`, types — `ParamsOutput<typeof c>` etc.
  A bare `@Body()` without a schema is forbidden.
- Access — `access` in the contract. Permissions on a specific object (IDOR) — in the service: "this user may perform
  this action on this id". No permission on someone else's object — 404 (do not reveal existence), except explicitly public ones.
- Errors — `throw apiException({ status: 404, code: 'NOT_FOUND', message: 'Мнение не найдено' })`; the code comes from `apiErrorCodeSchema`.
  The message is for a human, without internal details. 5xx outward are always generic.

## Data (Drizzle + Postgres 18)

- Tables — `src/core/database/schema/<domain>.ts`, exported via `schema/index.ts`. In TS — camelCase,
  in the DB — snake_case (`casing: 'snake_case'`). PK — `id()` (uuidv7), time — `createdAt()`/`updatedAt()` (timestamptz).
- FK with an explicit `onDelete`; indexes for real queries; cursor lists — index `(created_at, id)`.
- A schema change → `yarn workspace api db:generate` → the SQL migration in `apps/api/drizzle/` is committed together with the code.
  Do not edit applied migrations. Destructive changes — in two steps (add → migrate → remove).
- Several writes that must be consistent — `db.transaction()`. External calls (LLM, Telegram)
  inside a transaction are forbidden.
- Queries — only via the Drizzle query builder / `sql` with parameters. String concatenation in SQL is forbidden.
- Privacy in the query: public selects filter "only for myself" in WHERE, not after the select.
- Pagination — cursor-based (`cursorPageQuerySchema`), `limit` ≤ 50. A select without a limit is forbidden.

## Security

- Rate limit — global `ThrottlerGuard` (currently in process memory). On sensitive endpoints (login, codes,
  submitting an opinion) — stricter, with a named throttler. With several api instances — storage in Redis
  (the choice of package is up to the owner). Behind a proxy — `trust proxy`, otherwise all clients appear under Caddy's IP.
- CORS — only `WEB_ORIGIN`. Session cookie — `__Host-session`, HttpOnly, Secure, SameSite=Lax.
- Logs — without personal data and secrets (logger with `redact`); every error record carries `requestId`.

## Fault tolerance

- The DB pool with timeouts (connection 5 s, query 10–15 s) is already configured; do not bypass it.
- Outgoing calls (Telegram, mail, LLM, payments) — with a timeout; retries only for idempotent ones; long and
  unreliable work (AI analysis, mailings, export, cards) — **only via the BullMQ queue**, not in the request handler.
  A job is idempotent (a repeat does not duplicate the result: key by entity/order id), attempts and backoff — from the
  `QueueModule` defaults. A payment/order — with an idempotency key.
- Resources (pools, connections, workers) are closed on shutdown — `enableShutdownHooks()` is enabled; check graceful
  shutdown in a Linux container (SIGTERM does not work on Windows).
- `/api/health` — liveness without dependencies; `/api/health/ready` — DB and Redis with a timeout, 503 on failure.

## Tests

- Unit (`src/**/*.spec.ts`) — services, repositories (DB replaced), guards, schemas. Coverage ≥ 80%.
- E2E (`test/*.e2e-spec.ts`) — HTTP via supertest on the application built by `configureApp`; DB and Redis
  replaced with `overrideProvider`. Check codes, the ApiError format, validation, access, limits.
- Integration (`test/integration/*.int-spec.ts`, `yarn workspace api test:int`) — real Postgres and Redis
  (`docker compose up -d --wait`): repositories, migrations, transactions. In CI — via services.
