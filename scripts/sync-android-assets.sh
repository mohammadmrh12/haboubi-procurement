#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DEST="$ROOT/android-app/app/src/main/assets/www"
mkdir -p "$DEST"
for f in app.js forms-addon.js styles.css catalog-seed.js sw.js; do cp "$ROOT/$f" "$DEST/$f"; done
echo "Synced shared web assets to Android. Android-specific index/auth/update files were intentionally preserved."
