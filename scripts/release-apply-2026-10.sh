#!/usr/bin/env bash
# 2026-10 本番公開（リリース統合 #1204）の DB 変更を 1 つの取引で当てる／戻す（docs/ops/本番公開の戻し方_2026-10.md の 2 章）。
#   forward : 公開前（144000 済み）→ 29 本＋reconcile。新しい定期実行 3 本・引き金 2 本は同じ取引で無効にして作り、履歴も同じ取引で記録する
#   rollback: 公開後 → reconcile と 29 本を戻し、144000 を当て直し、履歴を消す（同じ取引）
# 流れ: SQL を作る（scripts/release-bundle-2026-10.mjs、sha256 を表示）→ 前の照合（scripts/release-state-snapshot.sql）→ 1 取引で流す（所要を計測）
#       → 後の照合 → 比べる（scripts/release-state-compare.mjs）。失敗したら「何も変わっていない」ことを照合で確かめて終了コード 1。
# 接続は PG* の環境変数（PGHOST・PGUSER・PGDATABASE・PGPASSWORD など。パスワードを画面やコマンドに出さない）か DB_URL。
# 使い方: bash scripts/release-apply-2026-10.sh <forward|rollback> [作った SQL]   （OUT=保存先 の指定可。既定 release-run-<時刻>）
#   試験用（--test-sleep／--test-fail-after で作った）SQL は、接続先が手元（127.0.0.1／localhost）でなければ流さない。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"; BUNDLE="${2:-}"
[ "$MODE" = forward ] || [ "$MODE" = rollback ] || { echo "使い方: bash scripts/release-apply-2026-10.sh <forward|rollback> [SQL]"; exit 2; }
OUT="${OUT:-release-run-$(date +%Y%m%d-%H%M%S)-$MODE}"; mkdir -p "$OUT"
if [ -z "$BUNDLE" ]; then BUNDLE="$OUT/$MODE.sql"; node "$ROOT/scripts/release-bundle-2026-10.mjs" "$MODE" "$BUNDLE"; fi
CONN=(); [ -n "${DB_URL:-}" ] && CONN=("$DB_URL")
HOST="${DB_URL:-${PGHOST:-}}"
if head -1 "$BUNDLE" | grep -q TEST-BUNDLE && ! printf '%s' "$HOST" | grep -Eq '127\.0\.0\.1|localhost'; then
  echo "試験用の SQL は手元の DB 以外では流しません"; exit 2
fi
echo "SQL: $BUNDLE sha256=$(shasum -a 256 "$BUNDLE" | cut -d' ' -f1)"
snap() { psql ${CONN[@]+"${CONN[@]}"} -X -At -F $'\t' -v ON_ERROR_STOP=1 -f "$ROOT/scripts/release-state-snapshot.sql" > "$1"; }
snap "$OUT/before.tsv"
start=$(python3 -c 'import time; print(time.time())')
set +e
# 全体を 1 回の問い合わせで送る（-f だと 1 文ごとに往復し、本番〈往復 約 12 ms × 約 460 文〉では取引が数秒長くなり、その間ほかの接続を待たせる）。
# 途中の文で失敗すると残りは流れず、接続が切れて取引ごと取り消される。
[ "$(wc -c < "$BUNDLE")" -lt 900000 ] || { echo "SQL が大きすぎて 1 回で送れません"; exit 2; }
psql ${CONN[@]+"${CONN[@]}"} -X -q -v ON_ERROR_STOP=1 -c "$(cat "$BUNDLE")" > "$OUT/apply.log" 2>&1
rc=$?
set -e
end=$(python3 -c 'import time; print(time.time())')
echo "所要 $(python3 -c "print(round($end-$start,2))") 秒（終了コード ${rc}）"
snap "$OUT/after.tsv"
if [ "$rc" -ne 0 ]; then
  grep -E 'ERROR|FATAL' "$OUT/apply.log" | head -5
  echo "失敗: 取引ごと取り消された。何も変わっていないことを照合する"
  node "$ROOT/scripts/release-state-compare.mjs" same "$OUT/before.tsv" "$OUT/after.tsv"
  exit 1
fi
node "$ROOT/scripts/release-state-compare.mjs" "$MODE" "$OUT/before.tsv" "$OUT/after.tsv"
echo "記録: ${OUT}（SQL・照合の前後・ログ）"
