-- =============================================================================
-- 本番DB セキュリティ確認用SQL
-- =============================================================================
-- 実行場所: 本番 Supabase SQL Editor
-- 目的: is_admin / is_org_admin を使用する全関数と全ポリシーを確認
-- =============================================================================

-- =============================================================================
-- 1. is_admin / is_org_admin を参照する全関数を一覧
-- =============================================================================
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END AS security_type,
  n.nspname AS schema_name,
  LEFT(p.prosrc, 200) AS source_preview
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.prosrc ILIKE '%is_admin%' OR p.prosrc ILIKE '%is_org_admin%')
ORDER BY p.proname;

-- =============================================================================
-- 2. 全ポリシー一覧（テーブル名、ポリシー名、USING条件）
-- =============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  LEFT(qual::text, 300) AS using_condition,
  LEFT(with_check::text, 300) AS with_check_condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =============================================================================
-- 3. SECURITY DEFINER 関数に search_path が設定されているか確認
-- =============================================================================
SELECT 
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config_settings,
  CASE 
    WHEN 'search_path=public' = ANY(p.proconfig) THEN 'OK'
    WHEN p.proconfig IS NULL THEN '⚠️ search_path 未設定'
    WHEN NOT ('search_path=public' = ANY(p.proconfig)) THEN '⚠️ search_path が public でない'
    ELSE 'OK'
  END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

-- =============================================================================
-- 4. organization_id カラムを持つテーブルと RLS 有効状態
-- =============================================================================
SELECT 
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'organization_id'
  )
ORDER BY c.relname;

-- =============================================================================
-- 5. get_user_organization_id() を使っていない（is_admin/is_org_admin のみの）ポリシー
--    → 組織境界なしの危険なポリシーの候補
-- =============================================================================
SELECT 
  tablename,
  policyname,
  cmd,
  LEFT(qual::text, 300) AS using_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual::text ILIKE '%is_admin%' 
    OR qual::text ILIKE '%is_org_admin%'
  )
  AND qual::text NOT ILIKE '%get_user_organization_id%'
  AND qual::text NOT ILIKE '%organization_id%'
ORDER BY tablename, policyname;
