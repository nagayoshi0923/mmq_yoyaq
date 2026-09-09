-- Run with psql -v ON_ERROR_STOP=1; all fixtures are rolled back.
BEGIN;
CREATE TABLE public.qw_audit_private_fixture (id integer);
CREATE TABLE public.qw_audit_host_fixture (id integer);
REVOKE ALL ON public.qw_audit_private_fixture FROM anon;
GRANT SELECT ON public.qw_audit_host_fixture TO anon;
ALTER TABLE public.qw_audit_host_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY qw_public ON public.qw_audit_host_fixture FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.qw_audit_private_fixture));
CREATE POLICY qw_authenticated ON public.qw_audit_host_fixture FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.qw_audit_private_fixture));
CREATE POLICY qw_anon_all ON public.qw_audit_host_fixture FOR ALL TO anon USING (EXISTS (SELECT 1 FROM public.qw_audit_private_fixture));
CREATE TEMP TABLE qw_audit_results AS
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
    AND pol.polcmd IN ('r', '*')  -- SELECT and ALL policies
    AND (
      0 = ANY(pol.polroles)  -- PUBLIC applies to anon
      OR EXISTS (
        SELECT 1 FROM pg_roles r
        WHERE r.oid = ANY(pol.polroles) AND pg_has_role('anon', r.oid, 'USAGE')
      )
    )  -- authenticated-only policies are not evaluated for anon
    AND c.relname IN (SELECT table_name FROM anon_grants)  -- anon-accessible host
    AND EXISTS (
      SELECT 1 FROM anon_blocked b
      WHERE pg_get_expr(pol.polqual, pol.polrelid) ~ ('\m' || b.tablename || '\M')
    )
)
SELECT host_table, polname, refs_anon_blocked
FROM suspect_policies
ORDER BY host_table, polname;

DO $$ BEGIN
  IF (SELECT array_agg(polname::text ORDER BY polname) FROM qw_audit_results WHERE host_table='qw_audit_host_fixture') IS DISTINCT FROM ARRAY['qw_anon_all','qw_public'] THEN
    RAISE EXCEPTION 'audit must include anonymous SELECT/ALL policies and exclude authenticated-only policies';
  END IF;
END $$;
ROLLBACK;
