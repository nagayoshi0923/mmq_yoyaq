#!/bin/bash

# Claude壁打ち→Codex実装のキュー配送ブリッジ(v2: サイレント失敗禁止・容量死フェイルオーバー)。
# 使い方: scripts/queue-to-codex.sh "YOYAQ_QUEUE_UPDATED ..." [--dry-run]
#   稼働中のCodex監督スレッドを自動発見し、codex exec resume でユーザー書き込みとして配送する。
#   配送後に受理検証を行い、コンテキスト満杯等の失敗を検知したら
#   新規ヘッドレスCodexを監督後継として起動し自動再配送する(結果は必ずstdoutに出す)。
# 環境変数:
#   YOYAQ_CODEX_SUPERVISOR_THREAD=<uuid>  自動発見を上書き
#   YOYAQ_CODEX_BIN                       codexバイナリの場所
#   YOYAQ_CODEX_SUPERVISOR_LOOKBACK_HOURS 発見対象の更新時刻窓(既定24)
#   YOYAQ_CODEX_VERIFY_WAIT_SECS          受理検証の待ち秒数(既定45)

set -uo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
CODEX_BIN="${YOYAQ_CODEX_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}"
SESSIONS_DIR="$HOME/.codex/sessions"
LOG_DIR="${TMPDIR:-/tmp}/yoyaq-queue-to-codex"
LOOKBACK_HOURS="${YOYAQ_CODEX_SUPERVISOR_LOOKBACK_HOURS:-24}"
VERIFY_WAIT="${YOYAQ_CODEX_VERIFY_WAIT_SECS:-45}"
STATE_FILE="$HOME/.codex/yoyaq-supervisor-thread"

msg="${1:?usage: scripts/queue-to-codex.sh \"YOYAQ_QUEUE_UPDATED ...\" [--dry-run]}"
dry_run=0
[[ "${2:-}" == "--dry-run" ]] && dry_run=1

if [[ ! -x "$CODEX_BIN" ]]; then
  echo "queue-to-codex: FAILED codexバイナリが見つかりません: $CODEX_BIN" >&2
  exit 127
fi

FATAL_PAT="ran out of room in the model's context window|stream disconnected|unauthorized|401|panicked"

# 監督スレッド発見: 状態ファイル優先→マーカー最多の最近スレッド
discover_supervisor_thread() {
  if [[ -f "$STATE_FILE" ]]; then
    local saved
    saved=$(cat "$STATE_FILE" 2>/dev/null | tr -d '[:space:]')
    if [[ ${#saved} -eq 36 ]] && ls "$SESSIONS_DIR"/**/rollout-*"$saved".jsonl >/dev/null 2>&1; then
      echo "$saved"; return 0
    fi
  fi
  local best_count=0 best_mtime=0 best_uuid="" f count mtime base uuid
  while IFS= read -r f; do
    head -c 2000 "$f" | grep -q "\"cwd\":\"$ROOT_DIR\"" || continue
    count=$(grep -c "QUEUE_CLAIMED\|EVENT_CLAIMED" "$f" 2>/dev/null) || count=0
    [[ "$count" -gt 0 ]] || continue
    mtime=$(stat -f '%m' "$f")
    base="${f##*/}"; base="${base%.jsonl}"; uuid="${base: -36}"
    if [[ "$count" -gt "$best_count" || ( "$count" -eq "$best_count" && "$mtime" -gt "$best_mtime" ) ]]; then
      best_count=$count; best_mtime=$mtime; best_uuid=$uuid
    fi
  done < <(find "$SESSIONS_DIR" -name "rollout-*.jsonl" -newermt "-${LOOKBACK_HOURS} hours" 2>/dev/null)
  [[ -n "$best_uuid" ]] && echo "$best_uuid"
}

# 配送+受理検証。$1=mode(resume/new) $2=thread(resume時)。戻り値0=受理、1=失敗。
deliver_and_verify() {
  local mode="$1" thread="${2:-}" log pid waited
  log="$LOG_DIR/$(date +%Y%m%dT%H%M%S)-$$-$mode.log"
  if [[ "$mode" == "resume" ]]; then
    printf '%s\n' "$msg" | nohup "$CODEX_BIN" exec resume "$thread" - >"$log" 2>&1 &
  else
    printf '%s\n' "(監督後継の起動: 旧監督スレッドが容量上限で交代。AGENTS.mdと docs/CODEX_DASHBOARD.md を読み監督役を引き継いだ上で、以下のイベントを処理せよ)
$msg" | nohup "$CODEX_BIN" exec - >"$log" 2>&1 &
  fi
  pid=$!
  waited=0
  while [[ $waited -lt $VERIFY_WAIT ]]; do
    sleep 3; waited=$((waited+3))
    if grep -qiE "$FATAL_PAT" "$log" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "queue-to-codex: 配送失敗を検知($mode)。log: $log"
      grep -iE "$FATAL_PAT" "$log" | head -2
      return 1
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      # プロセス終了: 致命エラーが無ければ受理とみなす
      if grep -qiE "$FATAL_PAT" "$log" 2>/dev/null; then
        echo "queue-to-codex: 配送失敗($mode)。log: $log"; return 1
      fi
      echo "queue-to-codex: 配送・処理完了($mode)。log: $log"; LAST_LOG="$log"; return 0
    fi
  done
  echo "queue-to-codex: 配送受理・処理継続中(${mode} / ${VERIFY_WAIT}秒間致命エラーなし)。log: $log"
  LAST_LOG="$log"
  return 0
}

# 新スレッドのUUIDを特定して状態ファイルへ保存(ベストエフォート)
record_new_thread() {
  sleep 2
  local f base uuid
  f=$(find "$SESSIONS_DIR" -name "rollout-*.jsonl" -newermt '-2 minutes' 2>/dev/null | while IFS= read -r x; do
        head -c 2000 "$x" | grep -q "\"cwd\":\"$ROOT_DIR\"" && echo "$x"
      done | while IFS= read -r x; do echo "$(stat -f '%m' "$x") $x"; done | sort -rn | head -1 | cut -d' ' -f2-)
  [[ -n "$f" ]] || return 0
  base="${f##*/}"; base="${base%.jsonl}"; uuid="${base: -36}"
  echo "$uuid" > "$STATE_FILE"
  echo "queue-to-codex: 新監督スレッド $uuid を状態ファイルに記録(以後の配送先)。"
}

thread="${YOYAQ_CODEX_SUPERVISOR_THREAD:-$(discover_supervisor_thread || true)}"

if [[ "$dry_run" -eq 1 ]]; then
  if [[ -n "$thread" ]]; then echo "dry-run: 監督スレッド $thread へ配送します。"
  else echo "dry-run: 監督未発見。新規Codexを監督として起動します。"; fi
  exit 0
fi

mkdir -p "$LOG_DIR"
cd "$ROOT_DIR"
LAST_LOG=""

if [[ -n "$thread" ]]; then
  echo "queue-to-codex: 監督スレッド $thread へ配送します。"
  if deliver_and_verify resume "$thread"; then
    exit 0
  fi
  echo "queue-to-codex: 既存監督が受理不能→新規監督スレッドへフェイルオーバーします。"
  rm -f "$STATE_FILE"
else
  echo "queue-to-codex: 監督未発見→新規監督スレッドを起動します。"
fi

if deliver_and_verify new; then
  record_new_thread
  exit 0
fi

echo "queue-to-codex: FAILED 新規監督への配送も失敗。手動確認が必要です。log: $LOG_DIR" >&2
exit 1
