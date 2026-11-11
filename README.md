# Untesis

A personal library of opinions: every day — one question, a short answer, and over time — a history of how views have
changed. Concept — [`Идеи.md`](Идеи.md), architecture and domain map — [`docs/architecture.md`](docs/architecture.md).

Currently ready: the promo landing with the WebGL hero (the **UNTESIS** wordmark made of ink droplets, clouds, a dotted
bust) and the infrastructure for the product's domains.

## Contents

| Package | What it is |
|---|---|
| `packages/contracts` | `@untesis/contracts` — zod API contracts and a typed client, shared by the frontend and the backend |
| `apps/web` | Next.js 16 (SSR for SEO), Feature-Sliced Design, Tailwind CSS 4 |
| `apps/api` | NestJS 12, Drizzle ORM + PostgreSQL 18, Redis 8 + BullMQ |
| `deploy/` | Production on a VPS: Docker Compose, Caddy (HTTPS), migrations in a separate container |

## Running

Requires Node 26 LTS (`.nvmrc`), Yarn 4 via corepack (`npm i -g corepack && corepack enable`) and Docker.

```bash
yarn install
docker compose up -d --wait
cp apps/api/.env.example apps/api/.env
yarn dev          # contracts (watch) + api :4000 + web :3000
```

Checks: `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build`, `yarn format:check`; everything at once —
`bash scripts/check.sh`. Backend integration tests (need docker compose): `yarn workspace api test:int`.

## Code rules

`.claude/rules/`: general (security, fault tolerance, tests, efficiency), contracts, frontend, backend, WebGL hero.

## Hero technologies

WebGL2 (GLSL), three.js and GSAP 3.12.5 (local, no CDN), the custom Untesis font
(`apps/web/public/assets/fonts/`, built by `scripts/build_final_untesis_font.py`).
