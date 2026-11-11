# General code rules

Basis: OWASP Top 10:2025, OWASP Node.js and REST Security Cheat Sheets, AWS Builders' Library
("Timeouts, retries and backoff with jitter"), Google TypeScript Style Guide, "Refactoring" (Fowler),
official docs of React 19, Next.js 16 and NestJS 12. Adapted for Untesis.
Four requirements of the owner, in priority order: **secure → resilient to failures → covered by tests → efficient**.
Any code follows these rules — your own, agents', generated. A deviation is allowed only with the owner's consent
and with a "why" comment in the code.

## Change boundaries — owner's rule

- **Do not change code that is not related to the task.** No "while at it" refactoring, renaming, reformatting
  or "improving" of a neighboring file. The diff contains only what the task needs.
- If it seems necessary for the task to touch something outside its scope (someone else's module, a shared config,
  the landing hero, dependencies) or you notice a bug nearby — **stop and ask the owner**, do not do it silently.
  List what you noticed outside the task in the report, do not fix it.
- For agents: everything outside the spec is a question in the report, not an edit.

## Documentation

- Before writing code that uses a library API — **context7** (`resolve-library-id` → `query-docs`), with the version
  from the lock file (Next `/vercel/next.js/v16.x`, Nest — `/websites/nestjs`). Do not trust your own memory about the
  APIs of Next 16, Nest 12, React 19.
- Next also ships the docs of its version in `node_modules/next/dist/docs/`; Nest — https://docs.nestjs.com/llms.txt.
- If it is not found in the docs — say so, do not guess a signature. Check against the `.d.ts` in `node_modules`.

## TypeScript

- Do not weaken `strict`. No `any` (if needed — `unknown` + narrowing), no `as` as a "stub" for types, no `!` non-null.
- External data (request, env, a third-party API response, `localStorage`, `JSON.parse`) is `unknown` until validated
  by a schema (zod).
- Derive types from schemas (`z.infer`), do not duplicate them by hand. Everything that crosses HTTP goes only through
  the `@untesis/contracts` contracts (`.claude/rules/contracts.md`); a hand-written API response `interface` is an error.
