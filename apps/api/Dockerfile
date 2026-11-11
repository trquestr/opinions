# syntax=docker/dockerfile:1
# Образ apps/api. Контекст сборки — КОРЕНЬ репозитория:
#   docker build -f apps/api/Dockerfile -t untesis/api .
#
# Тег node:26.13-alpine закреплён по .nvmrc (26.13.0); существование тега проверяет CI (docker build).

FROM node:26.13-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node 26 не несёт corepack - ставим и включаем, Yarn 4 берётся из packageManager в package.json.
RUN npm i -g corepack@latest && corepack enable

# ---- deps: полная установка (с dev) для сборки ----
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Корневой postinstall собирает @untesis/contracts (tsc), поэтому его исходники нужны уже на этом шаге.
COPY packages/contracts packages/contracts
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable

# ---- build: сборка api ----
FROM deps AS build
COPY apps/api apps/api
RUN yarn workspace api build
# Папки с миграциями может ещё не быть (до первой схемы) - пусть COPY в runtime не падает.
RUN mkdir -p apps/api/drizzle

# ---- prod-deps: только прод-зависимости api (и workspace-пакет contracts симлинком) ----
FROM base AS prod-deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
# Скрипты пакетов не запускаем: корневой postinstall собирает contracts через tsc, а здесь нет ни tsc, ни исходников
# (собранный dist копируется из build). Прод-зависимостям api нативная сборка не нужна (pg, ioredis, bullmq — чистый JS).
ENV YARN_ENABLE_SCRIPTS=false
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn workspaces focus api --production

# ---- runtime ----
FROM node:26.13-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000
# node_modules (в т.ч. симлинк @untesis/contracts -> packages/contracts) и package.json воркспейсов.
COPY --from=prod-deps /app/ ./
# Собранный contracts: резолвится через симлинк node_modules/@untesis/contracts.
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# Миграции: migrate.js ищет их в ../drizzle относительно dist.
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/main.js"]
