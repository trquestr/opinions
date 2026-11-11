---
paths:
  - "packages/contracts/**"
  - "apps/api/src/**"
  - "apps/web/src/shared/api/**"
---

# Контракты API (`packages/contracts`, `@opinions/contracts`)

Контракт — единственный источник правды о ручке: метод, путь, доступ, схемы params/query/body/ответа.
Бэк и фронт используют один и тот же объект; типы выводятся из zod-схем, вручную интерфейсы ответа не пишутся.

## Как добавить ручку

1. Схемы домена — `packages/contracts/src/<домен>/schemas.ts` из примитивов `core/primitives.ts`
   (`idSchema`, `isoDateTimeSchema`, `userText({ max })`), списки — `cursorPageQuerySchema` / `cursorPageSchema(item)`.
2. Контракт — `packages/contracts/src/<домен>/endpoints.ts`:
   ```ts
   export const getOpinionContract = defineEndpoint({
     method: 'GET',
     path: '/opinions/:opinionId',
     access: 'public',          // 'public' | 'user' — обязателен, проверяется глобальным guard'ом
     params: z.object({ opinionId: idSchema }),
     response: opinionSchema,
   });
   ```
   `defineEndpoint` не скомпилирует: params, не совпавшие с `:name` в пути; тело у GET/DELETE; контракт без `access`.
3. Экспорт — через `src/<домен>/index.ts` и корневой `src/index.ts`. Тест схем рядом (`*.test.ts`), для типов — `expectTypeOf`.
4. `yarn workspace @opinions/contracts build` (или `yarn dev` — там watch).
5. Бэк: `@Endpoint(contract)` на методе контроллера + `@ContractParams/@ContractQuery/@ContractBody(contract)` на аргументах,
   типы аргументов — `ParamsOutput<typeof c>` / `QueryOutput` / `BodyOutput`, возврат — `Promise<ResponseInput<typeof c>>`.
6. Фронт: `serverApi.call(contract, { params })` / `browserApi.call(...)` — результат уже `ResponseOutput<typeof c>`.

## Правила

- В пакете — только схемы, типы и чистые функции. Никакого доступа к БД, env, DOM, Nest, Next.
- Схемы запроса без преобразований, меняющих тип (строка → Date и т.п.): клиент проверяет вход до отправки,
  сервер — повторно. Преобразования (`.transform`) — только в схемах ответа.
- Ответ — DTO под экран/сценарий, а не строка таблицы. Приватные поля (email, флаги модерации) в публичные
  схемы не попадают: ответ режется схемой, лишнего не уйдёт.
- Совместимость: новое поле ответа — можно; новое обязательное поле запроса, удаление/переименование поля — только
  новой версией ручки (`/v2/...`) и миграцией клиентов в том же изменении.
- Ошибки — только общий `apiErrorSchema`; машинный код из `apiErrorCodeSchema` (расширять добавлением).
- Лимиты пишутся в схеме (длина текста, размер массивов, `limit` страницы ≤ 50) — это и есть защита от больших тел.
