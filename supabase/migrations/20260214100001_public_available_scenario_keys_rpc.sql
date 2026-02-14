-- ============================================================
-- 公開シナリオキー取得RPC関数
-- ============================================================
-- 目的: 未ログインユーザーでも公開中のシナリオを表示できるようにする
-- 
-- 背景:
--   organization_scenarios と scenario_masters は
--   ペネトレーションテスト対応でstaff/admin限定のRLSに変更済み。
--   しかし予約サイト（公開ページ）では未ログインユーザーも
--   公開中のシナリオを確認できる必要がある。
--
-- 方式: 
--   SECURITY DEFINER（RLSバイパス）で必要最小限のデータのみ返す。
--   機密データ（gm_costs, license_fee等）は一切返さない。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_available_scenario_keys()
RETURNS TABLE(organization_id UUID, scenario_master_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT os.organization_id, os.scenario_master_id
  FROM public.organization_scenarios os
  JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
  WHERE os.org_status = 'available'
    AND sm.master_status = 'approved';
$$;

-- 匿名ユーザーも実行可能にする
GRANT EXECUTE ON FUNCTION public.get_public_available_scenario_keys() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_available_scenario_keys() TO authenticated;

COMMENT ON FUNCTION public.get_public_available_scenario_keys() IS 
  '公開中かつ承認済みのシナリオキー（organization_id, scenario_master_id）を返す。未ログインユーザーでも実行可能。';
