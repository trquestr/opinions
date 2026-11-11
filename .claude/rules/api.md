---
paths:
  - "apps/api/**"
---

# Бэк: NestJS 12 (`apps/api`)

Источники: docs.nestjs.com (Security: helmet/rate limiting/CORS, Configuration, Validation, Lifecycle events,
Terminus, Testing), OWASP REST Security Cheat Sheet. Сверять через context7 `/websites/nestjs` или
https://docs.nestjs.com/llms.txt. Проект ESM: относительные импорты с `.js`.

## Структура

- Модуль на предметную область (`questions`, `opinions`, `users`): controller → service → repository/клиент.
  Контроллер тонкий: принять, провалидировать, вызвать сервис, вернуть DTO.
- Зависимости — через DI, не через `new` и не через глобальные синглтоны: иначе не подменить в тестах.
- Конфигурация — только через `ConfigService`; схема окружения — `src/config/env.schema.ts` (zod),
  обязательные значения — `getOrThrow`. Новая переменная = поле в схеме + `.env.example`.
- Общая настройка приложения (`useSecurityHeaders`, префикс `/api`, CORS, shutdown hooks) — в `src/configure-app.ts`,
  её же вызывают e2e-тесты. В `main.ts` — только bootstrap.

## Безопасность

- Вход: схема на каждом `@Body`/`@Param`/`@Query` (Standard Schema — `@Body({ schema })` со zod или
  `StandardSchemaValidationPipe`). Лишние поля — отклонять. Массивы — с лимитом длины.
- Каждый эндпоинт, кроме явно публичных, закрыт guard'ом аутентификации; права на объект проверяются в сервисе.
- Rate limit — глобальный `ThrottlerGuard`; на чувствительных ручках (вход, регистрация, отправка мнения) — строже,
  через именованный throttler. `@SkipThrottle()` — только для health. За прокси — настроить `trust proxy`.
  Несколько инстансов — общее хранилище лимитов (Redis), иначе лимит не работает.
- CORS — только origin из `WEB_ORIGIN`, без `*`.
- Ответы: только DTO (не сущности ORM), без лишних полей. Ошибки — через `HttpException`-наследников;
  500 наружу — без деталей. Для API-ответов с данными пользователя — `Cache-Control: no-store`.
- Коды ответа по смыслу: 400 валидация, 401/403 доступ, 404, 409 конфликт, 413 тело, 415 тип, 429 лимит.

## Отказоустойчивость

- `enableShutdownHooks()` включён: ресурсы (пулы БД, очереди, таймеры) закрывать в `onModuleDestroy`/
  `onApplicationShutdown`. Проверять graceful shutdown — в Linux/контейнере (SIGTERM на Windows не работает).
- Исходящие вызовы — с таймаутом; ретраи с backoff+jitter только для идемпотентных; для ретраев, таймаутов и
  circuit breaker — сначала смотреть `@nestjs/resilience`, идемпотентные ключи — `@nestjs/idempotency`.
- Health: `/api/health` — liveness (процесс жив, без внешних зависимостей). Когда появятся БД/кэш — отдельная
  readiness-ручка через `@nestjs/terminus` с `.withTimeout()` на каждый индикатор.
- Фоновые задачи — через очередь (`@nestjs/bullmq`), не `setTimeout` в обработчике запроса.

## Производительность

- Никакой блокирующей работы в обработчике (sync I/O, `bcrypt` sync, тяжёлый JSON) — в воркер/очередь.
- Списки — всегда с пагинацией (курсорной для лент мнений) и лимитом страницы.
- Независимые вызовы — `Promise.all`. Запросы к БД — без N+1.

## Тесты

- Unit (`src/**/*.spec.ts`) — сервисы и схемы, зависимости через `Test.createTestingModule` + `overrideProvider`.
- E2E (`test/*.e2e-spec.ts`) — HTTP через supertest на приложении, собранном `configureApp`;
  проверять коды, тело, заголовки безопасности, валидацию, доступ, rate limit. `app.close()` в конце.
- Покрытие ≥ 80% (`yarn workspace api test:cov`).
