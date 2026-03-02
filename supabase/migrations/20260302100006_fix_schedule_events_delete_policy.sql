-- 20260302100006: schedule_events の削除ポリシーを修正
--
-- 問題: 削除ポリシーが is_org_admin() のみで、スタッフは削除できない
-- 解決策: is_staff_or_admin() に変更

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "schedule_events_delete_unified" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_delete_strict" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_delete_staff_or_admin" ON public.schedule_events;
DROP POLICY IF EXISTS "schedule_events_delete_own_org" ON public.schedule_events;

-- スタッフまたは管理者が削除可能なポリシーを作成
CREATE POLICY "schedule_events_delete_staff_or_admin" ON public.schedule_events
  FOR DELETE
  USING (
    is_staff_or_admin() AND organization_id = get_user_organization_id()
  );

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ schedule_events の削除ポリシーを修正しました';
  RAISE NOTICE '   - is_staff_or_admin() に変更（スタッフも削除可能）';
END $$;
