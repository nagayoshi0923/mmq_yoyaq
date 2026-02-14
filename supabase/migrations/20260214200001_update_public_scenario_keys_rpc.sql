-- ============================================================
-- 公開シナリオキーRPC関数の更新
-- ============================================================
-- 変更点:
--   1. org_status カラムを追加で返す
--   2. coming_soon のシナリオも返す（貸切募集用）
--   3. unavailable（中止）は引き続き除外
--
-- ルール:
--   available（公開）   → 通常表示（公演日程あり）
--   coming_soon（近日公開） → 「貸切受付中」として表示
--   unavailable（中止）  → 非表示
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_available_scenario_keys()
RETURNS TABLE(organization_id UUID, scenario_master_id UUID, org_status TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT os.organization_id, os.scenario_master_id, os.org_status::TEXT
  FROM public.organization_scenarios os
  JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
  WHERE sm.master_status = 'approved'
    AND os.org_status IN ('available', 'coming_soon');
$$;

-- 権限を再付与（CREATE OR REPLACE で消えることがあるため）
GRANT EXECUTE ON FUNCTION public.get_public_available_scenario_keys() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_available_scenario_keys() TO authenticated;
