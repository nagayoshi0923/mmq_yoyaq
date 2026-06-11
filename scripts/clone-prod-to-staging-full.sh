#!/usr/bin/env bash
# =============================================================================
# 本番DB → ステージングDB 完全複製スクリプト (auth 除外)
#
# 含めるもの:
#   - public スキーマ (table 定義 + データ + RLS + function)
#   - storage スキーマ (buckets / objects のメタデータ)
#   - storage 実ファイル (S3 blob、700件・380MB)
#
# 除外するもの:
#   - auth スキーマ (PII / ログインアカウント)
#   - supabase_migrations (両者既に同期済み・触らない)
#
# 使い方:
#   bash scripts/clone-prod-to-staging-full.sh phase1   # 各 phase 単独実行
#   bash scripts/clone-prod-to-staging-full.sh phase2
#   ...
#
# 各 phase の機能:
#   phase1: staging の現状フルバックアップを /tmp に出力 (read-only)
#   phase2: staging.public / staging.storage を DROP CASCADE (破壊)
#   phase3: pg_dump prod.public + storage → pg_restore to staging
#   phase4: storage 実ファイル (S3 blob) を prod から staging へ Storage API 経由でコピー
#   phase5: 検証 (件数比較・サンプル確認)
# =============================================================================

set -euo pipefail

PROD_REF="cznpcewciwywcqcxktba"
STAGING_REF="lavutzztfqbdndjiwluc"

PROD_HOST="db.${PROD_REF}.supabase.co"
STAGING_HOST="db.${STAGING_REF}.supabase.co"
DB_PORT=5432
DB_USER=postgres
DB_NAME=postgres

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/staging-backup-${TIMESTAMP}.sql.gz"
DUMP_FILE="/tmp/prod-clone-${TIMESTAMP}.dump"

# パスワード取得
PROD_PASSWORD=$(security find-generic-password -s supabase-db-prod -a postgres -w 2>/dev/null)
STAGING_PASSWORD=$(security find-generic-password -s supabase-db-staging -a postgres -w 2>/dev/null)

if [ -z "$PROD_PASSWORD" ] || [ -z "$STAGING_PASSWORD" ]; then
  echo "❌ Keychain から DB パスワードを取得できません。supabase-db-prod / supabase-db-staging を登録してください。"
  exit 2
fi

prod_psql() {
  PGPASSWORD="$PROD_PASSWORD" psql -h "$PROD_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}
staging_psql() {
  PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

phase1_backup_staging() {
  echo "========================================="
  echo " Phase 1: staging 現状を /tmp にバックアップ (read-only)"
  echo "========================================="
  echo "出力先: $BACKUP_FILE"

  PGPASSWORD="$STAGING_PASSWORD" pg_dump \
    -h "$STAGING_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --schema=public --schema=storage --schema=supabase_migrations \
    --no-owner --no-privileges \
    | gzip > "$BACKUP_FILE"

  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ バックアップ完了 (${SIZE})"
  echo
  echo "   復元したい場合: gunzip -c $BACKUP_FILE | psql 'STAGING_URL'"
}

phase2_drop_staging_schemas() {
  echo "========================================="
  echo " Phase 2: staging.public + staging.storage を DROP CASCADE"
  echo "========================================="
  echo "⚠️  staging の public・storage の全データ・全テーブル・全関数が消えます。"
  echo
  echo "現在の staging の public テーブル数:"
  staging_psql -tA -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"

  staging_psql <<'SQL'
-- 1) storage は内部スキーマなので一旦 truncate のみ (DROP すると extension が壊れる可能性)
TRUNCATE storage.objects, storage.buckets CASCADE;

-- 2) public は DROP → 後で pg_restore で作り直し
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
SQL

  echo "✅ Phase 2 完了"
}

phase3_dump_and_restore() {
  echo "========================================="
  echo " Phase 3: prod から public + storage を dump → staging に restore"
  echo "========================================="
  echo "出力先: $DUMP_FILE"

  # public のスキーマ + データ
  PGPASSWORD="$PROD_PASSWORD" pg_dump \
    -h "$PROD_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --schema=public \
    --no-owner --no-privileges \
    -Fc -f "${DUMP_FILE}.public" 2>&1 | grep -v "^pg_dump:" || true
  echo "  ✓ prod.public dump 完了"

  # storage はテーブルデータのみ (extension で作られた構造は staging 側にもある前提)
  PGPASSWORD="$PROD_PASSWORD" pg_dump \
    -h "$PROD_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --schema=storage --table=storage.buckets --table=storage.objects \
    --data-only \
    --no-owner --no-privileges \
    -Fc -f "${DUMP_FILE}.storage" 2>&1 | grep -v "^pg_dump:" || true
  echo "  ✓ prod.storage data dump 完了"

  # staging に restore
  PGPASSWORD="$STAGING_PASSWORD" pg_restore \
    -h "$STAGING_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --if-exists --clean \
    "${DUMP_FILE}.public" 2>&1 | tail -5 || true
  echo "  ✓ staging.public restore 完了"

  PGPASSWORD="$STAGING_PASSWORD" pg_restore \
    -h "$STAGING_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --data-only \
    "${DUMP_FILE}.storage" 2>&1 | tail -5 || true
  echo "  ✓ staging.storage data restore 完了"

  echo "✅ Phase 3 完了"
}

