---
paths:
  - "apps/web/**"
---

# Front: Next.js 16 + FSD + Tailwind 4 (`apps/web`)

Sources: Next.js docs v16 (Data Security, CSP, Error Handling, Testing), Feature-Sliced Design v2.1
(guide "Usage with Next.js"), Tailwind CSS v4. Verify via context7: `/vercel/next.js/v16.x`,
`/feature-sliced/documentation`, Tailwind.

## Architecture: Feature-Sliced Design

```
app/          Next routing — ONLY thin files: export { HomePage as default, metadata } from '@/_pages/home'
src/
  _app/       root layout, global styles (styles/globals.css), base metadata, robots, sitemap, providers
  _pages/     whole pages: composition of widgets/features + page metadata (home, errors, later question, profile…)
  widgets/    large self-contained blocks (daily-question, opinion-timeline, streak)
  features/   user actions (answer-question, revisit-opinion, share-opinion, auth-by-telegram)
  entities/   business entities and their presentation (question, opinion, topic, user)
  shared/     no business logic: api (clients), config (env, site), ui (kit), lib
```
- The `app`/`pages` layers are named `_app`/`_pages` (name conflict with Next); Steiger understands them as layers.
- Import **only downward** across layers and **only through a slice's public API** (`index.ts`): `@/entities/opinion`,
  not `@/entities/opinion/ui/card`. Slices of the same layer do not import each other (for entities — `@x` notation).
- Segments inside a slice: `ui/`, `model/` (types, state, metadata), `api/` (this slice's requests via `shared/api`),
  `lib/`, `config/`. Do not create empty layers and slices; a slice used by one page lives in that page.
- The map of future slices is `docs/architecture.md` ("Domain map"). Check — `yarn workspace web lint` (ESLint + Steiger).

## SSR and SEO — the main requirement

- Everything indexable (texts of questions and opinions, profiles, headings, links) is rendered **on the server**.
  Do not load content in `useEffect` / a client-side fetch.
- Server Components by default. `"use client"` — only on leaves with interactivity.
- Every page has `metadata`/`generateMetadata` in `_pages/<page>/model`: unique `title`,
  `description`, `alternates.canonical` (each page has its own!), OpenGraph. A public page goes into the `sitemap`.
  One `h1`, semantic tags. Opinion cards for sharing — OG images via `next/og`.
- Cache: `cacheComponents` is enabled — public data via `"use cache"` + `cacheLife` + `cacheTag`,
  personal data — dynamically under `<Suspense>`.

## Data and API

- Only through contracts (`.claude/rules/contracts.md`) and the `shared/api` clients:
  - `serverApi` (`@/shared/api/server`, server-only) — public data, no cookies, cacheable;
  - `userServerApi()` — on behalf of the user (forwards cookies, makes the render dynamic);
  - `browserApi` (`@/shared/api`) — from client components, same origin `/api`.
- Client errors: `ApiRequestError` (has `error.code`), `ApiNetworkError` (network/timeout), `ApiContractError` (a bug).
  Handle by `code`, not by text. An optional block failed — the page renders without it (Suspense + fallback).
- Environment — only via `shared/config` (zod): server (`server-env`, server-only) and public (`public-env`).
  Do not read `process.env` directly in code. `NEXT_PUBLIC_*` is inlined at build time.
- Mutations — Server Actions or `browserApi`; in a Server Action — validate input with the contract schema and check access.

## React

- A component does one task, up to ~100 lines; if it grows — extract subcomponents/hooks within the same slice.
- State is minimal: derived values are computed during render, not copied into `useState`.
- `useEffect` — only for synchronizing with an external system (DOM, subscription, third-party widget). Data, derived
  values and reactions to user actions — without effects (React: "You might not need an effect").
  Every effect with a subscription has a cleanup.
- External mutable state (localStorage, DOM attributes, window events) — via `useSyncExternalStore`.
- `key` in lists — a stable id, not the array index.
- `useMemo`/`useCallback`/`memo` — only after measurement or for a stable dependency, not "just in case".
- Forms and mutations — Server Actions + `useActionState`; validation — with the contract schema on the server, on the client — the same schema for hints.
- Logic (computations, data transformations) — in the slice's `model`/`lib` as pure functions, not inside JSX.
- Props have an explicit type; no "drilling" through many levels (lift the composition or extract into a slice context).

## Styles: Tailwind 4

- Tailwind utilities in markup; tokens (colors, fonts, spacing) — in `@theme` in `src/_app/styles/globals.css`,
  arbitrary values `[13px]` are an exception, not the norm. Join classes with `cx()` from `@/shared/lib`.
- **Two themes — light (default) and dark.** Colors — only via semantic tokens `background`,
  `foreground`, `muted`, `surface`, `border` (`bg-background`, `text-muted`, `border-border`…); values of both themes live
  in `globals.css` (`:root` and `[data-theme='dark']`). Hardcoded colors (`#000`, `bg-black`, `text-white`) in new UI
  are forbidden; a special case for dark — the `dark:` variant (works off the attribute, not the system theme).
  A new token goes into both themes at once, with a contrast check ≥ 4.5:1.
- Theme mechanism — `@/shared/lib/theme` (pre-paint script, `applyTheme`, `useTheme`), switcher —
  `@/features/theme-switch`. The root layout does not read cookies: the theme lives in localStorage, rendering stays static.
- The landing hero is always light (owner's decision) — do not include its `landing.css` in the themes.
- Repeating UI — a component in `shared/ui` (kit) or in a slice, not copy-pasted classes.
- Class order — Prettier (`prettier-plugin-tailwindcss`), do not sort by hand.
- Custom CSS — only for the hero (`_pages/home/landing.css`) and what utilities cannot express (animations, shaders).
- Accessibility: focus is visible, contrast ≥ 4.5:1, interactive elements are `<button>`/`<a>`, images have `alt`.

## Security

- Secrets and data access — on the server only; a client component receives a ready DTO.
- Security headers and CSP — `shared/config/security-headers.ts`. `script-src 'unsafe-inline'` is deliberate:
  pages are prerendered statically, a nonce requires dynamic rendering. Weaken the CSP only with a comment.
- Do not include external scripts from a CDN. `dangerouslySetInnerHTML` — only for JSON-LD from your own data.

## Performance

- Minimum client JS; heavy things — `next/dynamic`. Content images — `next/image` with dimensions.
- Core Web Vitals on mobile: LCP < 2.5 s, CLS < 0.1, INP < 200 ms.

## Tests

- Vitest + Testing Library, `*.test.ts(x)` next to the code; `server-only` is replaced in `test/server-only.ts`.
- Unit: components (what the user sees), model, metadata, env, api wrappers (fetch mocked).
- Vitest does not support async Server Components — E2E (Playwright, once scenarios appear).
- Coverage ≥ 80% (`yarn workspace web test:cov`).
