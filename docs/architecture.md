# Untesis architecture

This document records the decisions and the domain map. Product concept — in `Идеи.md`. Code rules — in `.claude/rules/`.
If you change a decision from this document, change the document in the same change.

## Accepted decisions

| Decision | Choice | Why |
|---|---|---|
| Monorepo | Yarn 4 workspaces: `apps/web`, `apps/api`, `packages/contracts` | Shared contracts without publishing packages, one install, one CI |
| Frontend | Next.js 16 App Router, SSR/prerender | SEO: the content of opinions and questions is indexed |
| Frontend architecture | Feature-Sliced Design (`_app`, `_pages`, `widgets`, `features`, `entities`, `shared`), Steiger linter | Predictable boundaries, imports only downward |
| Styles | Tailwind CSS 4 (tokens in `@theme`) | Fast markup without custom CSS modules; the landing hero is the exception (`landing.css`) |
| Themes | Light (default) and dark, soft monochrome; semantic tokens, choice stored in localStorage, pre-paint script | No flicker and no dynamic rendering (SEO); the landing hero is always light |
| Backend | NestJS 12 | A module per domain, DI, guards, first-class packages for queues/DB |
| Contracts | `@untesis/contracts`: zod endpoint schemas, types are derived from the schemas | One source of truth for the frontend and the backend, the response is validated on both sides |
| DB | PostgreSQL 18 + Drizzle ORM, drizzle-kit migrations (SQL in `apps/api/drizzle/`) | Schema in TS, close to SQL, `uuidv7()` in the database |
| Cache and queues | Redis 8 + BullMQ | Question of the day, revisits of old questions, reminders, AI analysis — background jobs |
| Sign-in | Telegram Login + email code (no passwords) | Telegram is the main sharing channel; email is the fallback |
| Sessions | Own session: an opaque id in the `__Host-session` cookie (HttpOnly, Secure, SameSite=Lax), a record in Postgres, sliding expiry | Instant session revocation, no JWTs in the browser |
| Production | Own VPS, Docker Compose: Caddy (HTTPS) → web / api, Postgres, Redis | One domain: `/api/*` → Nest, the rest → Next; cookie without CORS |

## Data flow

```
Browser ──► Caddy ──► /api/* ──► Nest (apps/api) ──► Postgres / Redis
                 └──► /*     ──► Next (apps/web) ──► (SSR) ──► Nest over the internal network (API_INTERNAL_URL)
```

- Public pages (question, opinion, profile) are rendered on the Next server: `serverApi` calls Nest without a cookie,
  responses are cached (`"use cache"` + tags). Personal data — `userServerApi()` with the session cookie (dynamic
  rendering).
- The browser calls the same origin `/api` (`browserApi`) — no CORS or third-party cookies needed.
- Every endpoint is described by a contract. Nest will not start if a route has no `@Endpoint(contract)`;
  the handler's response is run through the schema (extra fields are stripped, a mismatch = 500 + log).
- Errors of any origin use a single format, `ApiError` (`code`, `message`, `issues`, `requestId`).

## Domain map

Product layer → Nest module (`apps/api/src/modules/<domain>`), contracts (`packages/contracts/src/<domain>`),
FSD slices. "Layer 1" is built first; the rest only when needed, but the boundaries are already like this.

| Domain | What is inside | Product layer | FSD |
|---|---|---|---|
| `auth` | Telegram Login, email code, sessions, sign-out | 1 | `features/auth-by-telegram`, `features/auth-by-email` |
| `users` / `profiles` | User, public profile-library, handle, theme and "gray morality" settings, private by default | 1 | `entities/user`, `_pages/profile` |
| `topics` | Topics (work, money, relationships, ethics, technology…), the user's hidden topics, topic levels | 1 | `entities/topic`, `features/topic-filter` |
| `questions` | Question library, mood (lighter/sharper), sensitivity, "similar question" | 1 | `entities/question`, `_pages/question` |
| `daily` | Question of the day (scheduled selection, BullMQ job scheduler, the user's time zone) | 1 | `widgets/daily-question` |
| `opinions` | Opinion = position + short text + a "because" line, public / "for myself only" | 1 | `entities/opinion`, `features/answer-question` |
| `revisions` | Revisiting old questions, the "opinion changed" mark, drift timeline | 1 | `features/revisit-opinion`, `widgets/opinion-timeline` |
| `streaks` | Streak of consecutive days (by the user's calendar date) | 1 | `widgets/streak` |
| `cards` | Opinion card for Telegram/X (OG image via `next/og`), year in review | 1 | `features/share-opinion` |
| `search` | Search over one's own library, later — over questions and opinions (Postgres FTS) | 1–4 | `features/search` |
| `export` | Library export as a file (background job) | 1 | `features/export-library` |
| `social` | Reactions, "agree/disagree", comments, follows | 2 | `features/react-to-opinion`, `features/comment` |
| `moderation` | Reports, blocks, hiding comments | 2 | `features/report`, `features/block-user` |
| `matching` | "Like-minded", "opposite", "opinion twin" (answer vectors, recomputed in the background) | 2–4 | `widgets/like-minded` |
| `analysis` | Free: contradictions, map of views. Paid: AI analysis (background job, LLM) | 3 | `_pages/analysis` |
| `billing` | Payment for AI analysis, later — badges and effects | 3 | `features/purchase-analysis` |
| `achievements` | Achievements, badges, profile effects | 3 | `entities/achievement` |
| `notifications` | Reminders with a mood (Telegram bot, email), settings | 1–2 | `features/notification-settings` |
| `recommendations` | Similar topics, popular, "show those who think differently", selection settings | 4 | `widgets/recommendations` |

Deliberately absent (see `Идеи.md`): argument trees, mandatory "for/against", a general feed like Twitter's.

## Data: conventions

- Tables live in `apps/api/src/core/database/schema/<domain>.ts`, names in `snake_case`, PK `uuid` via `uuidv7()`,
  time — `timestamptz`, `created_at`/`updated_at` via the `columns.ts` helpers.
- Foreign keys with an explicit `ON DELETE`; indexes — for real queries (cursor lists — `(created_at, id)`).
- Privacy lives in the data, not in the UI: "for myself only" is filtered in the repository query, public endpoints
  physically never select private rows.
- Schema changes — only via migrations (`yarn workspace api db:generate`), migrations are not edited after commit.
- An opinion is not overwritten: a change of position is a new revision (this is the drift timeline).

## Background jobs (BullMQ)

| Queue | Jobs |
|---|---|
| `daily` | Selecting the question of the day, sending reminders by time zone |
| `revisits` | Selecting old questions for a revisit |
| `cards` | Rendering large cards and year-in-review |
| `export` | Assembling the library archive |
| `analysis` | AI analysis (long, with retries and idempotency by order id) |
| `matching` | Recomputing user similarity |

A job is idempotent (a retry does not duplicate the result), with an attempt limit and backoff (defaults are in `QueueModule`).

## Environments

- Locally: `docker compose up -d --wait` (Postgres + Redis), `yarn dev` (contracts in watch mode, api, web).
- Production: `deploy/` — the apps' Dockerfiles, `docker-compose.prod.yml`, `Caddyfile`; migrations — in a separate
  one-off container before api starts.
