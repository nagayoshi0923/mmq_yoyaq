-- ====================================================================
-- 修正: authenticated ロールへのビュー SELECT 権限付与
--
-- 問題: セキュリティマイグレーション群（20260412100000 等）は anon のみを
--       対象に REVOKE/GRANT を行っていたが、organization_scenarios_with_master
--       ビューへの authenticated ロールの SELECT 権限が明示付与されていなかった。
--       これにより、ログインユーザーがシナリオ詳細ページで 403 エラーになっていた。
--
-- 原因: ビューを DROP+CREATE した際に既存の GRANT が消え、
--       authenticated への再付与が漏れていた。
-- ====================================================================

-- 1. organization_scenarios_with_master ビュー
GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;

-- 2. organization_scenarios テーブル（ビューの参照元, authenticated は未明示付与だった）
GRANT SELECT ON public.organization_scenarios TO authenticated;

-- 3. scenario_masters テーブル（ビューの参照元）
GRANT SELECT ON public.scenario_masters TO authenticated;

-- 確認ログ
DO $$
BEGIN
  RAISE NOTICE '✅ authenticated ロールへのSELECT権限を付与:';
  RAISE NOTICE '  - organization_scenarios_with_master (ビュー)';
  RAISE NOTICE '  - organization_scenarios (テーブル)';
  RAISE NOTICE '  - scenario_masters (テーブル)';
END $$;
