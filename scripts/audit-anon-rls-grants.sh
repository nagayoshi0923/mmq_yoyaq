#!/usr/bin/env bash
# anon が SELECT 可能なテーブルの RLS policy が anon-blocked テーブルを参照していないか監査する。
#
# 接続方法 (優先順):
#   1. SUPABASE_ACCESS_TOKEN + STAGING_PROJECT_REF (CI 推奨, Management API 経由・HTTPS)
#   2. SUPABASE_DB_STAGING_URL (フル URL を直接指定)
#   3. SUPABASE_DB_STAGING_PASSWORD (直接 host 接続, ローカルのみ・GitHub Actions では IPv6 不通)
#   4. macOS Keychain (`supabase-db-staging`) (ローカル開発)
#
# 1 行でも返れば exit 1 で CI を落とす。

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SQL_FILE="$SCRIPT_DIR/audit-anon-rls-grants.sql"

STAGING_REF="${STAGING_PROJECT_REF:-lavutzztfqbdndjiwluc}"

run_via_management_api() {
  local sql
  sql=$(cat "$SQL_FILE")
  # JSON 文字列としてエスケープ
  local payload
  payload=$(jq -n --arg q "$sql" '{query: $q}')

  local response
  response=$(curl -fsS -X POST \
    "https://api.supabase.com/v1/projects/${STAGING_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  # response は配列。空配列なら OK。中身があれば不整合
  local row_count
  row_count=$(echo "$response" | jq 'length')

  if [ "$row_count" -gt 0 ]; then
    echo "🚨 anon RLS / GRANT 不整合を検出しました（401 時限爆弾）:"
    echo
    echo "$response" | jq -r '.[] | "  - \(.host_table) | \(.polname) | refs: \(.refs_anon_blocked)"'
    echo
    echo "対処: 参照先テーブルに GRANT SELECT ON ... TO anon を付与するか、policy を書き直してください。"
    echo "詳細: scripts/audit-anon-rls-grants.sql のコメント参照"
    exit 1
  fi
  echo "✅ anon RLS / GRANT 整合性: OK (Management API)"
}

run_via_psql() {
  local db_url="$1"
  local result
  result=$(psql "$db_url" --no-align --tuples-only --field-separator='|' -f "$SQL_FILE")
  if [ -n "$result" ]; then
    echo "🚨 anon RLS / GRANT 不整合を検出しました（401 時限爆弾）:"
    echo
    echo "host_table | policy | refs_anon_blocked"
    echo "$result" | sed 's/^/  /'
    echo
    echo "対処: 参照先テーブルに GRANT SELECT ON ... TO anon を付与するか、policy を書き直してください。"
    exit 1
  fi
  echo "✅ anon RLS / GRANT 整合性: OK (psql)"
}

# 1. Management API (CI 推奨)
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  run_via_management_api
  exit 0
fi

# 2. フル URL 指定
if [ -n "${SUPABASE_DB_STAGING_URL:-}" ]; then
  run_via_psql "$SUPABASE_DB_STAGING_URL"
  exit 0
fi

# 3. パスワード環境変数 (ローカル)
if [ -n "${SUPABASE_DB_STAGING_PASSWORD:-}" ]; then
  run_via_psql "postgresql://postgres:${SUPABASE_DB_STAGING_PASSWORD}@db.${STAGING_REF}.supabase.co:5432/postgres"
  exit 0
fi

# 4. macOS Keychain (ローカル開発)
if command -v security >/dev/null 2>&1; then
  PWD_VAL=$(security find-generic-password -s supabase-db-staging -a postgres -w 2>/dev/null || true)
  if [ -n "$PWD_VAL" ]; then
    run_via_psql "postgresql://postgres:${PWD_VAL}@db.${STAGING_REF}.supabase.co:5432/postgres"
    exit 0
  fi
fi

echo "❌ 接続情報が見つかりません。SUPABASE_ACCESS_TOKEN または SUPABASE_DB_STAGING_PASSWORD を設定してください。"
exit 2
