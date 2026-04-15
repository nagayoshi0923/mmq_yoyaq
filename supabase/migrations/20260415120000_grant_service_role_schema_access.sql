-- =============================================================================
-- 20260415120000: service_role に public スキーマへのアクセス権を明示的に付与
-- =============================================================================
--
-- 背景:
--   notify-gm-private-booking-confirmed などの Edge Function が
--   service_role で organization_settings テーブルを参照しようとすると
--   "permission denied for schema public" (42501) エラーになる。
--
--   標準 Supabase プロジェクトでは service_role には USAGE と ALL TABLES が
--   自動付与されるが、ステージング環境ではこのデフォルト付与が欠落していた。
--   rolbypassrls=true でも、スキーマ/テーブルレベルの権限は別途必要。
--
-- 適用影響:
--   - 既に権限がある環境（本番など）では GRANT は no-op なので安全。
--   - 将来作成されるテーブルにも自動で service_role 権限が付く。
--
-- =============================================================================

-- 1. スキーマレベルの USAGE 権限
GRANT USAGE ON SCHEMA public TO service_role;

-- 2. 既存テーブル・シーケンス・ファンクションへの全権限
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 3. 将来作成されるオブジェクトへのデフォルト権限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
