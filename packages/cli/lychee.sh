#!/bin/bash
# OpenCode-Lychee v2 launcher — run the fork directly from this checkout.
export OPENCODE_LANG="${LYCHEE_LANG:-zh}"
export OPENCODE_DISABLE_AUTOUPDATE="${OPENCODE_DISABLE_AUTOUPDATE:-1}"

LYCHEE_BUN="$HOME/.bun/bin/bun"
[ -x "$LYCHEE_BUN" ] || LYCHEE_BUN="$(command -v bun)"
if [ -z "$LYCHEE_BUN" ]; then
  echo "OpenCode-Lychee: 未找到 Bun，请先安装 Bun" >&2
  exit 127
fi

LYCHEE_SOURCE="${BASH_SOURCE[0]}"
while [ -L "$LYCHEE_SOURCE" ]; do
  LYCHEE_DIR="$(cd -P "$(dirname "$LYCHEE_SOURCE")" >/dev/null 2>&1 && pwd)"
  LYCHEE_SOURCE="$(readlink "$LYCHEE_SOURCE")"
  [[ "$LYCHEE_SOURCE" != /* ]] && LYCHEE_SOURCE="$LYCHEE_DIR/$LYCHEE_SOURCE"
done
LYCHEE_DIR="$(cd -P "$(dirname "$LYCHEE_SOURCE")" >/dev/null 2>&1 && pwd)"

if [ "$#" -eq 0 ]; then
  exec "$LYCHEE_BUN" run --cwd "$LYCHEE_DIR" src/index.ts "$PWD"
elif [[ " $* " == *" -s "* || " $* " == *" --session "* || " $* " == *" --continue "* ]]; then
  exec "$LYCHEE_BUN" run --cwd "$LYCHEE_DIR" src/index.ts "$PWD" "$@"
else
  exec "$LYCHEE_BUN" run --cwd "$LYCHEE_DIR" src/index.ts "$@"
fi