- Strictness is shared by all packages — `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, …); do not weaken it.
- States are discriminated unions (`{ status: 'loading' } | { status: 'ready'; data }`), not a set of boolean flags
  that can contradict each other. A `switch` over a union is exhaustive (the linter checks it).
- Enumerations are `as const` arrays / `z.enum`, not the TypeScript `enum`.
- Immutability by default: `const`, `readonly` in types, do not mutate arguments — return a new value.

## Code design

- **Keep it simple (KISS) and do only what is needed now (YAGNI).** Do not write "for the future": parameters, layers,
  abstractions and settings that the task does not require. Future domains are described in `docs/architecture.md` —
  that is enough.
- **Single responsibility.** A module, class or function does one thing and changes for one reason.
  Business rules are not mixed with transport (HTTP, queue), storage and presentation.
- **Pure core, effects at the edges.** Computations and domain rules are pure functions; I/O (DB, network, time,
  randomness, DOM) is at the edges and is passed inward as a parameter / via DI, so the core is testable without mocks.
- **Dependencies point in one direction**: FSD layers — downward; in Nest — controller → service → repository;
  packages — `apps/*` → `packages/contracts`, never the other way. Circular imports are forbidden (the linter checks it).
- A module exposes the minimum outward (public API via `index.ts` / the Nest module's `exports`); internals are not imported.
- Composition over inheritance; inheritance only from framework classes.
- Dead code, commented-out code, unused exports and parameters are removed in the same task in which they appeared.

## No duplicated logic

- One rule — one place. Logic that already exists is reused (import, extract into a function), not copied.
  Before writing a new function — look for an existing one (code graph, grep).
- Where shared things live: between front and back — `packages/contracts` (schemas, limits, pure functions);
  within the front — the lower FSD layer (`entities`, `shared`); within the back — the domain service or `core/`.
- Domain constants (answer length, page size, list of themes, timeouts) are declared once with a meaningful name,
  not as numbers in place. Input limits live in the contract schemas; front and back take them from there.
- Do not confuse this with premature abstraction: extract when the same **logic** appears a second time.
  Do not merge code that looks similar but has different meaning — a shared function with flags for each case is worse
  than a copy.
- If you find a duplicate outside your task — do not merge it silently, tell the owner (see "Change boundaries").

## Functions

- Short and flat: complexity ≤ 10, nesting ≤ 3, ≤ 60 lines, ≤ 3 parameters (more — an object with named fields).
  If exceeded — split into functions with descriptive names (the linter checks it).
- Early return and guard clauses instead of an `if/else` ladder; no nested ternaries; no `else` after `return`.
- No boolean flag parameters that change behavior (`save(data, true)`) — two functions or an options object.
- Parameters are not reassigned or mutated.
- A function either computes and returns, or performs an action — not both mixed (command-query separation).

## Naming

- Names come from the domain (`opinion`, `question`, `revision`, `streak`), identical in contracts, DB, back and front.
- Functions are verbs (`createOpinion`, `findDailyQuestion`), booleans — `is/has/can/should`, collections — plural.
- Units are in the name (`timeoutMs`, `ttlSeconds`, `sizeBytes`). No abbreviations except common ones (`id`, `url`, `db`).
- Files — `kebab-case`; React components — `PascalCase`; module constants — `UPPER_SNAKE_CASE`.

## Asynchrony

- Every promise is `await`ed, `return`ed or explicitly handled with `.catch` (the linter catches floating promises).
- Independent calls — `Promise.all`/`Promise.allSettled`, not sequential `await`s.
- `AbortSignal` is passed into long operations so that cancellation and timeouts work end to end.
- Timers, subscriptions, event listeners are always removed (`clearTimeout`, `removeEventListener`, unsubscribe in cleanup).

## Security

- **Trust nobody from outside**: every input is validated by a schema at the boundary — allowlist of fields, lengths,
  formats. Reject extra fields, do not silently ignore them.
- **Access is checked on every endpoint and on every object** (A01, IDOR): not "the page is already protected", but
  "this user may perform this action on this id".
- **Fail closed** (A10): an error in a permission or config check = denial, not a pass.
- Secrets come only from env, are validated at startup; never in code, logs, URLs, responses, the client bundle.
  On the front only `NEXT_PUBLIC_*` reaches the browser — do not put secrets there.
- Outward — no stack traces or internal messages; in the log — details with a correlation id.
- No `eval`, `new Function`, `child_process` with user input, `dangerouslySetInnerHTML` with unverified HTML.
- DB queries are only parameterized (ORM/query builder), never string concatenation.
- Session cookie — `HttpOnly`, `Secure`, `SameSite=Lax|Strict`. Tokens are not in the URL.
- Dependencies (A03): only by the owner's decision, exact versions in `yarn.lock`, `yarn install --immutable` in CI,
  `yarn npm audit` in CI. Do not include external scripts from a CDN — put them in `public/` with a pinned version.

## Resilience to failures

- **Timeout on every outgoing call** (HTTP, DB, queue): `AbortSignal.timeout(ms)` for `fetch`. No timeout is a bug.
- **Retries** — only for idempotent operations and only for transient failures (network, 5xx, 429), not for 4xx;
  with an attempt limit, exponential backoff with a cap, and jitter; retry at one level of the stack, not at every one.
- Non-idempotent writes that may be repeated (payment, creating an entity by a button) — with an idempotency key.
- Degrade instead of crashing: if an optional dependency is unavailable — return a partial response / fallback and log it.
- Do not swallow errors: `catch` either handles meaningfully or rethrows with context (`new Error(msg, { cause })`).
  An empty `catch {}` is forbidden. Do not leave promises without `await`/`.catch` (floating promises).
- `uncaughtException`/`unhandledRejection` — do not "fix" and continue: log and let the process crash,
  the supervisor will restart it. Graceful shutdown on SIGTERM — close the server and connections.
- Resources are bounded: request body size, query page size (pagination is mandatory), rate limit.

## Tests

- New code comes with tests in the same change. A fixed bug — first a failing test, then the fix.
- Coverage threshold — 80% of lines/branches/functions (configured in `vitest.config.*`); the threshold must not be lowered.
- Test behavior, not implementation: input → output, HTTP request → response, render → what the user sees.
- Must cover: invalid input, access denial, dependency failure (timeout/error), boundary values.
- External dependencies in tests are replaced (`overrideProvider`, `fetch` mocks); unit tests do not use the network.
- Do not weaken a test to make it pass (`skip`, `only`, widening `expect`, raising the timeout) — fix the code or
  explicitly agree it with the owner.
- Tests are deterministic: no real time (`vi.useFakeTimers`), no dependence on run order.
- Structure "arrange → act → assert"; one test — one behavior; the test name describes the behavior in Russian
  («отклоняет пустой ответ»), not the implementation.
- Tests contain no logic (loops with conditions, computing the expected value with the same algorithm) — the expected
  value is written explicitly.
- Test data via factories with reasonable defaults; the test shows only what matters for it.
- Minimum of mocks: boundaries are replaced (network, DB, time), not your own modules.

## Efficiency

- Measure first, then optimize; but the obvious things — right away: no N+1 queries, no sequential
  `await`s for independent calls (`Promise.all`), no synchronous I/O or heavy computation in a request handler.
- Queries use pagination and only the needed fields. Indexes — for real queries.
- Cache deliberately: explicit TTL and invalidation, no "eternal" in-process-memory caches without a limit.

## Style

- Formatting — only Prettier (`yarn format`), do not align by hand.
- Code comments are written in Russian, explain "why", not "what". Shaders and physics — in detail, with formulas.
  A module's public API (export from `index.ts`, a contract) — with a short JSDoc.
- `TODO` — only with a reason and a condition for removing it; commented-out code is not committed.
- Logs are structured, without personal data.

## Project documentation

- A change that alters the architecture, commands, structure or decisions updates `docs/architecture.md`,
  `CLAUDE.md`, the README and these rules **in the same change**. An outdated document is a bug.
- Documentation language is **English**: `CLAUDE.md`, `.claude/rules/`, `.claude/agents/`, `docs/`, READMEs and task
  briefs for agents. Not affected: replies to the owner (Russian), UI texts (Russian), code comments and test names
  (Russian, see "Style"), the owner's product notes `Идеи.md`.
- The product is called **Untesis** («Мнения» was an old working name — do not use it). Identifiers use `untesis`
  (`@untesis/contracts`, DB `untesis`); the word "opinion" is a domain concept (one short answer), not the product name.

## Automated checks

Some of the rules are checked by the linter, not by review. A violation = red `yarn lint`; a rule must not be silenced without the owner's consent.

| Rule | web (ESLint) | api (oxlint) |
|---|---|---|
| complexity ≤ 10, nesting ≤ 3, parameters ≤ 3, function ≤ 60 lines | `complexity`, `max-depth`, `max-params`, `max-lines-per-function` | same |
| no nested ternaries, `else` after `return`, parameter reassignment | `no-nested-ternary`, `no-else-return`, `no-param-reassign` | same |
| `const`, strict comparison | `prefer-const`, `eqeqeq` | same |
| exhaustive `switch` | `@typescript-eslint/switch-exhaustiveness-check` | `typescript/switch-exhaustiveness-check` |
| no circular or duplicate imports | `import/no-cycle`, `import/no-duplicates` | `import/no-cycle`, `import/no-duplicates` |
| no `any`, `!`, floating promises, with `import type` | `@typescript-eslint/*` | `typescript/*` |
| FSD layers and public APIs | Steiger | — |

Tests are exempt from the function length limit (`describe` blocks are long by nature).

## Self-check before handing over

1. The diff contains only the task (`git diff --stat`); nothing outside the task, or a question to the owner.
2. Logic is not duplicated; shared things are extracted to where they belong.
3. Inputs are validated, access is checked, external calls have timeouts, errors are not swallowed.
4. Tests for new behavior and for failures exist; `bash scripts/check.sh` is green; coverage has not dropped.
5. Documents are updated if what they describe has changed.
