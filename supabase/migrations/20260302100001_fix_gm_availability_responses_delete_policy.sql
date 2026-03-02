-- 20260302100001: gm_availability_responses の DELETE ポリシー修正
-- 問題: admin_delete_reservations_by_schedule_event_ids から gm_availability_responses を
--       削除しようとしても、他のスタッフの回答は「自分自身のスタッフID」条件を
--       満たさないため削除できない
-- 
-- 解決: DELETE ポリシーを is_staff_or_admin() に変更

-- =====================
-- 1. gm_availability_responses の DELETE ポリシー修正
-- =====================
DROP POLICY IF EXISTS "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses;
DROP POLICY IF EXISTS "gm_availability_responses_delete_staff_or_admin" ON public.gm_availability_responses;
CREATE POLICY "gm_availability_responses_delete_staff_or_admin" ON public.gm_availability_responses
  FOR DELETE
  USING (is_staff_or_admin());

-- =====================
-- 2. 確認用NOTICE
-- =====================
DO $$
BEGIN
  RAISE NOTICE '✅ gm_availability_responses DELETE ポリシーを is_staff_or_admin() に修正しました';
END $$;
