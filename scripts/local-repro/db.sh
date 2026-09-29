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

dump_schema() {
  echo "ステージングのスキーマ（構造のみ）を取得します"
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/supabase"
  (cd "$tmp" && supabase link --project-ref "$STAGING_REF" </dev/null >/dev/null && supabase db dump --linked -f schema.sql </dev/null)
  mv "$tmp/schema.sql" "$SCHEMA"
  rm -rf "$tmp"
}

case "${1:-start}" in
  start)   [ -f "$SCHEMA" ] || dump_schema; supabase start --workdir "$WORKDIR" -x "$EXCLUDE" ;;
  reset)   supabase db reset --workdir "$WORKDIR" ;;
  refresh) dump_schema; supabase db reset --workdir "$WORKDIR" ;;
  stop)    supabase stop --workdir "$WORKDIR" --no-backup ;;
  *) echo "usage: $0 start|reset|refresh|stop" >&2; exit 2 ;;
esac
