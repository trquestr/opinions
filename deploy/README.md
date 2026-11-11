# Деплой на VPS

Docker Compose: Caddy (HTTPS) -> web / api, Postgres, Redis. Наружу открыты только 80/443.
Все команды - из корня репозитория. Для краткости: `DC="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"`.

## Первый запуск

1. Направьте DNS домена на VPS, откройте порты 80, 443 (tcp) и 443 (udp).
2. `cp deploy/.env.example deploy/.env`, заполните (домен, **пароль Postgres**, DATABASE_URL, WEB_ORIGIN, NEXT_PUBLIC_SITE_URL).
3. `$DC up -d --build` - соберёт образы, применит миграции, поднимет сервисы.
4. `$DC ps` - все сервисы `healthy`, `migrate` - `exited (0)`.

## Обновление

`git pull && $DC up -d --build`. Миграции применяются автоматически перед стартом api.
Образы из реестра: задайте `REGISTRY`/`TAG` в `.env`, затем `$DC pull && $DC up -d`.

## Откат

`git checkout <предыдущий коммит> && $DC up -d --build` (или прежний `TAG` из реестра).
Применённые миграции назад не откатываются - деструктивные меняйте в два шага.

## Логи

`$DC logs -f --tail=100 api` (или `web`, `caddy`, `postgres`). Ротация: 5 файлов по 10 МБ на сервис.

## Бэкап Postgres

```
$DC exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz
```

Восстановление: `gunzip -c backup.sql.gz | $DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`.
