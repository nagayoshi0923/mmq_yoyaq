-- ====================================================================
-- 緊急修正: authenticated の schedule_events SELECT 権限を復元
--
-- 問題:
--   20260414160000 で `REVOKE SELECT ON schedule_events FROM authenticated`
--   を実施したが、PostgREST はテーブルレベルの SELECT 権限を必須とする。
--   カラムレベル権限のみでは PostgREST 経由の SELECT がすべて 403 になる。
--   → スタッフのスケジュール管理・公演保存・GM確認が全滅。
--
-- 修正方針:
--   1. テーブルレベルの SELECT を authenticated に再付与
--   2. カラムレベル制限を撤去（PostgREST と非互換のため）
--   3. セキュリティは以下で担保する:
--      - schedule_events_public ビュー: 顧客向けページ（機密カラム除外）
--      - schedule_events_staff_view ビュー: スタッフ専用（is_staff_or_admin() チェック）
--      - RLS ポリシー: 行レベルアクセス制御
-- ====================================================================

-- テーブルレベル SELECT を復元
GRANT SELECT ON public.schedule_events TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 修正完了: schedule_events SELECT 権限を authenticated に再付与';
  RAISE NOTICE '  セキュリティ: schedule_events_public / schedule_events_staff_view で列フィルタを担保';
END $$;
