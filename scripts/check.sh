#!/usr/bin/env bash
# Быстрые статические проверки лендинга одной командой: bash scripts/check.sh
# 1) node --check для JS, 2) index.html == landing.html,
# 3) все локальные src/href из index.html существуют, 4) изменённые CSS/JS без поднятого ?v=.
# Выводит только проблемы и итоговую строку; код возврата 1, если что-то не так.
cd "$(dirname "$0")/.." || exit 1
fail=0
err() { echo "FAIL: $*"; fail=1; }

for f in landing.js cloud-relief.js bust-section.js hero-ring.js fluid-cursor.js; do
  [ -f "$f" ] || continue
  out=$(node --check "$f" 2>&1) || err "syntax $f: $(echo "$out" | grep -m1 -E 'Error|error')"
done

diff -q index.html landing.html >/dev/null || err "index.html и landing.html различаются"

for ref in $(grep -oE '(src|href)="[^"#]+"' index.html | sed -E 's/^(src|href)="//; s/"$//; s/\?.*$//' | grep -vE '^(https?:)?//'); do
  [ -e "$ref" ] || err "нет файла: $ref"
done

# Файл изменён относительно HEAD, а строка с его ?v= в index.html — нет
changed=$(git diff --name-only HEAD -- '*.js' '*.css' 2>/dev/null)
for f in $changed; do
  grep -q "\"$f?v=" index.html || continue
  git diff HEAD -- index.html | grep -q "^+.*$f?v=" || err "$f изменён, а ?v= в HTML не поднят"
done

[ $fail -eq 0 ] && echo "check: OK" || exit 1
