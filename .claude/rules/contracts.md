---
paths:
  - "packages/contracts/**"
  - "apps/api/src/**"
  - "apps/web/src/shared/api/**"
---

# API contracts (`packages/contracts`, `@untesis/contracts`)

A contract is the single source of truth about an endpoint: method, path, access, schemas of params/query/body/response.
Back and front use the same object; types are derived from zod schemas, response interfaces are not written by hand.

## How to add an endpoint

1. Domain schemas — `packages/contracts/src/<domain>/schemas.ts` built from the primitives in `core/primitives.ts`
   (`idSchema`, `isoDateTimeSchema`, `userText({ max })`), lists — `cursorPageQuerySchema` / `cursorPageSchema(item)`.
2. Contract — `packages/contracts/src/<domain>/endpoints.ts`:
   ```ts
   export const getOpinionContract = defineEndpoint({
     method: 'GET',
     path: '/opinions/:opinionId',
     access: 'public',          // 'public' | 'user' — required, checked by the global guard
     params: z.object({ opinionId: idSchema }),
     response: opinionSchema,
   });
   ```
   `defineEndpoint` will not compile: params that do not match `:name` in the path; a body on GET/DELETE; a contract without `access`.
3. Export — via `src/<domain>/index.ts` and the root `src/index.ts`. A schema test next to it (`*.test.ts`), for types — `expectTypeOf`.
4. `yarn workspace @untesis/contracts build` (or `yarn dev` — it has watch).
5. Back: `@Endpoint(contract)` on the controller method + `@ContractParams/@ContractQuery/@ContractBody(contract)` on the arguments,
   argument types — `ParamsOutput<typeof c>` / `QueryOutput` / `BodyOutput`, return — `Promise<ResponseInput<typeof c>>`.
6. Front: `serverApi.call(contract, { params })` / `browserApi.call(...)` — the result is already `ResponseOutput<typeof c>`.

## Rules

- The package contains only schemas, types and pure functions. No access to the DB, env, DOM, Nest, Next.
- Request schemas have no type-changing transformations (string → Date etc.): the client validates input before sending,
  the server validates again. Transformations (`.transform`) — only in response schemas.
- A response is a DTO for a screen/scenario, not a table row. Private fields (email, moderation flags) do not get into
  public schemas: the response is cut by the schema, nothing extra will leak.
- Compatibility: a new response field is allowed; a new required request field, or removing/renaming a field — only
  as a new endpoint version (`/v2/...`) and with client migration in the same change.
- Errors — only the common `apiErrorSchema`; machine code from `apiErrorCodeSchema` (extend by adding).
- Limits are written in the schema (text length, array sizes, page `limit` ≤ 50) — this is the protection against large bodies.
