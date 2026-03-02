-- 20260302100000: coupon_usages の DELETE ポリシーをスタッフも許可するよう修正
-- 問題: admin_delete_reservations_by_schedule_event_ids (SECURITY DEFINER) から
--       coupon_usages を削除しようとしても、RLSポリシーが is_org_admin() のみを
--       許可しているため、スタッフユーザーの場合に 409 エラーが発生
-- 
-- 原因: SECURITY DEFINER 関数でも、RLSポリシーの USING 句で使用される
--       is_org_admin() は JWT クレームを参照するため、呼び出し元ユーザーの
--       権限がチェックされる
--
-- 解決: DELETE ポリシーを is_staff_or_admin() に変更して、スタッフも許可

-- =====================
-- 1. coupon_usages の DELETE ポリシー修正
-- =====================
DROP POLICY IF EXISTS "coupon_usages_delete_admin" ON public.coupon_usages;
CREATE POLICY "coupon_usages_delete_staff_or_admin" ON public.coupon_usages
  FOR DELETE
  USING (is_staff_or_admin());

-- =====================
-- 2. gm_availability_responses の DELETE ポリシー修正
-- =====================
-- 問題: 他のスタッフが回答した gm_availability_responses は
--       「自分自身のスタッフID」条件を満たさないため削除できない
-- 解決: is_staff_or_admin() を使用して、スタッフ全員が削除可能に
DROP POLICY IF EXISTS "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses;
CREATE POLICY "gm_availability_responses_delete_staff_or_admin" ON public.gm_availability_responses
  FOR DELETE
  USING (is_staff_or_admin());

-- =====================
-- 3. 確認用NOTICE
-- =====================
DO $$
BEGIN
  RAISE NOTICE '✅ coupon_usages DELETE ポリシーを is_staff_or_admin() に修正しました';
  RAISE NOTICE '✅ gm_availability_responses DELETE ポリシーを is_staff_or_admin() に修正しました';
END $$;
