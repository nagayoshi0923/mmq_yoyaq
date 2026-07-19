#!/bin/bash

# Claude壁打ち→Codex実装のキュー配送ブリッジ。
# 使い方: scripts/queue-to-codex.sh "YOYAQ_QUEUE_UPDATED ..." [--dry-run]
#   稼働中のCodex監督スレッドを自動発見し、codex exec resume でユーザー書き込みとして配送する。
#   見つからなければ新規ヘッドレスCodexを起票タスクとして起動する
#   (AGENTS.md: 稼働中の監督が無ければ起票タスクが監督を引き継ぐ)。
# 環境変数:
#   MMQ_CODEX_SUPERVISOR_THREAD=<uuid>  自動発見を上書き
#   MMQ_CODEX_BIN                       codexバイナリの場所
#   MMQ_CODEX_SUPERVISOR_LOOKBACK_HOURS 発見対象の更新時刻窓(既定24)

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
CODEX_BIN="${MMQ_CODEX_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}"
SESSIONS_DIR="$HOME/.codex/sessions"
LOG_DIR="${TMPDIR:-/tmp}/mmq-studio-queue-to-codex"
LOOKBACK_HOURS="${MMQ_CODEX_SUPERVISOR_LOOKBACK_HOURS:-24}"

msg="${1:?usage: scripts/queue-to-codex.sh \"YOYAQ_QUEUE_UPDATED ...\" [--dry-run]}"
dry_run=0
[[ "${2:-}" == "--dry-run" ]] && dry_run=1

if [[ ! -x "$CODEX_BIN" ]]; then
  echo "queue-to-codex: codexバイナリが見つかりません: $CODEX_BIN" >&2
  exit 127
fi

# 監督スレッド発見: 直近LOOKBACK時間に更新された当リポジトリcwdのセッションのうち、
# 監督マーカー(QUEUE_CLAIMED/EVENT_CLAIMED)が最多のスレッドを選ぶ。
discover_supervisor_thread() {
  local best_count=0 best_mtime=0 best_uuid="" f count mtime base uuid
  while IFS= read -r f; do
    head -c 2000 "$f" | grep -q "\"cwd\":\"$ROOT_DIR\"" || continue
    count=$(grep -c "QUEUE_CLAIMED\|EVENT_CLAIMED" "$f" 2>/dev/null) || count=0
    [[ "$count" -gt 0 ]] || continue
    mtime=$(stat -f '%m' "$f")
    base="${f##*/}"
    base="${base%.jsonl}"
    uuid="${base: -36}"
    if [[ "$count" -gt "$best_count" || ( "$count" -eq "$best_count" && "$mtime" -gt "$best_mtime" ) ]]; then
      best_count=$count
      best_mtime=$mtime
      best_uuid=$uuid
    fi
  done < <(find "$SESSIONS_DIR" -name "rollout-*.jsonl" -newermt "-${LOOKBACK_HOURS} hours" 2>/dev/null)
  [[ -n "$best_uuid" ]] && echo "$best_uuid"
}

thread="${MMQ_CODEX_SUPERVISOR_THREAD:-$(discover_supervisor_thread || true)}"

if [[ "$dry_run" -eq 1 ]]; then
  if [[ -n "$thread" ]]; then
    echo "dry-run: 監督スレッド $thread へ配送します(codex exec resume)。"
  else
    echo "dry-run: 監督スレッド未発見。新規ヘッドレスCodexを起票タスクとして起動します。"
  fi
  exit 0
fi

mkdir -p "$LOG_DIR"
log="$LOG_DIR/$(date +%Y%m%dT%H%M%S)-$$.log"

cd "$ROOT_DIR"
if [[ -n "$thread" ]]; then
  echo "queue-to-codex: 監督スレッド $thread へ配送します。log: $log"
  printf '%s\n' "$msg" | nohup "$CODEX_BIN" exec resume "$thread" - >"$log" 2>&1 &
else
  echo "queue-to-codex: 監督未発見のため新規Codexを起票タスクとして起動します。log: $log"
  printf '%s\n' "$msg" | nohup "$CODEX_BIN" exec - >"$log" 2>&1 &
fi
echo "queue-to-codex: 配送プロセスをバックグラウンド起動しました(pid $!)。"
