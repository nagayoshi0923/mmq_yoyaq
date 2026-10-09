#!/usr/bin/env bash
# 手元の開発用 Supabase（Docker）を操作する。本番・staging には一切接続しない。
#
#   start  : 起動（初回は DB を作り、構造と試験データ supabase/seed.sql を入れる）
#   reset  : DB を作り直す（構造と試験データを入れ直す。手元のデータは消える）
#   stop   : 停止（データは残る）
#   status : 接続先とキーを表示
#   env    : status を環境変数形式で表示（scripts から使う）
#
# なぜ supabase/ を直接使わないか:
#   supabase/migrations の古い migration は、本番で画面操作により作られた表（authors など）を前提にしており、
#   空の DB に最初から流すと途中で止まる（20260211100001 で "relation public.authors does not exist"）。
#   そこで整備 1 で作った本番構造の基準 supabase/baseline/<版>_prod.sql と、それより新しい migration だけを
#   使い捨ての作業フォルダ .local-supabase/supabase/ に並べ、そこを --workdir にして起動する。
#   （scripts/check-db-baseline.sh と同じ組み立て方。設定 config.toml と seed.sql は supabase/ のものを写す）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

WORKDIR="$ROOT/.local-supabase"
SB="$WORKDIR/supabase"
SUPABASE=(npx --yes supabase)
# 手元で使わない部品（ログ収集・画像変換・Edge Functions の常駐・接続プール）は起動しない。
# Edge Functions を試すときは別途 `npm run supabase:functions:serve`。
EXCLUDE="${LOCAL_SUPABASE_EXCLUDE:-vector,logflare,imgproxy,edge-runtime,supavisor}"

prepare_workdir() {
  local baseline version
  baseline="$(ls supabase/baseline/*_prod.sql | sort | tail -1)"
  version="$(basename "$baseline" | cut -d_ -f1)"
  rm -rf "$SB/migrations"
  mkdir -p "$SB/migrations"
  # 認証メール（確認・パスワード再設定）のリンク先だけ手元の画面にする。それ以外の設定は supabase/config.toml と同じ
  sed -e 's|^site_url = .*|site_url = "http://localhost:5173"|' supabase/config.toml > "$SB/config.toml"
  cp supabase/seed.sql "$SB/seed.sql"
  [ -e "$SB/functions" ] || ln -s "$ROOT/supabase/functions" "$SB/functions"
  cp "$baseline" "$SB/migrations/${version}_baseline_prod.sql"
  for f in supabase/migrations/*.sql; do
    local v; v="$(basename "$f" | cut -d_ -f1)"
    if [[ "$v" > "$version" ]]; then cp "$f" "$SB/migrations/"; fi
  done
}

case "${1:-start}" in
  start)  prepare_workdir; "${SUPABASE[@]}" start --workdir "$WORKDIR" -x "$EXCLUDE" ;;
  reset)  prepare_workdir; "${SUPABASE[@]}" db reset --workdir "$WORKDIR" ;;
  stop)   "${SUPABASE[@]}" stop --workdir "$WORKDIR" ;;
  status) "${SUPABASE[@]}" status --workdir "$WORKDIR" ;;
  env)    "${SUPABASE[@]}" status --workdir "$WORKDIR" -o env ;;
  *) echo "usage: $0 start|reset|stop|status|env" >&2; exit 2 ;;
esac
