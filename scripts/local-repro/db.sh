#!/usr/bin/env bash
# 不具合再現用のローカル Supabase を操作する。
#   start   : 起動（初回はスキーマ取得も行う）
#   reset   : テストデータを入れ直す（seed.sql）
#   refresh : ステージングの最新スキーマ（構造のみ・データなし）を取り直して作り直す
#   stop    : 停止
# スキーマ取得にはステージングへの読み取りのみ行う。本番には接続しない。
set -euo pipefail
cd "$(dirname "$0")/../.."
WORKDIR=local-repro
STAGING_REF=lavutzztfqbdndjiwluc
SCHEMA=$WORKDIR/supabase/migrations/00000000000000_staging_schema.sql
EXCLUDE=vector,logflare,imgproxy,edge-runtime
SUPABASE=(npx --yes supabase)

dump_schema() {
  echo "ステージングのスキーマ（構造のみ）を取得します"
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/supabase"
  (cd "$tmp" && "${SUPABASE[@]}" link --project-ref "$STAGING_REF" </dev/null >/dev/null && "${SUPABASE[@]}" db dump --linked -f schema.sql </dev/null)
  mv "$tmp/schema.sql" "$SCHEMA"
  rm -rf "$tmp"
}

case "${1:-start}" in
  start)   [ -f "$SCHEMA" ] || dump_schema; "${SUPABASE[@]}" start --workdir "$WORKDIR" -x "$EXCLUDE" ;;
  reset)   "${SUPABASE[@]}" db reset --workdir "$WORKDIR" ;;
  refresh) dump_schema; "${SUPABASE[@]}" db reset --workdir "$WORKDIR" ;;
  stop)    "${SUPABASE[@]}" stop --workdir "$WORKDIR" --no-backup ;;
  *) echo "usage: $0 start|reset|refresh|stop" >&2; exit 2 ;;
esac
