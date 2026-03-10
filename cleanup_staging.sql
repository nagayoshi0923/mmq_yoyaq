-- =============================================================================
-- ステージングDB クリーンアップスクリプト
-- 本番ダンプをリストアする前に実行してください
-- =============================================================================

-- 外部キー制約を一時的に無効化
SET session_replication_role = 'replica';

-- public スキーマのすべてのテーブルを削除
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- public スキーマのすべてのビューを削除
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
    END LOOP;
END $$;

-- public スキーマのすべてのマテリアライズドビューを削除
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS public.' || quote_ident(r.matviewname) || ' CASCADE';
    END LOOP;
END $$;

-- public スキーマのすべての関数を削除
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace ns ON p.pronamespace = ns.oid
        WHERE ns.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- public スキーマのすべてのタイプ（ENUM含む）を削除
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace ns ON t.typnamespace = ns.oid
        WHERE ns.nspname = 'public'
          AND t.typtype = 'e'  -- ENUM types
    ) LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- 外部キー制約を再有効化
SET session_replication_role = 'origin';

-- 確認メッセージ
DO $$ BEGIN RAISE NOTICE 'Cleanup completed. Ready for schema restore.'; END $$;
