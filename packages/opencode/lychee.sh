#!/bin/bash
# Compatibility shim for source installs created before the OpenCode v2 package split.
LYCHEE_LEGACY_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
exec "$LYCHEE_LEGACY_DIR/../cli/lychee.sh" "$@"
