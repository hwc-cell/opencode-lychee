#!/bin/bash
# OpenCode-Lychee launcher — 从仓库源码直接运行 TUI
# 用法:
#   OpenCode-Lychee          -> 在当前目录的项目里启动 TUI (默认中文)
#   OpenCode-Lychee -s <id>  -> 继续指定会话
#   OpenCode-Lychee [args]   -> 透传给 CLI (--help / run / auth ...)
# 安装: cp packages/opencode/lychee.sh ~/.local/bin/OpenCode-Lychee && chmod +x ~/.local/bin/OpenCode-Lychee
# 语言: 默认中文, LYCHEE_LANG=en 强制英文
export OPENCODE_LANG="${LYCHEE_LANG:-zh}"
BUN="$HOME/.bun/bin/bun"
[ -x "$BUN" ] || BUN="$(command -v bun)"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$#" -eq 0 ]; then
  # 依赖从 repo 解析(--cwd), 但把位置参数设为用户的当前目录, 让会话属于当前项目
  exec "$BUN" run --cwd "$DIR" --conditions=browser src/index.ts "$PWD"
elif [[ " $* " == *" -s "* || " $* " == *" --session "* || " $* " == *" --continue "* ]]; then
  exec "$BUN" run --cwd "$DIR" --conditions=browser src/index.ts "$PWD" "$@"
else
  exec "$BUN" run --conditions=browser "$DIR/src/index.ts" "$@"
fi
