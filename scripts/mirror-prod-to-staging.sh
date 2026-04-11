#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# 本番DB → ステージングDB データミラーリングスクリプト
#
# public スキーマのデータを本番からステージングにコピーする。
# スキーマ（テーブル定義）はコピーしない（マイグレーションで管理）。
# auth.users や supabase_migrations は対象外。
#
# 前提:
#   - macOS Keychain に supabase-db-prod / supabase-db-staging のパスワードが保存済み
#     または環境変数 PROD_DB_PASSWORD / STAGING_DB_PASSWORD を設定
#   - pg_dump / psql がインストール済み（brew install libpq）
# =============================================================================

PROD_PROJECT_REF="cznpcewciwywcqcxktba"
STAGING_PROJECT_REF="lavutzztfqbdndjiwluc"

PROD_HOST="db.${PROD_PROJECT_REF}.supabase.co"
STAGING_HOST="db.${STAGING_PROJECT_REF}.supabase.co"

DB_PORT="5432"
DB_USER="postgres"
DB_NAME="postgres"

DUMP_FILE="/tmp/mmq_prod_data_dump.sql"
RESTORE_FILE="/tmp/mmq_staging_restore.sql"
ERROR_LOG="/tmp/mmq_mirror_error.log"

echo "========================================="
echo "  本番DB → ステージングDB ミラーリング"
echo "========================================="
echo ""

# パスワードをキーチェーンまたは環境変数から取得
echo "[1/5] パスワードを取得..."
if [ -n "${PROD_DB_PASSWORD:-}" ] && [ -n "${STAGING_DB_PASSWORD:-}" ]; then
  PROD_PASSWORD="$PROD_DB_PASSWORD"
  STAGING_PASSWORD="$STAGING_DB_PASSWORD"
elif command -v security &> /dev/null; then
  PROD_PASSWORD=$(security find-generic-password -s supabase-db-prod -a postgres -w 2>/dev/null || true)
  STAGING_PASSWORD=$(security find-generic-password -s supabase-db-staging -a postgres -w 2>/dev/null || true)
fi

if [ -z "${PROD_PASSWORD:-}" ] || [ -z "${STAGING_PASSWORD:-}" ]; then
  echo "エラー: パスワードが取得できません"
  echo "  macOS: Keychain に supabase-db-prod / supabase-db-staging を登録"
  echo "  CI:    PROD_DB_PASSWORD / STAGING_DB_PASSWORD 環境変数を設定"
  exit 1
fi
echo "  OK"

staging_psql() {
  PGPASSWORD="$STAGING_PASSWORD" psql \
    -h "$STAGING_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -t -A "$@"
}

# pg_dump で本番データをダンプ（public スキーマのみ）
echo ""
echo "[2/5] 本番DBからデータをダンプ中..."

PGPASSWORD="$PROD_PASSWORD" pg_dump \
  -h "$PROD_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --exclude-table="supabase_migrations.schema_migrations" \
  > "$DUMP_FILE" 2>/dev/null

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  OK (${DUMP_SIZE})"

# ステージングDB情報を取得
echo ""
echo "[3/5] ステージングDB情報を取得..."

TABLES=$(staging_psql -c "
  SELECT string_agg('public.' || quote_ident(tablename), ', ')
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations');
")

FK_DROP=$(staging_psql -c "
  SELECT 'ALTER TABLE public.' || quote_ident(cls.relname)
    || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(con.conname) || ';'
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE con.contype = 'f' AND nsp.nspname = 'public';
")

# public→public のFK制約（通常の再作成）
FK_ADD_PUBLIC=$(staging_psql -c "
  SELECT 'ALTER TABLE public.' || quote_ident(cls.relname)
    || ' ADD CONSTRAINT ' || quote_ident(con.conname)
    || ' ' || pg_get_constraintdef(con.oid) || ';'
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
  JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_cls.relnamespace
  WHERE con.contype = 'f' AND nsp.nspname = 'public' AND ref_nsp.nspname = 'public';
")

# auth/storage等を参照するFK制約（NOT VALIDで再作成、既存データの整合性チェックをスキップ）
FK_ADD_CROSS=$(staging_psql -c "
  SELECT 'ALTER TABLE public.' || quote_ident(cls.relname)
    || ' ADD CONSTRAINT ' || quote_ident(con.conname)
    || ' ' || pg_get_constraintdef(con.oid) || ' NOT VALID;'
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
  JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_cls.relnamespace
  WHERE con.contype = 'f' AND nsp.nspname = 'public' AND ref_nsp.nspname != 'public';
")

TRIGGERS_DISABLE=$(staging_psql -c "
  SELECT 'ALTER TABLE public.' || quote_ident(event_object_table)
    || ' DISABLE TRIGGER ' || quote_ident(trigger_name) || ';'
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  GROUP BY event_object_table, trigger_name;
")

TRIGGERS_ENABLE=$(staging_psql -c "
  SELECT 'ALTER TABLE public.' || quote_ident(event_object_table)
    || ' ENABLE TRIGGER ' || quote_ident(trigger_name) || ';'
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  GROUP BY event_object_table, trigger_name;
")

echo "  OK"

# リストアSQL組み立て＆実行
echo ""
echo "[4/5] ステージングDBにリストア中..."

{
  echo "BEGIN;"
  echo ""
  echo "-- 1. FK制約を全てDROP"
  echo "$FK_DROP"
  echo ""
  echo "-- 2. ユーザー定義トリガーを無効化"
  echo "$TRIGGERS_DISABLE"
  echo ""
  echo "-- 3. 既存データをクリア"
  echo "TRUNCATE ${TABLES} CASCADE;"
  echo ""
  echo "-- 4. 本番データをリストア"
  cat "$DUMP_FILE"
  echo ""
  echo "-- 5. search_path復元（pg_dumpが空にするため）"
  echo "SET search_path = public, pg_catalog;"
  echo ""
  echo "-- 6. ユーザー定義トリガーを再有効化"
  echo "$TRIGGERS_ENABLE"
  echo ""
  echo "-- 7. public→public FK制約を再作成"
  echo "$FK_ADD_PUBLIC"
  echo ""
  echo "-- 8. auth/storage参照FK制約を NOT VALID で再作成"
  echo "$FK_ADD_CROSS"
  echo ""
  echo "COMMIT;"
} > "$RESTORE_FILE"

if ! PGPASSWORD="$STAGING_PASSWORD" psql \
  -h "$STAGING_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  -f "$RESTORE_FILE" \
  > /dev/null 2>"$ERROR_LOG"; then
  echo "  エラーが発生しました:"
  tail -5 "$ERROR_LOG"
  rm -f "$DUMP_FILE" "$RESTORE_FILE" "$ERROR_LOG"
  exit 1
fi
rm -f "$ERROR_LOG"

echo "  OK"

# クリーンアップ
echo ""
echo "[5/5] クリーンアップ..."
rm -f "$DUMP_FILE" "$RESTORE_FILE"
echo "  OK"

echo ""
echo "========================================="
echo "  ミラーリング完了"
echo "========================================="
echo ""
echo "ステージングDBのデータが本番と同期されました。"
echo "ローカルでステージングDBに接続するには:"
echo "  npm run dev:staging"
echo ""
