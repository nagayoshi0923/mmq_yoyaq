-- 20260302100002: reservations の DELETE ポリシーをスタッフも許可するよう修正
-- 問題: admin_delete_reservations_by_schedule_event_ids (SECURITY DEFINER) から
--       reservations を削除しようとしても、RLSポリシーが is_org_admin() のみを
--       許可しているため、スタッフユーザーの場合に 409 エラーが発生
-- 
-- 原因: SECURITY DEFINER 関数でも、RLSポリシーの USING 句で使用される
--       is_org_admin() は JWT クレームを参照するため、呼び出し元ユーザーの
--       権限がチェックされる
--
-- 解決: DELETE ポリシーを is_staff_or_admin() に変更して、スタッフも許可
--       （スタッフは自分の組織の予約のみ削除可能）

-- =====================
-- 1. 既存のDELETEポリシーを削除
-- =====================
DROP POLICY IF EXISTS "reservations_delete_unified" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_strict" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_admin" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_own_org" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_staff_or_admin" ON public.reservations;

-- =====================
-- 2. 新しいDELETEポリシーを作成
-- =====================
-- スタッフと管理者が自分の組織の予約を削除可能
CREATE POLICY "reservations_delete_staff_or_admin" ON public.reservations
  FOR DELETE
  USING (
    is_staff_or_admin() AND organization_id = get_user_organization_id()
  );

-- =====================
-- 3. 確認用NOTICE
-- =====================
DO $$
BEGIN
  RAISE NOTICE '✅ reservations DELETE ポリシーを is_staff_or_admin() に修正しました';
END $$;
