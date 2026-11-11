#!/usr/bin/env bash
# Быстрые проверки одной командой: bash scripts/check.sh
# 1) node --check старых модулей героя, 2) все файлы из SCRIPTS в landing-scripts.tsx существуют,
# 3) typecheck, lint и тесты всех воркспейсов (контракты, web, api).
# Сборку (yarn build) не гоняет — она дольше; запускай перед коммитом отдельно.
cd "$(dirname "$0")/.." || exit 1
fail=0
err() { echo "FAIL: $*"; fail=1; }
loader=apps/web/src/_pages/home/ui/landing-scripts.tsx
pub=apps/web/public

for f in landing.js cloud-relief.js; do
  out=$(node --check "$pub/js/$f" 2>&1) || err "syntax $f: $(echo "$out" | grep -m1 -E 'Error|error')"
done

for ref in $(grep -oE '"/js/[^"?]+' "$loader" | sed 's/^"//'); do
  [ -e "$pub$ref" ] || err "нет файла: $pub$ref"
done

yarn typecheck >/dev/null 2>&1 || err "типы (yarn typecheck)"
yarn lint >/dev/null 2>&1 || err "lint (yarn lint)"
yarn test >/dev/null 2>&1 || err "тесты (yarn test)"

[ $fail -eq 0 ] && echo "check: OK" || exit 1
