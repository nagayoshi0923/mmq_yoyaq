#!/bin/bash

# Codex→Claude セカンドオピニオンブリッジ。
# 使い方: scripts/ask-claude.sh "質問"
#   stdinをパイプすると追加文脈として渡る(例: git diff | scripts/ask-claude.sh "このdiffをレビューして")。
# 相談専用: Edit/Writeを渡さない。実装・コミット・状態変更は呼び出し側(Codex)の責務。

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE_BIN="${CLAUDE_ASK_BIN:-claude}"
CLAUDE_MODEL="${CLAUDE_ASK_MODEL:-claude-fable-5}"
CLAUDE_EFFORT="${CLAUDE_ASK_EFFORT:-high}"

if [[ $# -lt 1 || -z "$1" ]]; then
  echo "usage: scripts/ask-claude.sh \"質問\" (stdinで差分などの文脈を渡せる)" >&2
  exit 64
fi

if ! command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
  echo "ask-claude: Claude CLIが見つかりません。" >&2
  exit 127
fi

cd "$ROOT_DIR"
exec "$CLAUDE_BIN" -p "$1" \
  --model "$CLAUDE_MODEL" \
  --effort "$CLAUDE_EFFORT" \
  --permission-mode bypassPermissions \
  --tools "Bash,Read,Glob,Grep" \
  --name "YOYAQ ask-claude" \
  --no-session-persistence \
  --output-format text
