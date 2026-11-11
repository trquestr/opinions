# Deploying to a VPS

Docker Compose: Caddy (HTTPS) -> web / api, Postgres, Redis. Only 80/443 are exposed externally.
All commands are run from the repository root. For brevity: `DC="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"`.

## First run

1. Point the domain's DNS at the VPS, open ports 80, 443 (tcp) and 443 (udp).
2. `cp deploy/.env.example deploy/.env`, fill it in (domain, **Postgres password**, DATABASE_URL, WEB_ORIGIN, NEXT_PUBLIC_SITE_URL).
3. `$DC up -d --build` - builds the images, applies the migrations, starts the services.
4. `$DC ps` - all services are `healthy`, `migrate` is `exited (0)`.

## Updating

`git pull && $DC up -d --build`. Migrations are applied automatically before api starts.
Images from a registry: set `REGISTRY`/`TAG` in `.env`, then `$DC pull && $DC up -d`.

## Rollback

`git checkout <previous commit> && $DC up -d --build` (or the previous `TAG` from the registry).
Applied migrations are not rolled back - make destructive changes in two steps.

## Logs

`$DC logs -f --tail=100 api` (or `web`, `caddy`, `postgres`). Rotation: 5 files of 10 MB per service.

## Postgres backup

```
$DC exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz
```

Restore: `gunzip -c backup.sql.gz | $DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`.
