#!/bin/bash
# Compatibility shim for source installs created before the OpenCode v2 package split.
LYCHEE_LEGACY_SOURCE="${BASH_SOURCE[0]}"
while [ -L "$LYCHEE_LEGACY_SOURCE" ]; do
  LYCHEE_LEGACY_DIR="$(cd -P "$(dirname "$LYCHEE_LEGACY_SOURCE")" >/dev/null 2>&1 && pwd)"
  LYCHEE_LEGACY_SOURCE="$(readlink "$LYCHEE_LEGACY_SOURCE")"
  [[ "$LYCHEE_LEGACY_SOURCE" != /* ]] && LYCHEE_LEGACY_SOURCE="$LYCHEE_LEGACY_DIR/$LYCHEE_LEGACY_SOURCE"
done
LYCHEE_LEGACY_DIR="$(cd -P "$(dirname "$LYCHEE_LEGACY_SOURCE")" >/dev/null 2>&1 && pwd)"
exec "$LYCHEE_LEGACY_DIR/../cli/lychee.sh" "$@"
