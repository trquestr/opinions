---
paths:
  - "apps/api/**"
---

# Бэк: NestJS 12 + Drizzle + Postgres 18 + Redis/BullMQ (`apps/api`)

Источники: docs.nestjs.com (Security, Configuration, Validation, Serialization, Lifecycle, Queues, Drizzle),
Drizzle ORM docs, OWASP REST Security Cheat Sheet. Сверять через context7 (`/websites/nestjs`, Drizzle) или
https://docs.nestjs.com/llms.txt. Проект ESM: относительные импорты с `.js`.

## Структура

```
src/
  main.ts, configure-app.ts     bootstrap; заголовки, префикс /api, CORS, body limit 100kb, request-id, shutdown hooks
  config/env.schema.ts          zod-схема окружения (новая переменная = поле здесь + .env.example + deploy/.env.example)
  core/                         инфраструктура, без бизнес-логики:
    contracts/                  @Endpoint, @ContractParams/@ContractQuery/@ContractBody, сериализация ответа, проверка покрытия
    access/                     глобальный guard по contract.access
    errors/                     фильтр → ApiError, apiException(status, code, message), пайп валидации
    database/                   DrizzleModule (пул, таймауты, casing snake_case), schema/, columns.ts
    redis/, queue/              ioredis (токен REDIS), BullMQ (root-подключение и дефолты задач)
    health/                     /api/health (liveness), /api/health/ready (БД + Redis)
    request-id/, logging/       x-request-id, JSON-логи с redact
  modules/<домен>/              доменные модули — карта в docs/architecture.md
    <домен>.module.ts
    <домен>.controller.ts       тонкий: контракт → сервис
    <домен>.service.ts          бизнес-правила и проверка прав на объект
    <домен>.repository.ts       единственное место с запросами Drizzle к таблицам домена
    *.spec.ts                   рядом
```
- Зависимости — через DI с **явным `@Inject(Token)`** в конструкторе (Vitest не эмитит decorator metadata).
- Домены общаются через публичные сервисы модулей (exports), а не через чужие репозитории/таблицы.

## Контракты и маршруты

- Каждая ручка — `@Endpoint(contract)` (`.claude/rules/contracts.md`). Без него приложение не стартует
  (`contract-coverage`). Ответ режется схемой; несовпадение — 500 и лог (это баг, чинить контракт или код).
- Вход — `@ContractParams/@ContractQuery/@ContractBody(contract)`, типы — `ParamsOutput<typeof c>` и т.д.
  Голые `@Body()` без схемы запрещены.
- Доступ — `access` в контракте. Права на конкретный объект (IDOR) — в сервисе: «этот пользователь может это
  действие над этим id». Нет прав на чужой объект — 404 (не раскрываем существование), кроме явно публичных.
- Ошибки — `throw apiException(404, 'NOT_FOUND', 'Мнение не найдено')`; код — из `apiErrorCodeSchema`.
  Сообщение — для человека, без внутренних деталей. 5xx наружу всегда общие.

## Данные (Drizzle + Postgres 18)

- Таблицы — `src/core/database/schema/<домен>.ts`, экспорт через `schema/index.ts`. В TS — camelCase,
  в БД — snake_case (`casing: 'snake_case'`). PK — `id()` (uuidv7), время — `createdAt()`/`updatedAt()` (timestamptz).
- FK с явным `onDelete`; индексы под реальные запросы; курсорные списки — индекс `(created_at, id)`.
- Изменение схемы → `yarn workspace api db:generate` → SQL-миграция в `apps/api/drizzle/` коммитится вместе с кодом.
  Применённые миграции не редактировать. Деструктивные изменения — в два шага (добавить → перенести → удалить).
- Несколько записей, которые должны быть согласованы, — `db.transaction()`. Внешние вызовы (LLM, Telegram)
  внутри транзакции запрещены.
- Запросы — только через Drizzle query builder / `sql` с параметрами. Склейка строк в SQL запрещена.
- Приватность в запросе: публичные выборки фильтруют «только для себя» в WHERE, а не после выборки.
- Пагинация — курсорная (`cursorPageQuerySchema`), `limit` ≤ 50. Выборка без лимита запрещена.

## Безопасность

- Rate limit — глобальный `ThrottlerGuard` (сейчас в памяти процесса). На чувствительных ручках (вход, коды,
  отправка мнения) — строже, именованным throttler'ом. При нескольких инстансах api — хранилище в Redis
  (решение о пакете — за владельцем). За прокси — `trust proxy`, иначе все клиенты видны под IP Caddy.
- CORS — только `WEB_ORIGIN`. Cookie сессии — `__Host-session`, HttpOnly, Secure, SameSite=Lax.
- Логи — без персональных данных и секретов (logger с `redact`); в каждой записи об ошибке — `requestId`.

## Отказоустойчивость

- Пул БД с таймаутами (подключение 5 с, запрос 10–15 с) — уже настроен; не обходить.
- Исходящие вызовы (Telegram, почта, LLM, платежи) — с таймаутом; ретраи только идемпотентных; долгое и
  ненадёжное (ИИ-разбор, рассылки, экспорт, карточки) — **только через очередь BullMQ**, не в обработчике запроса.
  Задача идемпотентна (повтор не дублирует результат: ключ по id сущности/заказа), попытки и backoff — из дефолтов
  `QueueModule`. Платёж/заказ — с ключом идемпотентности.
- Ресурсы (пулы, соединения, воркеры) закрываются при остановке — `enableShutdownHooks()` включён; graceful
  shutdown проверять в Linux-контейнере (SIGTERM на Windows не работает).
- `/api/health` — liveness без зависимостей; `/api/health/ready` — БД и Redis с таймаутом, 503 при отказе.

## Тесты

- Unit (`src/**/*.spec.ts`) — сервисы, репозитории (БД подменена), guard'ы, схемы. Покрытие ≥ 80%.
- E2E (`test/*.e2e-spec.ts`) — HTTP через supertest на приложении, собранном `configureApp`; БД и Redis
  подменены `overrideProvider`. Проверять коды, формат ApiError, валидацию, доступ, лимиты.
- Integration (`test/integration/*.int-spec.ts`, `yarn workspace api test:int`) — настоящие Postgres и Redis
  (`docker compose up -d --wait`): репозитории, миграции, транзакции. В CI — через services.
