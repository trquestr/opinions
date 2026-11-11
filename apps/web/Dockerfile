# syntax=docker/dockerfile:1
# Образ apps/web (Next standalone). Контекст сборки — КОРЕНЬ репозитория:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL=https://example.com -t opinions/web .
#
# Тег node:26.13-alpine закреплён по .nvmrc (26.13.0); существование тега проверяет CI (docker build).

FROM node:26.13-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node 26 не несёт corepack - ставим и включаем, Yarn 4 берётся из packageManager в package.json.
RUN npm i -g corepack@latest && corepack enable

# ---- deps ----
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Корневой postinstall собирает @opinions/contracts (tsc), поэтому его исходники нужны уже на этом шаге.
COPY packages/contracts packages/contracts
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable

# ---- build ----
FROM deps AS build
# NEXT_PUBLIC_* вшиваются в бандл при СБОРКЕ - значение нужно передать build-аргументом.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY apps/web apps/web
RUN yarn workspace web build

# ---- runtime: .next/standalone ----
FROM node:26.13-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# Структура standalone в монорепо (outputFileTracingRoot = корень): ./node_modules и ./apps/web/server.js.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
# static и public standalone сам не копирует.
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
