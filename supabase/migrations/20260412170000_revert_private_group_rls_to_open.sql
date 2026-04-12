-- ====================================================================
-- 緊急ロールバック: private_group_members / private_groups の RLS を元に戻す
-- ====================================================================

-- private_group_members: 全ロールに USING(true)
DROP POLICY IF EXISTS "private_group_members_select_anon" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_select_authenticated" ON public.private_group_members;
DROP POLICY IF EXISTS "private_group_members_select" ON public.private_group_members;

CREATE POLICY "private_group_members_select" ON public.private_group_members
  FOR SELECT
  USING (true);

-- private_groups: 全ロールに USING(true)
DROP POLICY IF EXISTS "private_groups_select_anon" ON public.private_groups;
DROP POLICY IF EXISTS "private_groups_select_authenticated" ON public.private_groups;
DROP POLICY IF EXISTS "private_groups_select" ON public.private_groups;

CREATE POLICY "private_groups_select" ON public.private_groups
  FOR SELECT
  USING (true);
