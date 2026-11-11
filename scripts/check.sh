#!/usr/bin/env bash
# Быстрые проверки одной командой: bash scripts/check.sh
# 1) node --check старых модулей героя, 2) все файлы из SCRIPTS в landing-scripts.tsx существуют,
# 3) изменённые public/js/*.js без поднятого ?v=, 4) lint обоих приложений, 5) тесты api.
# Сборку (yarn build) не гоняет — она дольше; запускай перед коммитом отдельно.
cd "$(dirname "$0")/.." || exit 1
fail=0
err() { echo "FAIL: $*"; fail=1; }
loader=apps/web/app/landing-scripts.tsx
pub=apps/web/public

for f in landing.js cloud-relief.js bust-section.js; do
  out=$(node --check "$pub/js/$f" 2>&1) || err "syntax $f: $(echo "$out" | grep -m1 -E 'Error|error')"
done

for ref in $(grep -oE '"/js/[^"?]+' "$loader" | sed 's/^"//'); do
  [ -e "$pub$ref" ] || err "нет файла: $pub$ref"
done

for f in $(git diff -M --name-only --diff-filter=M HEAD -- "$pub/js/*.js" 2>/dev/null); do
  name=${f#"$pub"}
  grep -q "\"$name?v=" "$loader" || continue
  git diff HEAD -- "$loader" | grep -q "^+.*$name?v=" || err "$name изменён, а ?v= в $loader не поднят"
done

yarn lint >/dev/null 2>&1 || err "lint (yarn lint)"
yarn test >/dev/null 2>&1 || err "тесты api (yarn test)"

[ $fail -eq 0 ] && echo "check: OK" || exit 1
