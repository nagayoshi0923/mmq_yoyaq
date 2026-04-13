-- ====================================================================
-- 修正: PostgREST はカラムレベル GRANT に非対応のためテーブルレベル SELECT を復元
--
-- PostgREST は table-level SELECT がないと 401 を返す。
-- カラムレベル GRANT（20260412100000, 20260412120000）では
-- stores, schedule_events, private_groups, private_group_members が
-- 本番で全く読めなくなっていた。
--
-- 対策: テーブルレベル SELECT を復元する。
-- PII 保護は RLS + SECURITY DEFINER RPC で引き続き担保する。
-- ====================================================================

-- 1. stores
REVOKE ALL ON public.stores FROM anon;
GRANT SELECT ON public.stores TO anon;

-- 2. schedule_events
REVOKE ALL ON public.schedule_events FROM anon;
GRANT SELECT ON public.schedule_events TO anon;

-- 3. private_groups
REVOKE ALL ON public.private_groups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_groups TO anon;

-- 4. private_group_members
REVOKE ALL ON public.private_group_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members TO anon;