phase4_copy_storage_blobs() {
  echo "========================================="
  echo " Phase 4: storage 実ファイル (S3 blob) を prod → staging へコピー"
  echo "========================================="
  echo "対象: ${PROD_BLOB_COUNT:-700} 件 / ~380 MB"
  echo

  # service_role keys
  PROD_SR_KEY="${PROD_SUPABASE_SERVICE_ROLE_KEY:-}"
  STG_SR_KEY="${STG_SUPABASE_SERVICE_ROLE_KEY:-}"

  if [ -z "$PROD_SR_KEY" ] || [ -z "$STG_SR_KEY" ]; then
    echo "❌ 環境変数 PROD_SUPABASE_SERVICE_ROLE_KEY と STG_SUPABASE_SERVICE_ROLE_KEY が必要です。"
    echo "   Vercel の prod / staging 環境変数からコピーしてください。"
    return 2
  fi

  node scripts/clone-storage-blobs.mjs \
    --prod-url "https://${PROD_REF}.supabase.co" \
    --prod-key "$PROD_SR_KEY" \
    --staging-url "https://${STAGING_REF}.supabase.co" \
    --staging-key "$STG_SR_KEY"

  echo "✅ Phase 4 完了"
}

phase5_verify() {
  echo "========================================="
  echo " Phase 5: 検証"
  echo "========================================="

  echo "--- public 主要テーブルの件数比較 ---"
  for tbl in reservations customers users staff schedule_events private_groups; do
    PROD_C=$(prod_psql -tA -c "SELECT COUNT(*) FROM public.$tbl" 2>/dev/null || echo "?")
    STG_C=$(staging_psql -tA -c "SELECT COUNT(*) FROM public.$tbl" 2>/dev/null || echo "?")
    MARK=$([ "$PROD_C" = "$STG_C" ] && echo "✓" || echo "✗")
    printf "  %s %-25s prod=%s staging=%s\n" "$MARK" "$tbl" "$PROD_C" "$STG_C"
  done

  echo
  echo "--- storage.objects 件数比較 ---"
  PROD_OBJ=$(prod_psql -tA -c "SELECT COUNT(*) FROM storage.objects")
  STG_OBJ=$(staging_psql -tA -c "SELECT COUNT(*) FROM storage.objects")
  echo "  prod=$PROD_OBJ staging=$STG_OBJ"

  echo
  echo "--- schema_migrations 同期確認 ---"
  PROD_MIG=$(prod_psql -tA -c "SELECT COUNT(*) FROM supabase_migrations.schema_migrations")
  STG_MIG=$(staging_psql -tA -c "SELECT COUNT(*) FROM supabase_migrations.schema_migrations")
  echo "  prod=$PROD_MIG staging=$STG_MIG"

  echo
  echo "--- app_config 環境越えチェック ---"
  # 本番からの複製で app_config が本番値のままだと、staging のDBトリガーが
  # 本番の Edge Function を呼ぶ（2026-06-11 に実発生: staging の貸切申込が本番Bot経由で通知）
  EXPECTED_URL="https://$(echo "$STAGING_HOST" | sed 's/^db\.//')"
  CFG_URL=$(staging_psql -tA -c "SELECT value FROM app_config WHERE key='supabase_url'" 2>/dev/null || echo "")
  if [ "$CFG_URL" = "$EXPECTED_URL" ]; then
    echo "  OK (supabase_url = staging)"
  else
    echo "  🚨 app_config.supabase_url が staging を向いていません: $CFG_URL"
    echo "     以下を staging 値に更新すること:"
    echo "       UPDATE app_config SET value='$EXPECTED_URL' WHERE key='supabase_url';"
    echo "       UPDATE app_config SET value='<staging anon key>' WHERE key='supabase_anon_key';"
    echo "       UPDATE app_config SET value='<staging CRON_SECRET>' WHERE key='trigger_secret';"
  fi

  echo
  echo "✅ Phase 5 完了"
}

case "${1:-help}" in
  phase1) phase1_backup_staging ;;
  phase2) phase2_drop_staging_schemas ;;
  phase3) phase3_dump_and_restore ;;
  phase4) phase4_copy_storage_blobs ;;
  phase5) phase5_verify ;;
  help|*)
    echo "Usage: bash scripts/clone-prod-to-staging-full.sh <phase>"
    echo "  phase1: staging を /tmp にバックアップ (read-only)"
    echo "  phase2: staging.public + storage を DROP/TRUNCATE"
    echo "  phase3: prod から dump → staging に restore"
    echo "  phase4: storage 実ファイル (S3 blob) をコピー"
    echo "  phase5: 検証"
    ;;
esac
