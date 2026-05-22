-- anon が SELECT 可能なテーブルの RLS policy が、anon に GRANT のないテーブルを参照していると
-- planner が permission denied (42501) を投げて PostgREST が 401 を返す時限爆弾になる。
--
-- このクエリは、その時限爆弾を検出する。1 行でも返れば CI を落とす。
--
-- 過去事例: 2026-05-22 にゲスト招待ページが Phase 2 RLS hardening 由来で 401 化した。
-- 参考: feedback_no_silent_scope_creep, project_org_scope_api_migration

WITH anon_grants AS (
  SELECT table_name FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee = 'anon'
    AND privilege_type = 'SELECT'
),
anon_blocked AS (
  -- anon が SELECT GRANT を持たない public テーブル
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN (SELECT table_name FROM anon_grants)
),
suspect_policies AS (
  SELECT
    c.relname AS host_table,
    pol.polname,
    (
      SELECT string_agg(b.tablename, ', ' ORDER BY b.tablename)
      FROM anon_blocked b
      WHERE pg_get_expr(pol.polqual, pol.polrelid) ~ ('\m' || b.tablename || '\M')
    ) AS refs_anon_blocked
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND pol.polcmd = 'r'  -- SELECT only
    AND c.relname IN (SELECT table_name FROM anon_grants)  -- anon-accessible host
    AND EXISTS (
      SELECT 1 FROM anon_blocked b
      WHERE pg_get_expr(pol.polqual, pol.polrelid) ~ ('\m' || b.tablename || '\M')
    )
)
SELECT host_table, polname, refs_anon_blocked
FROM suspect_policies
ORDER BY host_table, polname;
