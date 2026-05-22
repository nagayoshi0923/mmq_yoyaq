#!/usr/bin/env bash
# anon が SELECT 可能なテーブルの RLS policy が anon-blocked テーブルを参照していないか監査する。
#
# 使い方:
#   ローカル:  bash scripts/audit-anon-rls-grants.sh  # staging に接続
#   CI:        SUPABASE_DB_STAGING_URL="postgresql://..." bash scripts/audit-anon-rls-grants.sh
#
# 1 行でも返れば exit 1 で CI を落とす。

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SQL_FILE="$SCRIPT_DIR/audit-anon-rls-grants.sql"

# DB URL を解決
if [ -n "${SUPABASE_DB_STAGING_URL:-}" ]; then
  DB_URL="$SUPABASE_DB_STAGING_URL"
elif [ -n "${SUPABASE_DB_STAGING_PASSWORD:-}" ]; then
  DB_URL="postgresql://postgres:${SUPABASE_DB_STAGING_PASSWORD}@db.lavutzztfqbdndjiwluc.supabase.co:5432/postgres"
elif command -v security >/dev/null 2>&1; then
  # macOS keychain
  PWD_VAL=$(security find-generic-password -s supabase-db-staging -a postgres -w 2>/dev/null || true)
  if [ -z "$PWD_VAL" ]; then
    echo "❌ ステージング DB のパスワードが取得できません。"
    echo "   SUPABASE_DB_STAGING_URL か SUPABASE_DB_STAGING_PASSWORD を環境変数で渡してください。"
    exit 2
  fi
  DB_URL="postgresql://postgres:${PWD_VAL}@db.lavutzztfqbdndjiwluc.supabase.co:5432/postgres"
else
  echo "❌ DB URL を解決できません。"
  exit 2
fi

# 監査 SQL を実行（ヘッダ抑制 + 末尾の "(N rows)" 抑制）
RESULT=$(psql "$DB_URL" --no-align --tuples-only --field-separator='|' -f "$SQL_FILE")

if [ -n "$RESULT" ]; then
  echo "🚨 anon RLS / GRANT 不整合を検出しました（401 時限爆弾）:"
  echo
  echo "host_table | policy | refs_anon_blocked"
  echo "$RESULT" | sed 's/^/  /'
  echo
  echo "対処: 参照先テーブルに GRANT SELECT ON ... TO anon を付与するか、policy を書き直してください。"
  echo "詳細: scripts/audit-anon-rls-grants.sql のコメント参照"
  exit 1
fi

echo "✅ anon RLS / GRANT 整合性: OK"
