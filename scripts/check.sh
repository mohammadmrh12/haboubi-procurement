#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
printf '\n== JavaScript syntax ==\n'
for f in server.js app.js forms-addon.js auth.js sw.js; do node --check "$f"; printf 'PASS %s\n' "$f"; done
printf '\n== Shared Android asset parity ==\n'
for f in app.js forms-addon.js styles.css catalog-seed.js drug-aliases.js sw.js; do if ! cmp -s "$f" "android-app/app/src/main/assets/www/$f"; then echo "FAIL: Android asset differs: $f" >&2; exit 1; fi; printf 'PASS %s\n' "$f"; done
printf '\n== Parser tests ==\n'; node tests/import-parser.test.js; node tests/drug-search.test.js
printf '\n== Frontend contract tests ==\n'; node tests/frontend-contract.test.js
printf '\n== Auth/API smoke tests ==\n'; node tests/auth-smoke.js
printf '\n== Whitespace / patch check ==\n'; git diff --check; printf 'PASS git diff --check\n'
