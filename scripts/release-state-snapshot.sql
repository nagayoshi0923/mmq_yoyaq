-- 本番公開（2026-10 リリース統合）の前後照合用。DB 構造の写し（public の表・関数）では分からない「動いているもの」を読み取りだけで書き出す。
-- 1 行 = 種類 | 名前 | 値（タブ区切り）。値に秘密が入るもの（app_config・定期実行の本文）は md5 だけを出す。
-- 使い方: psql -X -At -F $'\t' -f scripts/release-state-snapshot.sql > before.tsv（後も同じ）→ node scripts/release-state-compare.mjs <forward|rollback|same> before.tsv after.tsv
SET default_transaction_read_only = on;
SELECT 'cron', jobname, concat_ws(' ', 'active=' || active, 'schedule=' || schedule, 'db=' || database, 'command_md5=' || md5(command))
  FROM cron.job ORDER BY jobname;
SELECT 'app_config', key, 'value_md5=' || md5(coalesce(value, '')) FROM public.app_config ORDER BY key;
SELECT 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, 'enabled=' || t.tgenabled::text
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'storage', 'auth') ORDER BY 2;
SELECT 'bucket', id, concat_ws(' ', 'public=' || public, 'size_limit=' || coalesce(file_size_limit::text, '-'),
  'mime=' || coalesce(array_to_string(allowed_mime_types, ','), '-')) FROM storage.buckets ORDER BY id;
SELECT 'storage_policy', tablename || '.' || policyname, concat_ws(' ', 'cmd=' || cmd, 'roles=' || array_to_string(roles, ','),
  'expr_md5=' || md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))) FROM pg_policies WHERE schemaname = 'storage' ORDER BY 2;
SELECT 'migration', version, 'applied' FROM supabase_migrations.schema_migrations WHERE version >= '20261010000000' ORDER BY version;
SELECT 'function_md5', p.proname, md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('create_private_booking_request', 'create_private_group_atomic', 'private_group_set_preferred_stores', 'private_booking_store_slot_rule', 'private_booking_store_day_slots')
 ORDER BY 2;
